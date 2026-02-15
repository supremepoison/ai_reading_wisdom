// cloudfunctions/getCheckinLogs/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { monthStr } = event // 格式: "2026-02"

    try {
        // 1. 获取当月所有打卡记录
        // 假设 date_str 存储格式为 "YYYY-MM-DD"
        const res = await db.collection('checkins')
            .where({
                openid: OPENID,
                date_str: db.RegExp({
                    regexp: `^${monthStr}`,
                    options: 'i',
                })
            })
            .limit(100)
            .get()

        // 2. 检查当日是否已打卡（双重检查：checkins 表 + user.last_checkin_date）
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

        // 2.1 检查 checkins 表
        let checkedInToday = res.data.some(item => item.date_str === todayStr)

        // 2.2 如果 checkins 表中没有记录，检查 user.last_checkin_date（防止切换书籍后状态丢失）
        if (!checkedInToday) {
            try {
                const userRes = await db.collection('users').where({ openid: OPENID }).get()
                if (userRes.data.length > 0) {
                    const lastCheckinDate = userRes.data[0].last_checkin_date
                    if (lastCheckinDate === todayStr) {
                        checkedInToday = true
                    }
                }
            } catch (err) {
                console.error('[getCheckinLogs] 检查用户 last_checkin_date 失败', err)
            }
        }

        return {
            code: 0,
            logs: res.data.map(item => item.date_str),
            checkedInToday: checkedInToday,
            todayStr: todayStr
        }
    } catch (err) {
        console.error(err)
        return { code: -1, msg: '获取日志预览失败' }
    }
}
