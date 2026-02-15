// 云函数：getConfig - 读取配置（等级、校区）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
    try {
        // 并行读取 levels 和 campuses
        const [levelsRes, campusesRes] = await Promise.all([
            db.collection('config').doc('levels').get(),
            db.collection('config').doc('campuses').get()
        ]);

        return {
            code: 0,
            levels: levelsRes.data.items || [],
            campuses: campusesRes.data.items || []
        };
    } catch (err) {
        console.error('getConfig error:', err);
        return {
            code: -1,
            msg: '获取配置失败',
            levels: [],
            campuses: []
        };
    }
};
