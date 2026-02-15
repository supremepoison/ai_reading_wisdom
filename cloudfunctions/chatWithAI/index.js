// cloudfunctions/chatWithAI/index.js
const cloud = require('wx-server-sdk')
const axios = require('axios')
const { CONFIG, PROMPT_TEMPLATE, NOTE_PROMPT_TEMPLATE } = require('./constants')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { type, message, dialogId, history = [], bookName, chapter, context: eventContext } = event

    // 1. 获取配置 (优先取环境变量，其次取 defaultValue)
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL

    console.log('🤖 [Chat Debug] Config:', { type, baseUrl, model });

    if (!apiKey) {
        return { code: -1, msg: 'API Key 未配置，请在云函数环境变量设置 AI_API_KEY' }
    }

    try {
        let systemContent = '';
        let finalMessages = [];

        // 2. 根据类型选择 Prompt 和逻辑
        if (type === 'generate_note') {
            const { bookTitle, bookName: bName, chapter: noteChapter, answers } = eventContext || {};
            const finalBookName = bookTitle || bName || event.bookTitle || event.bookName || '书本';
            const finalChapter = noteChapter || event.chapter || '这一章';
            const finalAnswers = answers || [];

            console.log('📝 [Note Debug] Data:', { finalBookName, finalChapter, answerCount: finalAnswers.length });

            const answersText = finalAnswers.map(item => `问：${item.q}\n答：${item.a}`).join('\n\n');

            systemContent = NOTE_PROMPT_TEMPLATE
                .replace(/\${bookName}/g, finalBookName)
                .replace(/\${chapter}/g, finalChapter);

            finalMessages = [
                { role: 'system', content: systemContent },
                { role: 'user', content: `基于以下回答生成感悟：\n\n${answersText || '（用户未提供回答，请尝试根据章节内容生成）'}` }
            ];
        } else {
            // 传统对话模式
            const contextInfo = chapter ? `第${chapter}` : '未指定章节';
            const currentBook = bookName || '当前读物';

            systemContent = PROMPT_TEMPLATE
                .replace(/\${bookName}/g, currentBook)
                .replace(/\${chapter}/g, contextInfo);

            finalMessages = [{ role: 'system', content: systemContent }, ...history];

            if (message) {
                const isFirstTurn = (history.length === 0);
                let finalUserContent = message;
                if (isFirstTurn) {
                    finalUserContent = `[系统强制指令：请严格扮演《${currentBook}》的书灵，只聊${contextInfo}内容]\n\n用户说：${message}`;
                }
                finalMessages.push({ role: 'user', content: finalUserContent });
            }
        }

        console.log('📝 [Chat Debug] Messages sent to AI:', JSON.stringify(finalMessages, null, 2));

        // 3. 调用 AI 接口
        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: finalMessages,
            temperature: type === 'generate_note' ? 0.3 : 0.7, // 生成感悟要求严谨一点
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.TIMEOUT
        })

        const aiReply = response.data?.choices?.[0]?.message?.content || '';

        if (!aiReply) {
            throw new Error('AI 返回内容为空');
        }

        // 4. 后续动作 (保存记录 & 奖励积分)
        if (type === 'generate_note') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const MAX_DAILY_POINTS = 15;

            // 1. 获取用户信息，检查限额
            const userRes = await db.collection('users').where({ openid: OPENID }).get();
            const user = userRes.data[0];
            let currentDailyPoints = user.last_point_date === todayStr ? (user.daily_points || 0) : 0;

            // 2. 检查该书该章节是否已经写过笔记并拿过分（同章节防刷）
            const existingNote = await db.collection('notes').where({
                openid: OPENID,
                book_name: finalBookName,
                chapter: finalChapter
            }).get();

            let pointsToAdd = 2;
            let isOverLimit = false;

            if (existingNote.data.length > 0) {
                // 已经拿过分了
                pointsToAdd = 0;
            } else if (currentDailyPoints >= MAX_DAILY_POINTS) {
                pointsToAdd = 0;
                isOverLimit = true;
            } else if (currentDailyPoints + pointsToAdd > MAX_DAILY_POINTS) {
                pointsToAdd = MAX_DAILY_POINTS - currentDailyPoints;
                isOverLimit = true;
            }

            // 3. 更新用户积分及每日统计
            const updateData = {
                updated_at: db.serverDate(),
                last_point_date: todayStr
            };

            if (pointsToAdd > 0) {
                updateData.points = db.command.inc(pointsToAdd);
                updateData.daily_points = (user.last_point_date === todayStr) ? db.command.inc(pointsToAdd) : pointsToAdd;
            } else if (user.last_point_date !== todayStr) {
                updateData.daily_points = 0;
            }

            await db.collection('users').where({ openid: OPENID }).update({ data: updateData });

            // 4. 保存笔记
            await db.collection('notes').add({
                data: {
                    openid: OPENID,
                    book_name: finalBookName,
                    chapter: finalChapter,
                    content: aiReply,
                    points_earned: pointsToAdd,
                    created_at: db.serverDate()
                }
            })
        } else {
            // 保存对话记录
            const logContent = {
                openid: OPENID,
                messages: [
                    { role: 'user', content: message, created_at: new Date() },
                    { role: 'assistant', content: aiReply, created_at: new Date() }
                ],
                book_name: bookName,
                chapter: chapter,
                updated_at: db.serverDate()
            };

            if (dialogId) {
                await db.collection('dialogs').doc(dialogId).update({
                    data: {
                        messages: db.command.push(logContent.messages),
                        updated_at: db.serverDate()
                    }
                })
            } else {
                await db.collection('dialogs').add({
                    data: { ...logContent, created_at: db.serverDate() }
                })
            }
        }

        return {
            code: 0,
            reply: aiReply,
            dialogId: dialogId,
            pointsEarned: type === 'generate_note' ? pointsToAdd : 0
        }

    } catch (err) {
        console.error('Chat Error:', err.response?.data || err.message);
        return {
            code: -500,
            msg: 'AI 响应失败，请稍后重试',
            error: err.response?.data || err.message
        }
    }
}
