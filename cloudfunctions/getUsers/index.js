// cloudfunctions/getUsers/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    // 这里应该校验 event.userInfo.openId 是否为管理员
    // MVP 阶段我们先直接返回所有用户（仅限内部使用）

    try {
        // 校验权限
        const wxContext = cloud.getWXContext()
        const callerRes = await db.collection('users').where({
            openid: wxContext.OPENID
        }).get()

        if (callerRes.data.length === 0 || callerRes.data[0].role !== 'admin') {
            return {
                code: -1,
                msg: '无权操作'
            }
        }

        const res = await db.collection('users')
            .orderBy('created_at', 'desc')
            .limit(100)
            .get()

        return {
            code: 0,
            data: res.data
        }
    } catch (err) {
        return {
            code: -1,
            err: err
        }
    }
}
