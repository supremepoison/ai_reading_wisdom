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

        // 章节显示和进度计算逻辑
        // - current_chapter_index 表示"当前正在读的章节索引"（0=第1章, 1=第2章）
        // - 进度百分比 = (current_chapter_index / total_chapters) * 100
        // - 显示逻辑：
        //   * 未打卡：显示"当前正在读的章节"（current_chapter_index）
        //   * 已打卡：显示"刚完成的章节"（current_chapter_index，因为打卡后章节不会立即推进）
        let displayIndex = progress.current_chapter_index || 0
        let completedChapters = 0

        if (!checkedInToday) {
            // 未打卡：显示"当前正在读的章节"
            // 初始状态：displayIndex = 0（第1章），进度0%
            // 第二天：displayIndex = 1（第2章），进度10%
            displayIndex = progress.current_chapter_index || 0
            // 已完成的章节数 = 当前章节索引
            completedChapters = displayIndex
        } else {
            // 已打卡：显示"刚完成的章节"
            // 今天打卡后：displayIndex = 0（第1章，刚完成），completedChapters = 1，进度10%
            // 第二天打卡后：displayIndex = 1（第2章，刚完成），completedChapters = 2，进度20%
            displayIndex = progress.current_chapter_index || 0
            completedChapters = displayIndex + 1  // 已打卡，完成的章节数 = 当前章节索引 + 1
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
