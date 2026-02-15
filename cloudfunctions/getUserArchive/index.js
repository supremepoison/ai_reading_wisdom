// cloudfunctions/getUserArchive/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()

    try {
        // 1. 获取用户所有的阅读进度
        const progressRes = await db.collection('user_progress')
            .where({ openid: OPENID })
            .orderBy('last_read_at', 'desc')
            .get()

        const progressList = progressRes.data
        if (progressList.length === 0) {
            return { code: 0, archive: [] }
        }

        // 2. 批量获取书籍详情
        const bookIds = [...new Set(progressList.map(p => p.book_id))]
        const booksRes = await db.collection('books')
            .where({ _id: _.in(bookIds) })
            .get()

        const booksMap = {}
        booksRes.data.forEach(b => {
            booksMap[b._id] = b
        })

        // 3. 获取各本书的笔记数量
        const bookNames = [...new Set(progressList.map(p => booksMap[p.book_id]?.title || p.book_name).filter(Boolean))]
        const notesCountRes = await db.collection('notes')
            .where({ openid: OPENID, book_name: _.in(bookNames) })
            .get()

        const notesCountMap = {}
        notesCountRes.data.forEach(n => {
            const bName = n.book_name
            notesCountMap[bName] = (notesCountMap[bName] || 0) + 1
        })

        // 4. 组装数据
        const archive = progressList.map(p => {
            const book = booksMap[p.book_id] || {}
            return {
                id: p._id,
                bookId: p.book_id,
                title: book.title || p.book_name || '未知书籍',
                coverUrl: book.cover_url || '',
                status: p.status, // 'reading' | 'finished'
                notesCount: notesCountMap[book.title || p.book_name] || 0,
                updatedAt: p.last_read_at
            }
        })

        return {
            code: 0,
            archive: archive
        }

    } catch (err) {
        console.error(err)
        return { code: -1, msg: '获取阅读档案失败' }
    }
}
