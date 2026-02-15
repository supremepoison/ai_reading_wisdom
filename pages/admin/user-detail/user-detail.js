// pages/admin/user-detail/user-detail.js
const app = getApp();

Page({
    data: {
        targetOpenid: '',
        userDetail: {},
        form: {
            name: '',
            phone: '',
            campus: '',
            level: 1
        },
        originalForm: {},
        levelNames: [],
        campusList: [],
        hasChanges: false,
        saving: false
    },

    onLoad(options) {
        const { openid } = options;
        if (!openid) {
            wx.showToast({ title: '参数错误', icon: 'none' });
            wx.navigateBack();
            return;
        }

        this.setData({ targetOpenid: openid });

        // 从全局加载等级和校区配置
        app.onConfigReady((levels, campuses) => {
            this.setData({
                levelNames: levels.map(l => l.name),
                campusList: campuses
            });
        });

        this.loadUser(openid);
    },

    async loadUser(openid) {
        wx.showLoading({ title: '加载中...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'getUsers',
                data: { targetOpenid: openid }
            });

            if (res.result.code === 0 && res.result.data.length > 0) {
                const user = res.result.data.find(u => u.openid === openid) || res.result.data[0];
                const form = {
                    name: user.name || '',
                    phone: user.phone || '',
                    campus: user.campus || '',
                    level: user.level || 1
                };
                this.setData({
                    userDetail: user,
                    form: form,
                    originalForm: { ...form }
                });
            }
        } catch (err) {
            console.error('加载用户失败', err);
            wx.showToast({ title: '加载失败', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    onInputChange(e) {
        const field = e.currentTarget.dataset.field;
        const value = e.detail.value;
        this.setData({ [`form.${field}`]: value });
        this.checkChanges();
    },

    // 校区选择器
    pickCampus() {
        const list = this.data.campusList;
        if (!list || list.length === 0) {
            wx.showToast({ title: '校区配置未加载，请在 config 集合中添加 campuses', icon: 'none', duration: 3000 });
            return;
        }

        wx.showActionSheet({
            itemList: list,
            success: (res) => {
                this.setData({ 'form.campus': list[res.tapIndex] });
                this.checkChanges();
            }
        });
    },

    // 等级选择器
    pickLevel() {
        const itemList = this.data.levelNames.map((n, i) => `Lv.${i + 1} ${n}`);
        if (itemList.length === 0) {
            wx.showToast({ title: '等级配置未加载，请在 config 集合中添加 levels', icon: 'none', duration: 3000 });
            return;
        }

        wx.showActionSheet({
            itemList: itemList,
            success: (res) => {
                this.setData({ 'form.level': res.tapIndex + 1 });
                this.checkChanges();
            }
        });
    },

    checkChanges() {
        const { form, originalForm } = this.data;
        const hasChanges = form.name !== originalForm.name ||
            form.phone !== originalForm.phone ||
            form.campus !== originalForm.campus ||
            form.level !== originalForm.level;
        this.setData({ hasChanges });
    },

    async handleSave() {
        if (!this.data.hasChanges || this.data.saving) return;

        this.setData({ saving: true });
        try {
            const res = await wx.cloud.callFunction({
                name: 'updateUser',
                data: {
                    targetOpenid: this.data.targetOpenid,
                    updates: this.data.form
                }
            });

            if (res.result.code === 0) {
                wx.showToast({ title: '保存成功', icon: 'success' });
                this.setData({
                    originalForm: { ...this.data.form },
                    hasChanges: false
                });
            } else {
                wx.showToast({ title: res.result.msg || '保存失败', icon: 'none' });
            }
        } catch (err) {
            console.error('保存失败', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
        } finally {
            this.setData({ saving: false });
        }
    }
});
