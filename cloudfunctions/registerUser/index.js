// cloudfunctions/registerUser/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { name, phone, level, campus } = event

    if (!name || !phone || !level || !campus) {
        return { code: -1, msg: '所有字段均为必填项' }
    }

    try {
        // 检查是否已注册
        const userRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        if (userRes.data.length > 0) {
            return { code: -2, msg: '该用户已注册' }
        }

        // 用于数据库存储的对象（含 serverDate）
        const dbUser = {
            openid: OPENID,
            name,
            phone,
            level: parseInt(level),
            campus,
            points: 0,
            continuous_days: 0,
            created_at: db.serverDate(),
            last_checkin_date: null,
            role: 'student'
        }

        await db.collection('users').add({
            data: dbUser
        })

        // 返回给客户端的对象（不含 serverDate，改用普通时间戳）
        const clientUser = {
            openid: OPENID,
            name,
            phone,
            level: parseInt(level),
            campus,
            points: 0,
            continuous_days: 0,
            created_at: new Date().toISOString(),
            last_checkin_date: null,
            role: 'student'
        }

        return {
            code: 0,
            msg: '注册成功',
            user: clientUser
        }

    } catch (err) {
        console.error(err)
        return {
            code: -500,
            msg: '注册失败',
            error: err
        }
    }
}
