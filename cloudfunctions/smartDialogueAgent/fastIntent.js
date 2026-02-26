/**
 * fastIntent.js
 * 快速意图识别模块 - 通过正则表达式匹配高频关键词
 * 降低延迟，减少对 LLM 的依赖
 */

const INTENT_MAP = [
    {
        intent: 'query_plan',
        keywords: /我的计划|计划是什么|看看计划|之前的安排|剩多少|该读哪|下一步读什么/
    },
    {
        intent: 'query_progress',
        keywords: /进度|几天了|多少分|积分|读到哪了|打卡天数|成绩单/
    },
    {
        intent: 'query_notes',
        keywords: /感悟|笔记|读后感|写过什么|之前的感言|我的感笔/
    },
    {
        intent: 'book_recommendation',
        keywords: /推荐.*书|读什么书|有什么好书|适合.*读的书|书单/
    },
    {
        intent: 'quiz_request',
        keywords: /闯关|测试|考考我|题目|做题|quiz|答题/
    },
    {
        intent: 'reporting',
        keywords: /我读完了|搞定|任务完成|读完第.*回/
    },
    {
        intent: 'seeking_help',
        keywords: /^(怎么用|在哪里|怎么操作|帮助|指南|说明书)$/
    },
    {
        intent: 'planning',
        keywords: /制定计划|帮我规划|制定个计划/
    }
];

/**
 * 快速匹配意图
 * @param {string} message 用户消息
 * @returns {object|null} 匹配到的意图对象 or null
 */
function matchFastIntent(message) {
    if (!message) return null;

    const cleanMsg = message.trim();

    for (const item of INTENT_MAP) {
        if (item.keywords.test(cleanMsg)) {
            console.log(`⚡ [FastIntent] 命中正则: ${item.intent}`);
            return {
                intent: item.intent,
                confidence: 1.0,
                entities: {},
                source: 'fast_regex'
            };
        }
    }

    return null;
}

module.exports = { matchFastIntent };
