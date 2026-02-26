// pages/profile/profile.js
const app = getApp();

Page({
    data: {
        userInfo: null,
        isRegistered: false,
        levelNames: [],
        // Mock Data for UI
        medals: [],
        readingHistory: [],
        showBookPicker: false,
        recommendBooks: [],
        // 编辑模式
        showEditModal: false,
        editName: '',
        editPhone: ''
    },

    onLoad() {
        console.log('[Profile] onLoad');
        app.checkAuthAndRedirect(this, 'Profile');

        // 加载等级配置
        app.onConfigReady((levels) => {
            this.setData({
                levelNames: levels.map(l => l.name)
            });
        });

        // 订阅登录状态
        this._loginCb = (isRegistered) => {
            console.log('[Profile] 登录状态回调:', isRegistered);
            this.setData({ isRegistered });
            if (isRegistered) {
                this.loadUserData();
            }
        };
        app.onLoginStatusChange(this._loginCb);
    },

    onUnload() {
        app.offLoginStatusChange(this._loginCb);
    },

    onShow() {
        console.log('[Profile] onShow');
        if (!app.checkAuthAndRedirect(this, 'Profile')) return;

        if (this.data.isRegistered) {
            this.loadUserData();
        }
    },

    loadUserData() {
        wx.showLoading({ title: '加载中...' });

        // 1. 基本信息
        this.setData({
            userInfo: app.globalData.userInfo
        });

        // 2. 获取统计数据和勋章
        const p1 = wx.cloud.callFunction({ name: 'getUserStats' });
        // 3. 获取阅读进度记录
        const p2 = wx.cloud.callFunction({ name: 'getUserArchive' });

        Promise.all([p1, p2]).then(results => {
            wx.hideLoading();
            const statsRes = results[0].result;
            const archiveRes = results[1].result;

            if (statsRes.code === 0) {
                this.setData({
                    medals: statsRes.stats.medals || [],
                    'userInfo.points': statsRes.updatedUser.points,
                    'userInfo.level': statsRes.updatedUser.level,
                    'userInfo.continuous_days': statsRes.updatedUser.continuous_days
                });
                // 同时更新全局数据，防止其他页面也用到
                app.globalData.userInfo = {
                    ...app.globalData.userInfo,
                    ...statsRes.updatedUser
                };
            }

            if (archiveRes.code === 0) {
                this.setData({
                    readingHistory: archiveRes.archive || []
                });
            }
        }).catch(err => {
            wx.hideLoading();
            console.error('加载个人资料失败', err);
        });
    },

    navigateToAdmin() {
        wx.navigateTo({
            url: '/subPackages/admin/user-list/user-list'
        });
    },

    // 切换书籍逻辑
    async handleSwitchBook(e) {
        const bookId = e.currentTarget.dataset.id;
        wx.showLoading({ title: '切换中...' });

        try {
            const res = await wx.cloud.callFunction({
                name: 'selectBook',
                data: { bookId }
            });

            if (res.result.code === 0) {
                wx.showToast({ title: '切换成功', icon: 'success' });
                // 重新加载本地数据
                this.loadUserData();
                // 通知全局进度可能已变（首页会自动刷新）
                if (app.globalData.currentBook) {
                    app.globalData.currentBook = null; // 强制触发首页重新获取进度
                }
            } else {
                wx.showToast({ title: res.result.msg, icon: 'none' });
            }
        } catch (err) {
            console.error('切换书籍失败', err);
            wx.showToast({ title: '切换失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // 在本页内弹出选书浮层
    async openBookPicker() {
        wx.showLoading({ title: '加载书籍...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'getRecommendBooks'
            });
            console.log('推荐书籍:', res.result);
            if (res.result.code === 0 && res.result.books.length > 0) {
                this.setData({
                    recommendBooks: res.result.books,
                    showBookPicker: true
                });
            } else {
                wx.showToast({ title: '暂无可选书籍', icon: 'none' });
            }
        } catch (err) {
            console.error('获取推荐书籍失败', err);
            wx.showToast({ title: '请先上传 getRecommendBooks 云函数', icon: 'none', duration: 3000 });
        } finally {
            wx.hideLoading();
        }
    },

    closeBookPicker() {
        this.setData({ showBookPicker: false });
    },

    // 在本页直接选书
    async handlePickBook(e) {
        const bookId = e.currentTarget.dataset.id;
        wx.showLoading({ title: '正在开启...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'selectBook',
                data: { bookId }
            });
            if (res.result.code === 0) {
                this.setData({ showBookPicker: false });
                wx.showToast({ title: res.result.msg || '切换成功', icon: 'success' });
                // 刷新本页数据
                this.loadUserData();
                // 清除首页缓存，让首页下次 onShow 时重新获取进度
                app.globalData.currentBook = null;
            } else {
                wx.showToast({ title: res.result.msg, icon: 'none' });
            }
        } catch (err) {
            console.error('选择书籍失败', err);
            wx.showToast({ title: '选择失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // ========== 编辑个人信息 ==========
    openEditModal() {
        this.setData({
            showEditModal: true,
            editName: this.data.userInfo?.name || '',
            editPhone: this.data.userInfo?.phone || ''
        });
    },

    closeEditModal() {
        this.setData({ showEditModal: false });
    },

    onEditNameInput(e) {
        this.setData({ editName: e.detail.value });
    },

    onEditPhoneInput(e) {
        this.setData({ editPhone: e.detail.value });
    },

    async saveProfile() {
        const { editName, editPhone } = this.data;

        if (!editName.trim()) {
            return wx.showToast({ title: '姓名不能为空', icon: 'none' });
        }
        if (editPhone && !/^1\d{10}$/.test(editPhone)) {
            return wx.showToast({ title: '手机号格式有误', icon: 'none' });
        }

        wx.showLoading({ title: '保存中...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'updateProfile',
                data: { name: editName.trim(), phone: editPhone }
            });

            if (res.result.code === 0) {
                // 更新本地和全局状态
                this.setData({
                    'userInfo.name': editName.trim(),
                    'userInfo.phone': editPhone,
                    showEditModal: false
                });
                app.globalData.userInfo = {
                    ...app.globalData.userInfo,
                    name: editName.trim(),
                    phone: editPhone
                };
                wx.showToast({ title: '保存成功', icon: 'success' });
            } else {
                wx.showToast({ title: res.result.msg || '保存失败', icon: 'none' });
            }
        } catch (err) {
            console.error('保存个人信息失败', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    }
});
