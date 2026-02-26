// cloudfunctions/smartDialogueAgent/index.js

const cloud = require('wx-server-sdk');
const axios = require('axios');
const { classifyIntent } = require('./intentClassifier');
const { CONFIG, CHAT_PROMPT, PLANNER_PROMPT, OPTIMIZER_PROMPT } = require('./constants');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ========== 主入口 ==========

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext();
    const { message, history = [], bookName, chapter } = event;
    const isFirstMessage = (history.length === 0);

    console.log('🧠 [SmartAgent] 收到消息:', message);

    try {
        // ========== Step 1: 获取用户上下文 ==========
        console.time('📊 [Context]');
        const userContext = await getUserContext(OPENID, bookName, chapter);
        console.timeEnd('📊 [Context]');
        console.log('📊 [SmartAgent] 用户上下文已就绪');

        // ========== Step 2: 意图识别 ==========
        console.time('🎯 [Intent]');
        const intentResult = await classifyIntent(message, userContext);
        console.timeEnd('🎯 [Intent]');
        console.log('🎯 [SmartAgent] 意图:', intentResult.intent, '置信度:', intentResult.confidence);

        // ========== Step 3: 能力路由 ==========
        console.time('🤖 [Agent]');
        let agentResponse;

        // 特殊指令拦截：接受计划的预设文案
        if (message === "就按这个计划来吧！") {
            agentResponse = {
                type: 'chat',
                message: '✅ 我已经记下啦！那我们就按这个新计划努力吧！如果你准备好了，随时可以继续跟我聊聊书里的内容哦～',
                source: 'system'
            };
            intentResult.intent = 'reporting'; // 改为 reporting 或 chatting，避免覆盖为 planning
        } else {
            switch (intentResult.intent) {
                case 'planning':
                    agentResponse = await plannerAgent(message, userContext, history);
                    break;

                case 'query_plan':
                    agentResponse = await queryPlanHandler(userContext);
                    break;

                case 'query_progress':
                    agentResponse = await queryProgressHandler(userContext);
                    break;

                case 'query_notes':
                    agentResponse = await queryNotesHandler(userContext);
                    break;

                case 'book_recommendation':
                    agentResponse = await recommendationHandler(userContext);
                    break;

                case 'quiz_request':
                    agentResponse = await quizRequestHandler();
                    break;

                case 'encouragement':
                    agentResponse = await encouragementHandler(message, userContext);
                    break;

                case 'adjusting':
                    agentResponse = await optimizerAgent(message, userContext, history);
                    break;

                case 'reporting':
                    agentResponse = await reportingHandler(message, userContext);
                    break;

                case 'seeking_help':
                    agentResponse = await helpHandler(message);
                    break;

                case 'off_topic':
                    agentResponse = {
                        type: 'chat',
                        message: `🤫 嘘...我是住在《${userContext.bookName}》里的书灵，外面的世界我不太懂呢。\n\n我们还是来做个小侦探，聊聊第${userContext.chapterIndex + 1}回的故事吧！你准备好了吗？`,
                        source: 'system'
                    };
                    break;

                case 'chatting':
                default:
                    agentResponse = await chatAgent(message, userContext, history);
                    break;
            }
        }
        console.timeEnd('🤖 [Agent]');

        // ========== Step 4: 结果融合 ==========
        const finalResponse = synthesizeResponse(agentResponse, userContext, intentResult, isFirstMessage);

        // ========== Step 5: 保存对话日志 ==========
        await saveDialogLog(OPENID, message, finalResponse, intentResult, bookName, chapter);

        return {
            code: 0,
            reply: finalResponse.message,
            type: finalResponse.type || 'chat',
            intent: intentResult.intent,
            confidence: intentResult.confidence,
            plan: finalResponse.plan || null,
            source: finalResponse.source || 'unknown'
        };

    } catch (err) {
        console.error('❌ [SmartAgent] 主流程错误:', err.response?.data || err.message);
        return {
            code: -500,
            reply: '唔，我刚才走神了，能再说一遍吗？',
            type: 'error',
            error: err.message
        };
    }
};

// ========== 用户上下文感知 ==========

async function getUserContext(openid, bookName, chapter) {
    try {
        // 并行查询用户数据和阅读进度
        const [userRes, progressRes, recentQuizRes] = await Promise.all([
            db.collection('users').where({ openid }).get(),
            db.collection('user_progress').where({ openid, status: 'reading' })
                .orderBy('last_read_at', 'desc').limit(1).get(),
            db.collection('quiz_records').where({ openid })
                .orderBy('created_at', 'desc').limit(5).get()
        ]);

        const user = userRes.data[0] || {};
        const progress = progressRes.data[0] || {};

        // 并行获取具体书本信息（为了获取总章节数）
        let totalChapters = 0;
        if (progress.book_id) {
            const bookRes = await db.collection('books').doc(progress.book_id).get();
            if (bookRes.data) {
                totalChapters = bookRes.data.total_chapters || 0;
            }
        }

        // 计算距离上次打卡天数
        let daysSinceCheckin = 0;
        if (user.last_checkin_date) {
            const lastDate = new Date(user.last_checkin_date);
            const today = new Date();
            daysSinceCheckin = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        }

        // 计算最近闯关准确率
        let quizAccuracy = 0;
        if (recentQuizRes.data.length > 0) {
            const totalCorrect = recentQuizRes.data.reduce((sum, q) => sum + (q.correct_count || 0), 0);
            const totalQuestions = recentQuizRes.data.reduce((sum, q) => sum + (q.total_questions || 1), 0);
            quizAccuracy = Math.round((totalCorrect / totalQuestions) * 100);
        }

        return {
            bookName: bookName || progress.book_name || '当前读物',
            chapter: chapter || `第${(progress.current_chapter_index || 0) + 1}回`,
            chapterIndex: progress.current_chapter_index || 0,
            totalChapters: totalChapters,
            level: Number(user.level) || 1,
            streak: user.continuous_days || 0,
            daysSinceCheckin,
            quizAccuracy,
            points: user.points || 0,
            readingSpeed: '每天约1回'  // 简化版，后续可细化
        };
    } catch (err) {
        console.error('⚠️ [Context] 获取用户上下文失败:', err.message);
        return {
            bookName: bookName || '当前读物',
            chapter: chapter || '当前章节',
            chapterIndex: 0,
            streak: 0,
            daysSinceCheckin: 0,
            quizAccuracy: 0,
            points: 0,
            readingSpeed: '未知'
        };
    }
}

// ========== 对话 Agent（苏格拉底式引导） ==========

async function chatAgent(message, userContext, history) {
    const cozeBotId = process.env.COZE_BOT_ID;
    const cozeToken = process.env.COZE_API_TOKEN;

    // 如果配置了 Coze，走 RAG 增强路径
    if (cozeBotId && cozeToken) {
        return await chatViaCoze(message, userContext, history, cozeBotId, cozeToken);
    }

    // 否则降级为 DeepSeek 直连（无 RAG）
    console.log('⚠️ [Chat] Coze 未配置，降级为 DeepSeek 直连');
    return await chatViaDeepSeek(message, userContext, history);
}

/**
 * 通过 Coze Agent API 对话（RAG 增强）
 * Coze 内部自动完成：向量检索知识库 → 拼接原文 → LLM 生成回答
 */
async function chatViaCoze(message, userContext, history, botId, token) {
    console.log('📚 [Coze RAG] 调用 Coze Agent，书籍:', userContext.bookName, '章节:', userContext.chapter);

    // 将历史记录转换为 Coze 格式
    const chatHistory = history.map(h => ({
        role: h.role === 'ai' ? 'assistant' : h.role,
        content: h.content || h.text || '',
        content_type: 'text'
    }));

    // 构造带上下文的查询，帮助 Coze 精准检索
    const contextualQuery = `[当前阅读：《${userContext.bookName}》${userContext.chapter}]\n\n${message}`;

    const requestPayload = {
        bot_id: botId,
        user_id: userContext.openid || 'anonymous',
        stream: false,
        additional_messages: [
            ...chatHistory,
            {
                role: 'user',
                content: contextualQuery,
                content_type: 'text'
            }
        ]
    };

    console.log('📤 [Coze] 请求参数:', JSON.stringify({
        bot_id: botId,
        user_id: requestPayload.user_id,
        query: contextualQuery,
        history_count: chatHistory.length
    }));

    try {
        const response = await axios.post(
            'https://api.coze.cn/v3/chat',
            requestPayload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: CONFIG.TIMEOUT
            }
        );

        const data = response.data?.data;
        console.log('📥 [Coze] 响应状态:', data?.status, 'chat_id:', data?.id, 'conversation_id:', data?.conversation_id);

        // Coze v3 非流式返回：需要轮询获取结果
        if (data?.id && data?.status === 'in_progress') {
            console.log('⏳ [Coze] 任务进行中，开始轮询...');
            return await pollCozeResult(data.id, data.conversation_id, token);
        }

        // 如果直接返回了结果
        if (data?.status === 'completed') {
            const messages = data.messages || [];
            console.log('📋 [Coze] 直接返回消息数:', messages.length);
            const answerMsgs = messages.filter(m => m.role === 'assistant' && m.type === 'answer');
            if (answerMsgs.length > 0) {
                // 取最后一条 answer（跳过开场白，取实质回复）
                const finalAnswer = answerMsgs[answerMsgs.length - 1].content;
                console.log('✅ [Coze] RAG 回复(前100字):', finalAnswer.substring(0, 100));
                return { type: 'chat', message: finalAnswer, source: 'coze_rag' };
            }
        }

        console.warn('⚠️ [Coze] 未获取到有效回复，完整响应:', JSON.stringify(response.data));
        console.log('🔄 [Coze→DeepSeek] 降级到 DeepSeek 直连');
        return await chatViaDeepSeek(message, userContext, history);

    } catch (err) {
        console.error('❌ [Coze] 调用失败:', JSON.stringify({
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message
        }));
        console.log('🔄 [Coze→DeepSeek] 异常降级到 DeepSeek 直连');
        return await chatViaDeepSeek(message, userContext, history);
    }
}

/**
 * 轮询 Coze 异步对话结果（v3 非流式模式）
 */
async function pollCozeResult(chatId, conversationId, token, maxRetries = 8) {
    for (let i = 0; i < maxRetries; i++) {
        console.log(`⏳ [Coze Poll] 第 ${i + 1}/${maxRetries} 次轮询...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 每 2 秒轮询一次，腾出 CPU

        try {
            const res = await axios.get(
                `https://api.coze.cn/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 10000
                }
            );

            const chat = res.data?.data;
            console.log(`📊 [Coze Poll] 状态: ${chat?.status}, usage: ${JSON.stringify(chat?.usage || {})}`);

            if (chat?.status === 'completed') {
                const msgRes = await axios.get(
                    `https://api.coze.cn/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`,
                    {
                        headers: { 'Authorization': `Bearer ${token}` },
                        timeout: 10000
                    }
                );

                const messages = msgRes.data?.data || [];
                console.log(`📋 [Coze Poll] 消息列表(${messages.length}条):`, messages.map(m => `[${m.role}/${m.type}] ${(m.content || '').substring(0, 50)}`));

                const answerMsgs = messages.filter(m => m.role === 'assistant' && m.type === 'answer');

                if (answerMsgs.length > 0) {
                    // 取最后一条 answer（跳过开场白，取实质回复）
                    const finalAnswer = answerMsgs[answerMsgs.length - 1].content;
                    console.log('✅ [Coze RAG] 最终回复:', finalAnswer);
                    console.log('✅ [Coze RAG] 回复总长度:', finalAnswer.length, '字');
                    return { type: 'chat', message: finalAnswer, source: 'coze_rag' };
                }

                console.warn('⚠️ [Coze Poll] completed 但无 answer 消息');
                break;
            }

            if (chat?.status === 'failed') {
                console.error('❌ [Coze Poll] 对话失败:', JSON.stringify(chat.last_error));
                break;
            }
        } catch (err) {
            console.warn('⚠️ [Coze Poll] 轮询异常:', err.message);
        }
    }

    console.error('❌ [Coze Poll] 超时或无结果，返回兜底回复');
    return { type: 'chat', message: '唔，我翻书翻太久了，能再问一遍吗？', source: 'coze_timeout' };
}

/**
 * 通过 DeepSeek 直连对话（无 RAG，降级方案）
 */
async function chatViaDeepSeek(message, userContext, history) {
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL;
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL;

    const systemPrompt = CHAT_PROMPT
        .replace(/\$\{bookName\}/g, userContext.bookName)
        .replace(/\$\{chapter\}/g, userContext.chapter);

    const messages = [{ role: 'system', content: systemPrompt }, ...history];

    const isFirstTurn = (history.length === 0);
    let finalUserContent = message;
    if (isFirstTurn) {
        finalUserContent = `[系统强制指令：请严格扮演《${userContext.bookName}》的书灵，只聊${userContext.chapter}内容]\n\n用户说：${message}`;
    }
    messages.push({ role: 'user', content: finalUserContent });

    const response = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages,
        temperature: 0.7,
        stream: false
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: CONFIG.TIMEOUT
    });

    return {
        type: 'chat',
        message: response.data?.choices?.[0]?.message?.content || '唔，我刚才走神了…',
        source: 'deepseek_fallback'
    };
}

// ========== 规划 Agent ==========

async function plannerAgent(message, userContext, history) {
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL;
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL;

    const systemPrompt = PLANNER_PROMPT
        .replace(/\$\{bookName\}/g, userContext.bookName)
        .replace(/\$\{chapter\}/g, userContext.chapter)
        .replace(/\$\{readingSpeed\}/g, userContext.readingSpeed)
        .replace(/\$\{streak\}/g, userContext.streak)
        .replace(/\$\{userRequest\}/g, message);

    const response = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        stream: false
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: CONFIG.TIMEOUT
    });

    const content = response.data?.choices?.[0]?.message?.content;
    let plan = null;

    try {
        plan = JSON.parse(content);
    } catch (e) {
        console.warn('⚠️ [Planner] JSON 解析失败，返回原文');
        return {
            type: 'chat',
            message: content || '抱歉，我暂时无法生成计划，请稍后再试。'
        };
    }

    // 格式化计划为可读文本
    const planText = formatPlan(plan);

    return {
        type: 'plan',
        message: `✅ 学习计划已生成！\n\n${planText}\n\n你觉得这个计划怎么样？`,
        plan: plan
    };
}

/**
 * 格式化计划为友好文本
 */
function formatPlan(plan) {
    if (!plan || !plan.daily_tasks) return '暂无计划详情';

    let text = `📅 ${plan.plan_name || '学习计划'}\n`;
    if (plan.strategy) {
        text += `💡 策略：${plan.strategy}\n\n`;
    }

    plan.daily_tasks.forEach((task, i) => {
        text += `□ ${task.day || `第${i + 1}天`} - ${task.task} (${task.estimated_time || '20分钟'})\n`;
    });

    return text;
}

// ========== 优化 Agent（异常检测与干预） ==========

async function optimizerAgent(message, userContext, history) {
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL;
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL;

    const systemPrompt = OPTIMIZER_PROMPT
        .replace(/\$\{daysSince\}/g, userContext.daysSinceCheckin)
        .replace(/\$\{completionRate\}/g, '未知')
        .replace(/\$\{quizAccuracy\}/g, userContext.quizAccuracy)
        .replace(/\$\{userMessage\}/g, message);

    const response = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ],
        temperature: 0.7,
        stream: false
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: CONFIG.TIMEOUT
    });

    return {
        type: 'optimize',
        message: response.data?.choices?.[0]?.message?.content || '我可以帮你调整学习计划，减轻压力～'
    };
}

// ========== 进度汇报处理 ==========

async function reportingHandler(message, userContext) {
    const { streak, chapter, bookName } = userContext;

    let reply = `📖 收到！你正在读《${bookName}》${chapter}。`;

    if (streak >= 7) {
        reply += `\n\n🔥 太厉害了！你已经连续打卡 ${streak} 天，坚持就是胜利！`;
    } else if (streak >= 3) {
        reply += `\n\n👍 连续 ${streak} 天了，继续保持！`;
    }

    reply += '\n\n要不要我帮你制定下一阶段的学习计划？或者聊聊这一章的内容？';

    return {
        type: 'chat',
        message: reply
    };
}

// ========== 计划查询处理 ==========

async function queryPlanHandler(userContext) {
    const { OPENID } = cloud.getWXContext();
    try {
        const planRes = await db.collection('study_plans')
            .where({ openid: OPENID, status: 'active' })
            .orderBy('created_at', 'desc')
            .limit(1)
            .get();

        if (planRes.data.length === 0) {
            return {
                type: 'chat',
                message: '📢 我还没看到你近期的学习计划呢。要不要我现在帮你做一个？你可以告诉我你想在几天内读完这本书。',
                source: 'system'
            };
        }

        const plan = planRes.data[0].plan;
        const planText = formatPlan(plan);

        return {
            type: 'chat',
            message: `📅 这是你现在的学习计划：\n\n${planText}\n\n加油，只要每天坚持一点点，目标就能实现！`,
            source: 'system'
        };
    } catch (err) {
        console.error('⚠️ [QueryPlan] 失败:', err.message);
        return { type: 'chat', message: '唔，我翻了一下计划本没找到，能稍后再试试吗？' };
    }
}

// ========== 进度查询处理 ==========

async function queryProgressHandler(userContext) {
    const { bookName, chapter, chapterIndex, totalChapters, streak, points, quizAccuracy } = userContext;

    let remainingMsg = '';
    if (totalChapters > 0) {
        const remainingChapters = Math.max(0, totalChapters - (chapterIndex + 1));
        if (remainingChapters === 0) {
            remainingMsg = `\n\n🎉 哇！你已经读完这本书啦！太棒了！`;
        } else {
            remainingMsg = `\n\n🕒 **预计剩余**：由于你每天读 1 回，大约还需要 **${remainingChapters}** 天就能读完《${bookName}》啦！加油哦！`;
        }
    }

    return {
        type: 'chat',
        message: `📊 你的阅读“成绩单”来啦：
        
- **正在阅读**：《${bookName}》
- **当前进度**：${chapter}
- **连续打卡**：${streak} 天
- **累计积分**：${points} 分
- **闯关准确率**：${quizAccuracy}%${remainingMsg}

${streak > 0 ? '✨ 每一天的坚持都在闪闪发光！' : '🌱 还没开始正式打卡吗？没关系，现在就开始第一步吧！'}`,
        source: 'system'
    };
}

// ========== 推荐处理 ==========

async function recommendationHandler(userContext) {
    try {
        // 获取当前等级及以下推荐书籍
        const booksRes = await db.collection('books')
            .where({
                recommend_level: _.lte(userContext.level || 1)
            })
            .limit(3)
            .get();

        let recommendations = booksRes.data.map(b => `《${b.title}》：${b.description || '开启智慧之旅'}`);

        // 兜底静态推荐
        if (recommendations.length === 0) {
            recommendations = [
                "《西游记》：感受齐天大圣的七十二变与取经路上的奇幻冒险！",
                "《草房子》：走进曹文轩老师笔下的纯净童年世界。",
                "《中国古代神话》：探索中华文明的起源与浪漫想象。"
            ];
        }

        let message = `💡 根据你当前的等级 L${userContext.level || 1}，我为你挑选了以下好书：\n\n`;
        recommendations.forEach((rec, i) => {
            message += `${i + 1}. ${rec}\n`;
        });
        message += `\n这些书都非常适合在这个阶段阅读哦！`;

        return {
            type: 'chat',
            message,
            source: 'system'
        };
    } catch (err) {
        console.error('❌ [Recommend] Error:', err);
        return {
            type: 'chat',
            message: '唔，正在努力为你翻找适合的书籍...我们可以先继续聊聊现在的这本书哦！',
            source: 'system'
        };
    }
}

// ========== 闯关请求处理 ==========

async function quizRequestHandler() {
    return {
        type: 'chat',
        message: '🎮 准备好接受挑战了吗？点击下方的“闯关”标签页，就可以开始今天的知识大闯关啦！我在终点等你哦～',
        source: 'system'
    };
}

// ========== 鼓励处理 ==========

async function encouragementHandler(message, userContext) {
    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL;
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL;

    const systemPrompt = `你是一位温柔、博学且充满爱的"书灵"导师，专门通过文字陪伴和鼓励正在阅读的孩子。
    
    【当前上下文】
    - 书籍：《${userContext.bookName}》
    - 打卡天数：${userContext.streak}
    - 用户情绪：${userContext.emotion || '需要鼓励'}
    
    【任务】
    1. 根据用户的消息提供积极、深切的鼓励。
    2. 结合书籍的主题或角色的精神来激励孩子（例如：像孙悟空一样勇敢）。
    3. 语气要像大哥哥/大姐姐一样亲切，多使用拟声词和表情。
    4. 回复控制在150字以内。`;

    try {
        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            temperature: 0.8,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.TIMEOUT
        });

        return {
            type: 'chat',
            message: response.data?.choices?.[0]?.message?.content || '你已经做得很棒了！我会一直陪在你身边的。🌟',
            source: 'deepseek_encouragement'
        };
    } catch (err) {
        return {
            type: 'chat',
            message: `✨ 你真的很厉害哦！哪怕是一小步，也是通往智慧的重要一步。在《${userContext.bookName}》的世界里，每个读者都是最伟大的探险家！加油！`,
            source: 'system'
        };
    }
}

// ========== 帮助处理 ==========

async function helpHandler(message) {
    return {
        type: 'chat',
        message: `📚 智慧之匙使用指南：

1. **打卡**：在「打卡」页面点击打卡按钮即可记录今日阅读
2. **书灵**：就是我们现在聊天的地方！你可以和我讨论书里的内容
3. **感悟**：在「感悟」页面回答几个小问题，我帮你生成读后感
4. **闯关**：在「闯关」页面完成答题挑战获得积分
5. **积分**：打卡+1分，闯关根据答对题数得分，在「我的」页面查看

还有什么不明白的，随时问我！😊`
    };
}

// ========== 感悟查询处理 ==========

async function queryNotesHandler(userContext) {
    const { OPENID } = cloud.getWXContext();
    try {
        const notesRes = await db.collection('notes')
            .where({ openid: OPENID })
            .orderBy('created_at', 'desc')
            .limit(3)
            .get();

        if (notesRes.data.length === 0) {
            return {
                type: 'chat',
                message: '🎨 我翻遍了你的日记本，还没看到写下的感悟呢。要不要读完今天的章节后去“感悟”页面留下一段文字？我会帮你润色得很漂亮哦！',
                source: 'system'
            };
        }

        let reply = '📝 我帮你找到了之前写下的感悟：\n';
        notesRes.data.forEach((note, i) => {
            const date = new Date(note.created_at).toLocaleDateString('zh-CN');
            reply += `\n【${note.book_name} - ${note.chapter || ''}】(${date})\n${note.generated_note}\n`;
        });

        if (notesRes.data.length >= 3) {
            reply += '\n（仅显示最近3条，去“感悟”页面可以看全部哦～）';
        }

        return {
            type: 'chat',
            message: reply,
            source: 'system'
        };
    } catch (err) {
        console.error('⚠️ [QueryNotes] 失败:', err.message);
        return { type: 'chat', message: '唔，笔记由于某种魔法暂时打不开了，请稍后再试试吧！' };
    }
}

// ========== 结果融合 ==========

function synthesizeResponse(agentResponse, userContext, intentResult, isFirstMessage = false) {
    const { daysSinceCheckin, streak } = userContext;

    // Markdown 转纯文本（Coze 返回的是 Markdown 格式）
    if (agentResponse.message) {
        agentResponse = { ...agentResponse, message: stripMarkdown(agentResponse.message) };
    }

    // 仅在当天首次对话 + 长期未学习时，才显示欢迎回来
    if (isFirstMessage && daysSinceCheckin >= 3 && intentResult.intent !== 'adjusting' && intentResult.intent !== 'seeking_help') {
        return {
            ...agentResponse,
            message: `👋 欢迎回来！你已经 ${daysSinceCheckin} 天没来了，没关系，我们继续～\n\n${agentResponse.message}`
        };
    }

    // 如果用户完成里程碑（连续打卡是 5 的倍数），主动建议下一步
    if (isFirstMessage && intentResult.intent === 'reporting' && streak > 0 && streak % 5 === 0) {
        return {
            ...agentResponse,
            message: `${agentResponse.message}\n\n🎉 恭喜！你已经连续打卡 ${streak} 天了！要不要挑战一下闯关？`
        };
    }

    return agentResponse;
}

/**
 * 将 Markdown 格式转为纯文本（供聊天气泡展示）
 */
function stripMarkdown(text) {
    if (!text) return text;
    return text
        .replace(/^#{1,6}\s+/gm, '')           // 去掉标题 # ## ###
        .replace(/\*\*(.+?)\*\*/g, '$1')        // **粗体** → 粗体
        .replace(/\*(.+?)\*/g, '$1')            // *斜体* → 斜体
        .replace(/__(.+?)__/g, '$1')            // __粗体__ → 粗体
        .replace(/_(.+?)_/g, '$1')              // _斜体_ → 斜体
        .replace(/~~(.+?)~~/g, '$1')            // ~~删除线~~ → 删除线
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `代码` → 代码
        .replace(/^\s*[-*+]\s+/gm, '• ')        // - 列表 → • 列表
        .replace(/^\s*\d+\.\s+/gm, '')          // 1. 有序列表 → 去掉序号
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [链接](url) → 链接
        .replace(/^>\s?/gm, '')                 // > 引用 → 去掉引用符
        .replace(/---+/g, '')                    // --- 分隔线 → 去掉
        .replace(/\n{3,}/g, '\n\n')              // 多个空行合并
        .trim();
}

// ========== 对话日志 ==========

async function saveDialogLog(openid, userMessage, response, intentResult, bookName, chapter) {
    try {
        await db.collection('dialogs').add({
            data: {
                openid,
                messages: [
                    { role: 'user', content: userMessage, created_at: new Date() },
                    { role: 'assistant', content: response.message, type: response.type, created_at: new Date() }
                ],
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                book_name: bookName,
                chapter,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });
    } catch (err) {
        console.error('⚠️ [Log] 保存对话日志失败:', err.message);
        // 日志保存失败不影响主流程
    }
}
