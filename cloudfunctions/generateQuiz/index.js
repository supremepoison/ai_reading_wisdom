// cloudfunctions/generateQuiz/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')
const { CONFIG } = require('./constants')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * generateQuiz 云函数 (带 Fallback AI 生成机制)
 * 接收：bookName, chapter, level
 * 返回：从数据库 questions 集合匹配到的 10 道题中随机抽取的 3 道题
 * 如果数据库中没有，则动态调用 AI 生成 10 道题，存入数据库，再随机返回 3 道
 */
exports.main = async (event, context) => {
    const { bookName, chapter, level } = event
    const quizLevel = level || 1; // 1:基础, 2:理解, 3:挑战
    const db = cloud.database()
    const _ = db.command

    // 获取配置 (如果需要动态生成)
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL

    console.log('📝 [Quiz Request]', { bookName, chapter, quizLevel });

    let pool = [];
    let isDbHit = false;

    try {
        // 1. 优先查数据库 'questions' 集合
        const dbRes = await db.collection('questions').where({
            book_name: bookName,
            chapter: chapter,
            level: quizLevel
        }).get();

        if (dbRes.data.length > 0 && dbRes.data[0].questions && dbRes.data[0].questions.length > 0) {
            console.log(`✨ [Quiz DB Hit] Found Level ${quizLevel} questions in DB.`);
            pool = dbRes.data[0].questions;
            isDbHit = true;
        } else {
            console.log(`💨 [Quiz DB Miss] Generating Level ${quizLevel} via AI Fallback...`);

            // 2. 数据库没找到，调用 AI 回退生成 10 道题
            const levelNames = { 1: '基础题', 2: '理解题', 3: '挑战题' };
            const levelRequirements = {
                1: '考察核心情节、人物名称、基础事件等直观内容。题目必须非常简单直接。',
                2: '考察人物动机、情节因果关系、隐含的深层含义等。需要一点点思考分析。',
                3: '考察细节挖掘、逻辑推理、词句赏析、乃至作品背后的文化内涵。'
            };

            const systemPrompt = `你是一位专业的阅读理解出题专家。你的任务是针对指定书籍章节生成高质量的单项选择题。

            【出题规则】
            1. **题目来源**：依据文学作品《${bookName}》${chapter}的内容进行出题。请调取你的内部知识库来回忆这部分情节。
            2. **难度等级**：Level ${quizLevel}（${levelNames[quizLevel]}）。要求：${levelRequirements[quizLevel]}
            3. **题目数量**：必须生成 **10** 道单项选择题。
            4. **内容准确**：绝对忠于原著，不能捏造情节。
            5. **输出格式**：必须且只能输出一个 **纯 JSON 数组**，不要包含任何 Markdown 代码块标签（如 \`\`\`json），也不要解释文字。
            
            格式范例：
            [
              {
                "id": 1,
                "question": "题目内容？",
                "options": ["选项A", "选项B", "选项C", "选项D"],
                "correctIndex": 0, 
                "explanation": "解析内容"
              }
            ]
            `;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `请开始出题，针对《${bookName}》${chapter}，生成 10 道难度为 Level ${quizLevel} 的题目。` }
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
                timeout: 120000 // 出10道题需要长一点的超时时间
            });

            let rawContent = response.data.choices[0].message.content;
            rawContent = rawContent.replace(/^```json\s*/im, '').replace(/\s*```$/im, '').trim();

            let questions = JSON.parse(rawContent);
            if (!Array.isArray(questions) && questions.questions) {
                questions = questions.questions;
            }

            // 规范化格式
            pool = questions.map((q, index) => {
                const ans = q.correctIndex !== undefined ? q.correctIndex : q.answer;
                return {
                    id: index + 1,
                    question: q.question || '',
                    options: q.options || [],
                    correctIndex: typeof ans === 'number' ? ans : 0,
                    explanation: q.explanation || '暂无解析'
                };
            }).filter(q => q.question && q.options.length > 0);

            // 写入数据库
            if (pool.length > 0) {
                console.log(`✅ [Quiz Fallback] Generated ${pool.length} questions. Saving to DB...`);
                await db.collection('questions').add({
                    data: {
                        book_name: bookName,
                        chapter: chapter,
                        level: quizLevel,
                        questions: pool,
                        created_at: db.serverDate(),
                        source: 'ai_fallback_generated'
                    }
                });
            } else {
                throw new Error("AI returned empty question list");
            }
        }

        // 3. 从题库池中随机抽取 3 道题
        let selectedQuestions = [];
        const poolSize = pool.length;

        if (poolSize <= 3) {
            selectedQuestions = [...pool];
            selectedQuestions.sort(() => 0.5 - Math.random());
        } else {
            const shuffled = [...pool].sort(() => 0.5 - Math.random());
            selectedQuestions = shuffled.slice(0, 3);
        }

        // 重新编号 1, 2, 3
        const finalData = selectedQuestions.map((q, index) => ({
            ...q,
            id: index + 1
        }));

        console.log(`✅ [Quiz Success] Selected 3/${poolSize} questions.`);

        return {
            code: 0,
            data: finalData,
            source: isDbHit ? 'pre_generated_pool' : 'fallback_generated'
        };

    } catch (err) {
        console.error('Quiz Generation/Query Error:', err);
        return {
            code: -500,
            msg: "服务器处理异常",
            error: err.message
        };
    }
}
