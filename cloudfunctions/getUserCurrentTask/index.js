// cloudfunctions/getUserCurrentTask/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()

    try {
        // 1. 获取当前正在读的书
        const progressRes = await db.collection('user_progress')
            .where({ openid: OPENID, status: 'reading' })
            .orderBy('last_read_at', 'desc')
            .limit(1)
            .get()

        let progress = progressRes.data[0]

        // 2. 如果没有任何进度，告知前端需要选书
        if (!progress) {
            return { code: 0, hasBook: false, msg: '新学员请先选书，开启您的智慧之旅' }
        }

        // 3. 获取书籍详情
        const bookRes = await db.collection('books').doc(progress.book_id).get()
        const book = bookRes.data

        // 4. 检查今日是否已打卡
        const now = new Date()
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const checkinRes = await db.collection('checkins').where({
            openid: OPENID,
            date_str: todayStr
        }).get()
        const checkedInToday = checkinRes.data.length > 0

        // 章节推进逻辑（延迟推进）：
        // 如果用户昨天打过卡（last_read_at 是昨天或更早），且今天还没打卡，
        // 说明该推进到下一章了
        let displayIndex = progress.current_chapter_index || 0
        let completedChapters = 0
        let needsAdvance = false

        // 检查是否需要推进章节
        // 条件：上次打卡日期存在，且不是今天，说明是新的一天
        const userRes2 = await db.collection('users').where({ openid: OPENID }).get()
        const userData = userRes2.data[0] || {}
        const lastCheckinDate = userData.last_checkin_date || ''

        if (lastCheckinDate && lastCheckinDate !== todayStr) {
            // 上次打卡不是今天 → 说明是新的一天，需要推进
            // 但只在 progress 的 last_advanced_date 不等于今天时推进（防止重复推进）
            const lastAdvanced = progress.last_advanced_date || ''
            if (lastAdvanced !== todayStr) {
                needsAdvance = true
            }
        }

        if (needsAdvance) {
            const nextIndex = displayIndex + 1
            if (nextIndex < book.total_chapters) {
                await db.collection('user_progress').doc(progress._id).update({
                    data: {
                        current_chapter_index: nextIndex,
                        last_advanced_date: todayStr,
                        last_read_at: db.serverDate()
                    }
                })
                displayIndex = nextIndex
                console.log('📖 [推进] 新的一天，章节推进:', displayIndex - 1, '→', displayIndex)
            } else if (nextIndex === book.total_chapters) {
                await db.collection('user_progress').doc(progress._id).update({
                    data: {
                        current_chapter_index: book.total_chapters - 1,
                        status: 'finished',
                        last_advanced_date: todayStr,
                        updated_at: db.serverDate()
                    }
                })
                displayIndex = book.total_chapters - 1
                console.log('🏁 [推进] 全书读完！')
            }
        }

        if (checkedInToday) {
            completedChapters = displayIndex + 1  // 已打卡，完成当前章节
        } else {
            completedChapters = displayIndex  // 未打卡，当前章节进行中
        }

        const currentChapter = book.chapters[displayIndex] || '未知章节'
        const progressPercent = Math.round((completedChapters / book.total_chapters) * 100)

        return {
            code: 0,
            hasBook: true,
            checkedInToday,
            currentBook: {
                id: book._id,
                title: book.title,
                author: book.author,
                coverUrl: book.cover_url,
                currentChapter: currentChapter,
                chapterNumber: displayIndex + 1,
                totalChapters: book.total_chapters,
                progress: progressPercent
            }
        }

    } catch (err) {
        console.error(err)
        return { code: -1, msg: '获取当前阅读进度失败' }
    }
}
