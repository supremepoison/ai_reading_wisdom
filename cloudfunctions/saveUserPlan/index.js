const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext();
    const { plan } = event;

    if (!plan) {
        return { code: -1, msg: '缺少计划数据' };
    }

    try {
        // 将该用户之前所有还在 'active' 状态的计划标记为失效 (superseded)
        // 保证同一时间只有一个主线计划
        await db.collection('study_plans')
            .where({ openid: OPENID, status: 'active' })
            .update({ data: { status: 'superseded', updated_at: db.serverDate() } });

        // 插入新计划
        const res = await db.collection('study_plans').add({
            data: {
                openid: OPENID,
                plan: plan,
                status: 'active',
                created_at: db.serverDate(),
                updated_at: db.serverDate()
            }
        });

        return {
            code: 0,
            msg: '计划保存成功',
            id: res._id
        };
    } catch (err) {
        console.error('Save plan error:', err);
        return {
            code: -500,
            error: err.message
        };
    }
};
