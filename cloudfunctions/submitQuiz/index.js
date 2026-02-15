// cloudfunctions/submitQuiz/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { bookName, chapter, score, correctCount, totalQuestions } = event

    if (score === undefined || !bookName) {
        return { code: -1, msg: '参数不完整' }
    }

    try {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const MAX_DAILY_POINTS = 15;

        // 1. 获取用户信息，检查限额
        const userRes = await db.collection('users').where({ openid: OPENID }).get();
        if (userRes.data.length === 0) return { code: -1, msg: '用户不存在' };

        const user = userRes.data[0];
        let currentDailyPoints = user.last_point_date === todayStr ? (user.daily_points || 0) : 0;

        let actualPointsEarned = score;
        let isOverLimit = false;

        if (currentDailyPoints >= MAX_DAILY_POINTS) {
            actualPointsEarned = 0;
            isOverLimit = true;
        } else if (currentDailyPoints + score > MAX_DAILY_POINTS) {
            actualPointsEarned = MAX_DAILY_POINTS - currentDailyPoints;
            isOverLimit = true;
        }

        // 2. 记录闯关数据
        const quizLog = {
            openid: OPENID,
            book_name: bookName,
            chapter: chapter || '未命名章节',
            score: score,
            points_awarded: actualPointsEarned,
            correct_count: correctCount,
            total_questions: totalQuestions,
            created_at: db.serverDate()
        }
        await db.collection('quiz_records').add({ data: quizLog })

        // 3. 更新用户总积分及每日统计
        const updateData = {
            updated_at: db.serverDate(),
            last_point_date: todayStr
        };

        if (actualPointsEarned > 0) {
            updateData.points = _.inc(actualPointsEarned);
            updateData.daily_points = (user.last_point_date === todayStr) ? _.inc(actualPointsEarned) : actualPointsEarned;
        } else if (user.last_point_date !== todayStr) {
            // 如果是新的一天但没加分，也要重置每日积分为 0
            updateData.daily_points = 0;
        }

        await db.collection('users').where({ openid: OPENID }).update({ data: updateData });

        return {
            code: 0,
            msg: isOverLimit ? '已达今日积分上限，记录已保存' : '提交成功',
            pointsEarned: actualPointsEarned,
            isOverLimit: isOverLimit
        }
    } catch (err) {
        console.error(err)
        return {
            code: -1,
            msg: '提交失败',
            error: err
        }
    }
}
