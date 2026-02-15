// cloudfunctions/updateUserLevel/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID

    // 从前端传入 level 和 targetOpenId（仅管理员可用）
    const { level, targetOpenId } = event

    if (!level || level < 1 || level > 10) {
        return {
            code: -1,
            msg: '等级无效'
        }
    }

    // 权限校验：如果要修改他人等级，必须是管理员
    if (targetOpenId && targetOpenId !== OPENID) {
        const callerRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        if (callerRes.data.length === 0 || callerRes.data[0].role !== 'admin') {
            return {
                code: -403,
                msg: '权限不足'
            }
        }
    }

    const updateOpenId = targetOpenId || OPENID

    try {
        await db.collection('users').where({
            openid: updateOpenId
        }).update({
            data: {
                level: level,
                updated_at: db.serverDate()
            }
        })

        return {
            code: 0,
            msg: '更新成功',
            level: level,
            target: updateOpenId
        }
    } catch (err) {
        console.error(err)
        return {
            code: -1,
            msg: '更新失败',
            error: err
        }
    }
}
