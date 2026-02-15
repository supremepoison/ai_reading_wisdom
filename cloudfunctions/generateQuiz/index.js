// cloudfunctions/generateQuiz/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const { CONFIG } = require('./constants')

exports.main = async (event, context) => {
    const { bookName, chapter, level } = event
    const quizLevel = level || 1; // 1:基础, 2:理解, 3:挑战
    const db = cloud.database()

    // 1. 获取配置
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL

    console.log('📝 [Quiz Debug]', { bookName, chapter, quizLevel, baseUrl, model });

    try {
        // 1. [缓存优先] 查数据库 'questions' 集合，匹配书名、章节和等级
        const dbRes = await db.collection('questions').where({
            book_name: bookName,
            chapter: chapter,
            level: quizLevel
        }).get();

        if (dbRes.data.length > 0) {
            console.log(`✨ [Quiz Debug] Found Level ${quizLevel} questions in DB.`);
            const firstDoc = dbRes.data[0];
            const finalQuestions = firstDoc.questions || [];

            if (finalQuestions.length > 0) {
                return {
                    code: 0,
                    data: finalQuestions,
                    source: 'database'
                };
            }
        }

        console.log(`💨 [Quiz Debug] DB Miss for Level ${quizLevel}. Generating via AI...`);

        // 2. [生成题目]
        const levelNames = { 1: '基础题', 2: '理解题', 3: '挑战题' };
        const levelRequirements = {
            1: '考察基础情节、人物名称、核心事件等直观内容。',
            2: '考察人物动机、情节因果关系、隐含的深层含义等。',
            3: '考察细节挖掘、逻辑推理、甚至是作品背后的文化内涵或写作手法。'
        };

        const systemPrompt = `你是一位专业的阅读理解出题专家。你的任务是针对指定书籍章节生成高质量的单项选择题。
        
        【规则】
        1. **题目来源**：必须基于《${bookName || '未指定'}》${chapter ? '的第' + chapter : ''}内容。
        2. **题目数量**：生成 3 道题。
        3. **难度等级**：本次目标是【${levelNames[quizLevel]}】。要求：${levelRequirements[quizLevel]}
        4. **输出格式**：必须且只能输出一个 **纯 JSON 数组**。不要包含任何 Markdown 代码块或解释文字。格式：
        [
          {
            "id": 1,
            "question": "题目内容",
            "options": ["选项A", "选项B", "选项C", "选项D"],
            "answer": 0, // 0-3
            "explanation": "解析内容"
          }
        ]
        `

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `请开始出题，针对《${bookName}》${chapter}，生成 3 道难度为【${levelNames[quizLevel]}】的题目。` }
        ];

        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: messages,
            temperature: 0.4,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        })

        let rawContent = response.data.choices[0].message.content;
        rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        let questions = JSON.parse(rawContent);

        if (!Array.isArray(questions) && questions.questions) {
            questions = questions.questions;
        }

        // 格式化数据并过滤
        questions = questions.map((q, index) => ({
            id: index + 1,
            question: q.question,
            options: q.options || [],
            correctIndex: typeof q.answer === 'number' ? q.answer : 0,
            explanation: q.explanation || '暂无解析'
        })).filter(q => q.question && q.options.length > 0);

        // 3. [写入缓存]
        await db.collection('questions').add({
            data: {
                book_name: bookName,
                chapter: chapter,
                level: quizLevel,
                questions: questions,
                created_at: db.serverDate(),
                source: 'ai_generated'
            }
        });

        return {
            code: 0,
            data: questions,
            source: 'generated'
        }

    } catch (err) {
        console.error('Quiz Generation Error:', err);

        let errorMsg = err.message;
        if (err.errCode === -502001) {
            errorMsg = "数据库集合 'questions' 不存在，请在控制台创建";
        }

        return {
            code: -500,
            msg: errorMsg, // 返回更具体的错误
            error: err
        }
    }
}
