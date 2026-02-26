// cloudfunctions/updateProfile/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext()
    const { name, phone } = event

    // 验证
    if (!name || !name.trim()) {
        return { code: -1, msg: '姓名不能为空' }
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
        return { code: -1, msg: '手机号格式不正确' }
    }

    try {
        const updateData = {
            name: name.trim(),
            updated_at: db.serverDate()
        }
        if (phone) {
            updateData.phone = phone
        }

        await db.collection('users').where({ openid: OPENID }).update({
            data: updateData
        })

        return {
            code: 0,
            msg: '更新成功',
            user: { name: name.trim(), phone: phone || '' }
        }
    } catch (err) {
        console.error('更新个人信息失败:', err)
        return { code: -500, msg: '更新失败', error: err.message }
    }
}
