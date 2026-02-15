// cloudfunctions/getUserStats/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()

    try {
        // 1. 获取用户详细信息
        const userRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        if (userRes.data.length === 0) {
            return { error: 'user_not_found', msg: '用户不存在' }
        }
        const user = userRes.data[0]

        // 2. 聚合阅读数据 (从 notes 集合中按书名统计)
        const notesRes = await db.collection('notes').where({
            openid: OPENID
        }).get()

        // 统计每本书的笔记数量
        const bookStats = {}
        const history = []

        notesRes.data.forEach(note => {
            if (!bookStats[note.book_name]) {
                bookStats[note.book_name] = {
                    title: note.book_name,
                    notesCount: 0,
                    coverUrl: note.book_cover || 'https://picsum.photos/id/24/200/300', // 默认封面
                    lastRead: note.created_at
                }
            }
            bookStats[note.book_name].notesCount++
        })

        // 转换为数组
        for (let key in bookStats) {
            history.push(bookStats[key])
        }

        const totalNotes = notesRes.data.length

        // 3. 勋章计算逻辑
        const medals = [
            {
                id: 'newbie',
                name: '阅读萌新',
                icon: '🌱',
                desc: '首次登录',
                achieved: true
            },
            {
                id: 'streak_3',
                name: '坚持不懈',
                icon: '🔥',
                desc: '连续打卡3天',
                achieved: (user.continuous_days || 0) >= 3
            },
            {
                id: 'writer_5',
                name: '小作家',
                icon: '✍️',
                desc: '撰写 5 篇感悟',
                achieved: totalNotes >= 5
            },
            {
                id: 'points_500',
                name: '勤奋学霸',
                icon: '⭐',
                desc: '积分达到500分',
                achieved: (user.points || 0) >= 500
            },
            {
                id: 'master',
                name: '智慧博士',
                icon: '🎓',
                desc: '读过 3 本不同的书',
                achieved: history.length >= 3
            }
        ]

        // 筛选出已获得的勋章数量
        const achievedCount = medals.filter(m => m.achieved).length

        return {
            code: 0,
            updatedUser: {
                points: user.points,
                level: user.level,
                continuous_days: user.continuous_days,
                fullUser: user
            },
            stats: {
                medals: medals,
                achievedCount: achievedCount,
                totalNotes: totalNotes,
                booksReadCount: history.length,
                readingHistory: history
            }
        }

    } catch (err) {
        console.error(err)
        return {
            code: -500,
            msg: '获取统计失败',
            error: err
        }
    }
}
