// cloudfunctions/selectBook/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { bookId } = event

    if (!bookId) {
        return { code: -1, msg: '参数错误：bookId 不能为空' }
    }

    try {
        // 0. 删除今日打卡记录（换书后需重新打卡）
        const now = new Date()
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        await db.collection('checkins')
            .where({ openid: OPENID, date_str: todayStr })
            .remove()

        // 1. 先将当前所有正在读的书设为"暂停" (paused)
        await db.collection('user_progress')
            .where({ openid: OPENID, status: 'reading' })
            .update({
                data: {
                    status: 'paused',
                    last_read_at: db.serverDate()
                }
            })

        // 2. 检查目标书籍是否已有进度记录
        const targetRes = await db.collection('user_progress')
            .where({ openid: OPENID, book_id: bookId })
            .get()

        if (targetRes.data.length > 0) {
            const progress = targetRes.data[0]
            if (progress.status === 'finished') {
                return { code: 0, msg: '这本书您已经读完啦，即将复习', isFinished: true }
            }

            // 恢复为阅读中
            await db.collection('user_progress').doc(progress._id).update({
                data: {
                    status: 'reading',
                    last_read_at: db.serverDate()
                }
            })
            return { code: 0, msg: '已切换书籍，请重新打卡' }
        }

        // 3. 获取书籍详情（新开一本书）
        const bookRes = await db.collection('books').doc(bookId).get()
        if (!bookRes.data) {
            return { code: -1, msg: '未找到该书籍' }
        }

        // 4. 初始化进度 (从索引 0 开始)
        // last_checkin_date 设为 null，表示还没打过卡
        await db.collection('user_progress').add({
            data: {
                openid: OPENID,
                book_id: bookId,
                book_name: bookRes.data.title,
                current_chapter_index: 0,
                status: 'reading',
                last_read_at: db.serverDate(),
                last_checkin_date: null  // 初始化为空，表示还没打过卡
            }
        })

        return {
            code: 0,
            msg: '书籍开启成功，开始您的智慧之旅吧'
        }

    } catch (err) {
        console.error(err)
        return { code: -500, msg: '书籍开启失败', error: err }
    }
}
