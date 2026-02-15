// cloudfunctions/checkin/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID

    const { type = 'quick', mediaId = '' } = event // 'quick', 'photo', 'voice'

    // 1. 定义积分规则
    const POINTS_RULES = {
        quick: 1,
        photo: 2,
        voice: 3
    }
    let pointsToAdd = POINTS_RULES[type] || 1

    const today = new Date()
    // format date as YYYY-MM-DD
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    try {
        // 2. 检查用户资料
        const userRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        if (userRes.data.length === 0) {
            return { code: -1, msg: '未找到用户记录，请先登录' }
        }
        const user = userRes.data[0]

        // 3. 检查今天是否已打卡 (防止重复打卡和刷积分漏洞)
        // 3.1 检查 checkins 表
        const checkinRes = await db.collection('checkins').where({
            openid: OPENID,
            date_str: todayStr
        }).get()

        // 3.2 检查用户的 last_checkin_date（防止删除 checkins 记录后重复打卡刷积分）
        const hasCheckedInByDate = user.last_checkin_date === todayStr;

        // 3.3 任何一个检查表明今天已打卡，都拒绝再次打卡
        if (checkinRes.data.length > 0 || hasCheckedInByDate) {
            return {
                code: 1,
                msg: '今天已经打过卡啦',
                points: user.points,
                streak: user.continuous_days || 0,
                hasCheckedIn: true
            }
        }

        // 3.5 综合限额检查 (MAX 15)
        const MAX_DAILY_POINTS = 15;
        let currentDailyPoints = user.last_point_date === todayStr ? (user.daily_points || 0) : 0;
        const todayEarnedCheckin = user.last_checkin_date === todayStr;

        if (currentDailyPoints >= MAX_DAILY_POINTS) {
            pointsToAdd = 0;
        } else if (currentDailyPoints + pointsToAdd > MAX_DAILY_POINTS) {
            pointsToAdd = MAX_DAILY_POINTS - currentDailyPoints;
        }

        // 4. 计算连续打卡天数逻辑
        let newContinuosDays = user.continuous_days || 1
        if (!todayEarnedCheckin) {
            // 只有今天第一次打卡才重新计算连续天数
            newContinuosDays = 1;
            if (user.last_checkin_date) {
                const lastDate = new Date(user.last_checkin_date)
                const yesterday = new Date(today)
                yesterday.setDate(yesterday.getDate() - 1)

                const lastDateStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`
                const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

                if (lastDateStr === yesterdayStr) {
                    newContinuosDays = (user.continuous_days || 0) + 1
                }
            }
        }

        // 5.1 记录打卡日志
        await db.collection('checkins').add({
            data: {
                openid: OPENID,
                type: type,
                media_id: mediaId,
                points_earned: pointsToAdd,
                created_at: db.serverDate(),
                date_str: todayStr
            }
        })

        // 5.2 更新用户积分、每日统计和天数
        const updateData = {
            continuous_days: newContinuosDays,
            last_checkin_date: todayStr,
            last_point_date: todayStr,
            updated_at: db.serverDate()
        };

        if (pointsToAdd > 0) {
            updateData.points = _.inc(pointsToAdd);
            updateData.daily_points = (user.last_point_date === todayStr) ? _.inc(pointsToAdd) : pointsToAdd;
        } else if (user.last_point_date !== todayStr) {
            updateData.daily_points = 0;
        }

        await db.collection('users').where({ openid: OPENID }).update({ data: updateData });

        // 5.3 推进阅读进度（仅当今天首次打卡时才推进）
        if (!todayEarnedCheckin) {
            try {
                const progressRes = await db.collection('user_progress')
                    .where({ openid: OPENID, status: 'reading' })
                    .orderBy('last_read_at', 'desc')
                    .limit(1)
                    .get()

                if (progressRes.data.length > 0) {
                    const progressId = progressRes.data[0]._id;
                    const bookId = progressRes.data[0].book_id;

                    const bookRes = await db.collection('books').doc(bookId).get();
                    if (bookRes.data) {
                        const totalChapters = bookRes.data.total_chapters;
                        const currentIndex = progressRes.data[0].current_chapter_index || 0;
                        const nextIndex = currentIndex + 1;

                        if (nextIndex < totalChapters) {
                            // 还有下一章
                            await db.collection('user_progress').doc(progressId).update({
                                data: {
                                    current_chapter_index: nextIndex,
                                    last_read_at: db.serverDate()
                                }
                            });
                        } else if (nextIndex === totalChapters) {
                            // 最后一章也读完了
                            await db.collection('user_progress').doc(progressId).update({
                                data: {
                                    current_chapter_index: totalChapters, // 标记为全部完成
                                    status: 'finished',
                                    updated_at: db.serverDate()
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.error('更新阅读进度失败', e);
            }
        }

        return {
            code: 0,
            msg: '打卡成功',
            points: (user.points || 0) + pointsToAdd,
            streak: newContinuosDays,
            earned: pointsToAdd
        }

    } catch (err) {
        console.error(err)
        return {
            code: -500,
            msg: '打卡失败',
            error: err
        }
    }
}
