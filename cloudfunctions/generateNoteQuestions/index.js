// cloudfunctions/generateNoteQuestions/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const DEFAULT_CONFIG = {
    DEFAULT_API_KEY: '',
    DEFAULT_BASE_URL: 'https://api.deepseek.com',
    DEFAULT_MODEL: 'deepseek-chat'
}

exports.main = async (event, context) => {
    const { bookName, chapter } = event
    const db = cloud.database()

    console.log('📝 [NoteQ Debug]', { bookName, chapter })

    try {
        // 1. [缓存优先] 查数据库
        const dbRes = await db.collection('note_questions').where({
            book_name: bookName,
            chapter: chapter
        }).get()

        if (dbRes.data.length > 0) {
            console.log('✨ [NoteQ Debug] Hit Cache!')
            return {
                code: 0,
                data: dbRes.data[0].questions,
                source: 'database'
            }
        }

        console.log('💨 [NoteQ Debug] Cache Miss. Generating...')

        // 2. [AI 生成] 缓存没命中
        const apiKey = process.env.AI_API_KEY || DEFAULT_CONFIG.DEFAULT_API_KEY
        const baseUrl = process.env.AI_BASE_URL || DEFAULT_CONFIG.DEFAULT_BASE_URL
        const model = process.env.AI_MODEL || DEFAULT_CONFIG.DEFAULT_MODEL

        if (!apiKey) {
            // 没有 Key，返回默认问题
            return {
                code: 0,
                data: getDefaultQuestions(),
                source: 'default'
            }
        }

        const systemPrompt = `你是一位擅长引导学生思考的语文老师。
你的任务是针对学生刚读完的书籍章节，生成 5 个引导性问题，帮助他们写读后感。

【规则】
1. 问题要具体到这一章的内容，不能太泛
2. 问题要能激发思考，不是简单的问答题
3. 问题的难度要适合小学生
4. 每个问题前加一个合适的 emoji
5. **输出格式**：纯 JSON 数组，不要包含任何解释文字

示例输出：
["🦸‍♂️ 这一章里谁最让你佩服？", "🤔 如果你是xxx会怎么做？", ...]`

        const userPrompt = `请为《${bookName}》${chapter ? '的' + chapter : ''}生成 5 个读后感引导问题。`

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]

        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: messages,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        })

        let rawContent = response.data.choices[0].message.content
        console.log('📦 [NoteQ Debug] Raw:', rawContent)

        // 清洗数据
        rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim()
        let questions = JSON.parse(rawContent)

        if (!Array.isArray(questions)) {
            throw new Error('AI 返回的不是数组')
        }

        // 确保有 5 个问题
        questions = questions.slice(0, 5)
        while (questions.length < 5) {
            questions.push(getDefaultQuestions()[questions.length])
        }

        // 3. [写入缓存]
        await db.collection('note_questions').add({
            data: {
                book_name: bookName,
                chapter: chapter,
                questions: questions,
                created_at: db.serverDate(),
                source: 'ai_generated'
            }
        })
        console.log('💾 [NoteQ Debug] Saved to DB.')

        return {
            code: 0,
            data: questions,
            source: 'generated'
        }

    } catch (err) {
        console.error('NoteQ Error:', err)
        // 降级返回默认问题
        return {
            code: 0,
            data: getDefaultQuestions(),
            source: 'default',
            error: err.message
        }
    }
}

function getDefaultQuestions() {
    return [
        '🦸‍♂️ 你最喜欢的角色是谁？为什么？',
        '🤔 如果你是主角，你会怎么做？',
        '✨ 哪句话或哪个场景让你印象最深？',
        '💡 这一章告诉你什么道理？',
        '😄 用一个词形容你现在的感受。'
    ]
}
