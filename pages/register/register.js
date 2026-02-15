// pages/register/register.js
const app = getApp();

Page({
    data: {
        name: '',
        phone: '',
        campus: '',
        levels: [],        // 从数据库加载
        campuses: [],      // 从数据库加载
        levelIndex: 0,
        campusIndex: -1     // -1 表示未选择
    },

    onLoad() {
        // 等待配置加载完成
        app.onConfigReady((levels, campuses) => {
            // 生成带 Lv 前缀的显示列表，兼容 id 和 level 属性
            const levelDisplay = levels.map((l, index) => {
                const id = l.level || l.id || (index + 1);
                return `Lv.${id} ${l.name}`;
            });
            this.setData({
                levels: levelDisplay,
                campuses: campuses,
                _rawLevels: levels
            });
        });
    },

    bindLevelChange(e) {
        this.setData({
            levelIndex: e.detail.value
        });
    },

    bindCampusChange(e) {
        this.setData({
            campusIndex: e.detail.value
        });
    },

    async submitRegistration() {
        const { name, phone, campusIndex, levelIndex, campuses } = this.data;

        // 表单验证
        if (!name.trim()) return wx.showToast({ title: '请输入姓名', icon: 'none' });
        if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '手机号格式有误', icon: 'none' });
        if (campusIndex < 0) return wx.showToast({ title: '请选择所属校区', icon: 'none' });

        const campus = campuses[campusIndex];

        wx.showLoading({ title: '正在注册...' });

        try {
            const res = await wx.cloud.callFunction({
                name: 'registerUser',
                data: {
                    name,
                    phone,
                    level: this.data._rawLevels[levelIndex].level || this.data._rawLevels[levelIndex].id || (parseInt(levelIndex) + 1),
                    campus
                }
            });

            wx.hideLoading();
            const result = res.result;

            if (result.code === 0) {
                wx.showToast({ title: '注册成功！', icon: 'success' });

                // 通过 app 统一入口更新所有状态和订阅者
                app.onRegistrationSuccess(result.user);

                // 延迟跳转回首页
                setTimeout(() => {
                    wx.switchTab({
                        url: '/pages/home/home'
                    });
                }, 1500);
            } else {
                wx.showToast({ title: result.msg || '注册失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            console.error('注册错误', err);
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        }
    }
});
