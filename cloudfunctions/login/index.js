// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID

    try {
        // 1. Check if the user exists
        const userRes = await db.collection('users').where({
            openid: OPENID
        }).get()

        // 2. If new user, return not registered status
        if (userRes.data.length === 0) {
            console.log('用户未注册，openid:', OPENID);
            return {
                registered: false,
                openid: OPENID
            }
        }

        // 3. Return existing user info with registered flag
        console.log('用户已注册，openid:', OPENID);
        return {
            ...userRes.data[0],
            registered: true,
            isNew: false
        }

    } catch (err) {
        console.error(err)
        return {
            error: err
        }
    }
}
