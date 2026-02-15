// cloudfunctions/updateUser/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID
    const { targetOpenid, updates } = event

    if (!targetOpenid || !updates) {
        return { code: -1, msg: '参数错误' }
    }

    try {
        // 权限校验：必须是管理员
        const callerRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        if (callerRes.data.length === 0 || callerRes.data[0].role !== 'admin') {
            return { code: -403, msg: '权限不足' }
        }

        // 只允许修改指定字段（白名单）
        const allowedFields = ['name', 'phone', 'campus', 'level']
        const safeUpdates = {}
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                safeUpdates[key] = updates[key]
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return { code: -1, msg: '没有需要更新的字段' }
        }

        safeUpdates.updated_at = db.serverDate()

        await db.collection('users').where({
            openid: targetOpenid
        }).update({
            data: safeUpdates
        })

        return { code: 0, msg: '更新成功' }

    } catch (err) {
        console.error(err)
        return { code: -500, msg: '更新失败', error: err }
    }
}
