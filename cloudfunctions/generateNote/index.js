// cloudfunctions/generateNote/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

// 复用配置
const DEFAULT_CONFIG = {
    DEFAULT_API_KEY: '',
    DEFAULT_BASE_URL: 'https://api.deepseek.com',
    DEFAULT_MODEL: 'deepseek-chat'
}

exports.main = async (event, context) => {
    const { bookName, chapter, questions, answers } = event
    const db = cloud.database()
    const { OPENID } = cloud.getWXContext()

    // 获取配置
    const apiKey = process.env.AI_API_KEY || DEFAULT_CONFIG.DEFAULT_API_KEY
    const baseUrl = process.env.AI_BASE_URL || DEFAULT_CONFIG.DEFAULT_BASE_URL
    const model = process.env.AI_MODEL || DEFAULT_CONFIG.DEFAULT_MODEL

    console.log('📝 [Note Debug]', { bookName, chapter, answersCount: answers?.length })

    if (!apiKey) {
        return { code: -1, msg: 'API Key 未配置' }
    }

    try {
        // 拼接用户输入
        const inputs = questions.map((q, i) => `问题：${q}\n回答：${answers[i] || '(无)'}`).join('\n\n')

        const systemPrompt = `你是一位擅长帮助学生写读后感的语文老师。
你的任务是根据学生的零散回答，帮他们润色成一篇完整、通顺、有深度的读后感。

【规则】
1. 字数控制在 200-300 字。
2. 保留学生的原意和个人风格，不要过度华丽。
3. 语气真诚，符合学生的口吻。
4. 结构清晰：开头引入 → 中间展开 → 结尾升华。
5. 直接输出读后感内容，不要包含"读后感"等标题。`

        const userPrompt = `我刚读完《${bookName}》${chapter ? '的' + chapter : ''}。
以下是我回答的几个问题：

${inputs}

请帮我润色成一篇读后感。`

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]

        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: messages,
            temperature: 0.8,
            max_tokens: 800
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        })

        const generatedNote = response.data.choices[0].message.content.trim()
        console.log('✨ [Note Debug] Generated:', generatedNote.substring(0, 50) + '...')

        // 保存到数据库
        const noteRecord = {
            openid: OPENID,
            book_name: bookName,
            chapter: chapter,
            questions: questions,
            answers: answers,
            generated_note: generatedNote,
            created_at: db.serverDate()
        }

        const saveResult = await db.collection('notes').add({ data: noteRecord })
        console.log('💾 [Note Debug] Saved:', saveResult._id)

        // 增加积分奖励 (写感悟 +30 积分)
        const POINTS_AWARD = 30;
        await db.collection('users').where({
            openid: OPENID
        }).update({
            data: {
                points: db.command.inc(POINTS_AWARD),
                updated_at: db.serverDate()
            }
        })

        return {
            code: 0,
            data: {
                note: generatedNote,
                noteId: saveResult._id,
                pointsEarned: POINTS_AWARD
            }
        }

    } catch (err) {
        console.error('Note Generation Error:', err)
        return {
            code: -500,
            msg: '生成失败',
            error: err.message
        }
    }
}
