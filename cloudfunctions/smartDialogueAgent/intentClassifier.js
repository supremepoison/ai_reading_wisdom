// cloudfunctions/smartDialogueAgent/intentClassifier.js
const axios = require('axios');
const { CONFIG, INTENT_PROMPT } = require('./constants');

const { matchFastIntent } = require('./fastIntent');

/**
 * 意图识别模块
 * 先进行快速正则匹配，未命中则调用 LLM
 *
 * @param {string} userMessage - 用户输入的消息
 * @param {object} userContext - 用户上下文信息
 * @returns {object} { intent, confidence, entities }
 */
async function classifyIntent(userMessage, userContext = {}) {
    // 1. 尝试快速正则匹配 (降低延迟)
    const fastMatch = matchFastIntent(userMessage);
    if (fastMatch) {
        return fastMatch;
    }

    const apiKey = process.env.AI_API_KEY || CONFIG.DEFAULT_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || CONFIG.DEFAULT_BASE_URL;
    const model = process.env.AI_MODEL || CONFIG.DEFAULT_MODEL;

    // 将上下文变量填入 Prompt 模板
    const filledPrompt = INTENT_PROMPT
        .replace(/\$\{bookName\}/g, userContext.bookName || '当前读物')
        .replace(/\$\{chapter\}/g, userContext.chapter || '当前章节')
        .replace(/\$\{streak\}/g, userContext.streak || 0)
        .replace(/\$\{daysSince\}/g, userContext.daysSinceCheckin || 0)
        .replace(/\$\{userMessage\}/g, userMessage);

    try {
        const response = await axios.post(`${baseUrl}/chat/completions`, {
            model: model,
            messages: [
                { role: 'system', content: filledPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.1,  // 意图识别需要高确定性，低温度
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: CONFIG.TIMEOUT
        });

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            console.warn('⚠️ [Intent] LLM 返回为空，使用默认意图');
            return getDefaultIntent();
        }

        const parsed = JSON.parse(content);
        console.log('✅ [Intent] 识别结果:', JSON.stringify(parsed));

        // 置信度兜底：如果低于 0.5，退化为 chatting
        if (!parsed.confidence || parsed.confidence < 0.5) {
            console.log('⚠️ [Intent] 置信度过低，退化为 chatting');
            return {
                intent: 'chatting',
                confidence: parsed.confidence || 0,
                entities: parsed.entities || {},
                fallback: true
            };
        }

        return {
            intent: parsed.intent || 'chatting',
            confidence: parsed.confidence,
            entities: parsed.entities || {},
            fallback: false
        };

    } catch (error) {
        console.error('❌ [Intent] 识别失败:', error.response?.data || error.message);
        // 出错时降级为普通对话，保证系统不中断
        return getDefaultIntent();
    }
}

/**
 * 默认意图（兜底）
 */
function getDefaultIntent() {
    return {
        intent: 'chatting',
        confidence: 0,
        entities: {},
        fallback: true
    };
}

module.exports = { classifyIntent };
