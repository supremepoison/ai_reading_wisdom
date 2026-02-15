// pages/admin/user-list/user-list.js
const app = getApp();

Page({
    data: {
        users: []
    },

    onLoad() {
        if (!app.globalData.isRegistered) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(() => { wx.switchTab({ url: '/pages/home/home' }); }, 1000);
            return;
        }

        const userInfo = app.globalData.userInfo;
        if (!userInfo || userInfo.role !== 'admin') {
            wx.showToast({ title: '无管理权限', icon: 'none' });
            setTimeout(() => { wx.switchTab({ url: '/pages/home/home' }); }, 1000);
            return;
        }

        this.fetchUsers();
    },

    onShow() {
        // 从详情页返回时刷新列表
        if (this._needRefresh) {
            this._needRefresh = false;
            this.fetchUsers();
        }
    },

    onPullDownRefresh() {
        this.fetchUsers();
    },

    fetchUsers() {
        wx.showLoading({ title: '加载中...' });
        wx.cloud.callFunction({
            name: 'getUsers',
            success: res => {
                wx.hideLoading();
                wx.stopPullDownRefresh();
                if (res.result.code === 0) {
                    this.setData({ users: res.result.data });
                } else {
                    wx.showToast({ title: res.result.msg || '加载失败', icon: 'none' });
                }
            },
            fail: () => {
                wx.hideLoading();
                wx.showToast({ title: '网络错误', icon: 'none' });
            }
        });
    },

    goToDetail(e) {
        const openid = e.currentTarget.dataset.openid;
        this._needRefresh = true;
        wx.navigateTo({
            url: `/pages/admin/user-detail/user-detail?openid=${openid}`
        });
    }
});
