// cloudfunctions/getRecommendBooks/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()

    try {
        // 1. 获取用户等级
        const userRes = await db.collection('users').where({ openid: OPENID }).get()
        let level = 1;
        if (userRes.data.length > 0) {
            level = Number(userRes.data[0].level) || 1;
        }

        // 2. 查询推荐书籍 (根据 recommend_level)
        // 推荐逻辑：展示 recommend_level <= 用户当前等级 的书籍
        const booksRes = await db.collection('books')
            .where({
                // 直接查询数字类型的等级
                recommend_level: _.lte(level)
            })
            .limit(100)
            .get()

        // 3. 严格兜底过滤 (处理可能存在的字符串类型数据)
        const finalBooks = booksRes.data.filter(book => {
            if (book.recommend_level === undefined || book.recommend_level === null) return true; // 无限制的书籍
            const bookLvl = Number(book.recommend_level);
            return bookLvl <= level;
        });

        return {
            code: 0,
            books: finalBooks
        }

    } catch (err) {
        console.error(err)
        return { code: -1, msg: '获取推荐书籍失败' }
    }
}
