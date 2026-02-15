// pages/home/home.js
const app = getApp();

Page({
    data: {
        userPoints: 1240,
        streak: 12,
        checkedInToday: false,
        showAnimation: false,
        currentBook: {
            id: '1',
            title: '西游记',
            author: '吴承恩',
            coverUrl: 'https://picsum.photos/id/24/200/300',
            currentChapter: '请选择一本书开启旅程',
            totalChapters: 0,
            progress: 0,
            chapterNumber: 1
        },
        calendarDays: [],
        isRecording: false,
        willCancel: false,
        isRegistered: false,
        showBookPicker: false,
        recommendBooks: []
    },

    onShow() {
        // 从个人中心跳转过来的选书请求（优先级最高）
        if (app.globalData.forceShowBookPicker) {
            app.globalData.forceShowBookPicker = false;
            this._forcePickerOpen = true;
            this.fetchRecommendBooks();
        }
        // 每次显示页面时刷新数据（Tab 页只触发 onLoad 一次）
        if (this._initialized) {
            this.initData();
        }
    },

    onLoad() {
        this._initialized = true;
        this.initData();

        // 订阅登录状态
        this._loginCb = (isRegistered) => {
            this.setData({ isRegistered });
        };
        app.onLoginStatusChange(this._loginCb);

        // 订阅积分变化
        this._pointsCb = (points) => {
            this.setData({ userPoints: points });
        };
        app.onPointsChange(this._pointsCb);
    },

    onUnload() {
        app.offLoginStatusChange(this._loginCb);
        app.offPointsChange(this._pointsCb);
    },

    goToRegister() {
        wx.navigateTo({
            url: '/pages/register/register'
        });
    },

    // 直接登录（调用云函数验证）
    handleLogin() {
        app.login();
    },

    goToProfile() {
        wx.switchTab({
            url: '/pages/profile/profile'
        });
    },

    async initData() {
        // 1. 加载当前书本进度
        try {
            const res = await wx.cloud.callFunction({
                name: 'getUserCurrentTask'
            });

            if (res.result && res.result.code === 0) {
                if (res.result.hasBook) {
                    const updateData = {
                        currentBook: res.result.currentBook
                    };
                    // 如果用户主动触发了选书，不关闭弹窗
                    if (!this._forcePickerOpen && !this.data.showBookPicker) {
                        updateData.showBookPicker = false;
                    }
                    this.setData(updateData);
                    app.globalData.currentBook = res.result.currentBook;
                } else {
                    // 没有正在读的书，展示选书界面
                    this.fetchRecommendBooks();
                }
            }
        } catch (err) {
            console.error('加载当前任务失败', err);
        }

        // 2. 加载积分与打卡天数
        wx.cloud.callFunction({
            name: 'getUserStats',
            success: res => {
                if (res.result && res.result.code === 0 && res.result.updatedUser) {
                    const user = res.result.updatedUser;
                    this.setData({
                        userPoints: user.points || 0,
                        streak: user.continuous_days || 0
                    });
                }
            }
        });

        // 3. 构建日历与今日状态
        this.checkCheckinStatus();
    },

    // 获取推荐书籍
    async fetchRecommendBooks() {
        wx.showLoading({ title: '挑选书籍中...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'getRecommendBooks'
            });
            console.log('推荐书籍返回:', res.result);
            if (res.result.code === 0 && res.result.books.length > 0) {
                this.setData({
                    recommendBooks: res.result.books,
                    showBookPicker: true
                });
            } else {
                wx.showToast({ title: '暂无可选书籍，请在 books 集合中添加数据', icon: 'none', duration: 3000 });
            }
        } catch (err) {
            console.error('获取推荐书籍失败', err);
            wx.showToast({ title: '请先上传 getRecommendBooks 云函数', icon: 'none', duration: 3000 });
        } finally {
            wx.hideLoading();
        }
    },

    // 选择并开启新书
    async handleSelectBook(e) {
        const bookId = e.currentTarget.dataset.id;
        wx.showLoading({ title: '正在开启书籍...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'selectBook',
                data: { bookId }
            });
            if (res.result.code === 0) {
                // 重置选书模式，关闭弹窗
                this._forcePickerOpen = false;
                this.setData({ showBookPicker: false });
                wx.showToast({ title: res.result.msg || '开始阅读', icon: 'success' });
                this.initData(); // 重新加载数据
            } else {
                wx.showToast({ title: res.result.msg, icon: 'none' });
            }
        } catch (err) {
            console.error('选择书籍失败', err);
        } finally {
            wx.hideLoading();
        }
    },

    async checkCheckinStatus() {
        console.log('检查今日打卡状态...');

        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        try {
            const res = await wx.cloud.callFunction({
                name: 'getCheckinLogs',
                data: { monthStr }
            });

            if (res.result.code === 0) {
                const { logs, checkedInToday } = res.result;
                this.setData({
                    checkedInToday: checkedInToday
                });
                this.generateCalendar(logs);
            } else {
                this.generateCalendar([]);
            }
        } catch (err) {
            console.error('查询打卡状态失败', err);
            this.generateCalendar([]);
        }
    },

    // 生成日历
    generateCalendar(logs = []) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // 当月有多少天
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const calendarDays = [];
        const logSet = new Set(logs);

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            let status = 'future';

            if (logSet.has(dateStr)) {
                status = 'checked';
            } else if (dateStr === todayStr) {
                status = this.data.checkedInToday ? 'checked' : 'today';
            } else if (new Date(dateStr) < now) {
                status = 'future'; // 过去没打卡的也显示为 future 或者可以加个 missed 样式
            }

            calendarDays.push({
                day: i,
                status: status
            });
        }

        this.setData({ calendarDays });
    },


    // --- 打卡逻辑 ---

    async performCheckIn(type, mediaId = '') {
        if (this.data.checkedInToday) return;

        wx.showLoading({ title: '打卡中...' });

        try {
            const res = await wx.cloud.callFunction({
                name: 'checkin',
                data: {
                    type: type,
                    mediaId: mediaId
                }
            });

            wx.hideLoading();
            const result = res.result;

            if (result.code === 0) {
                // 成功 - 刷新当前书籍进度数据
                this.setData({
                    checkedInToday: true,
                    userPoints: result.points,
                    streak: result.streak
                });
                app.globalData.userPoints = result.points;
                app.globalData.streak = result.streak;

                // 重新获取最新的书籍进度数据，确保章节显示正确
                await this.refreshCurrentBookData();

                this.showSuccessAnimation(result.earned);
                this.generateCalendar();
            } else if (result.code === 1) {
                // 已打卡
                this.setData({ checkedInToday: true });
                wx.showToast({ title: '今日已完成打卡', icon: 'success' });
            } else {
                wx.showToast({ title: result.msg || '打卡失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            console.error('打卡失败', err);
            wx.showToast({ title: '网络异常', icon: 'none' });
        }
    },

    // 1. 快速打卡
    handleQuickCheckIn() {
        this.performCheckIn('quick');
    },

    // 2. 拍照打卡
    handlePhotoCheckIn() {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['camera', 'album'],
            success: async (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;

                wx.showLoading({ title: '上传图片中...' });

                try {
                    const uploadRes = await wx.cloud.uploadFile({
                        cloudPath: `checkins/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`,
                        filePath: tempFilePath
                    });

                    // 上传成功后调用打卡
                    this.performCheckIn('photo', uploadRes.fileID);
                } catch (err) {
                    wx.hideLoading();
                    wx.showToast({ title: '图片上传失败', icon: 'none' });
                }
            }
        });
    },

    // 3. 语音打卡
    handleVoiceCheckIn() {
        // 点击处理逻辑移至 startRecording/stopRecording
    },

    startRecording(e) {
        if (this.data.checkedInToday) return;

        // 记录起始点
        this.startY = e.touches[0].clientY;

        const recorderManager = wx.getRecorderManager();

        recorderManager.onStart(() => {
            this.setData({
                isRecording: true,
                willCancel: false
            });
            wx.vibrateShort();
        });

        recorderManager.onStop(async (res) => {
            // 如果是取消状态，直接返回不上传
            if (this.data.willCancel) {
                this.setData({ isRecording: false, willCancel: false });
                wx.showToast({ title: '已取消', icon: 'none' });
                return;
            }

            this.setData({ isRecording: false });
            const { tempFilePath } = res;

            if (res.duration < 1000) {
                wx.showToast({ title: '说话时间太短啦', icon: 'none' });
                return;
            }

            wx.showLoading({ title: '上传语音中...' });
            try {
                const uploadRes = await wx.cloud.uploadFile({
                    cloudPath: `checkins/voice/${Date.now()}-${Math.floor(Math.random() * 1000)}.mp3`,
                    filePath: tempFilePath
                });

                this.performCheckIn('voice', uploadRes.fileID);
            } catch (err) {
                wx.hideLoading();
                wx.showToast({ title: '语音上传失败', icon: 'none' });
            }
        });

        const options = {
            duration: 60000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'mp3'
        };

        recorderManager.start(options);
        this.recorderManager = recorderManager; // 保存引用
    },

    handleTouchMove(e) {
        if (!this.data.isRecording) return;

        const currentY = e.touches[0].clientY;
        // 上滑超过 50px 视为取消
        if (this.startY - currentY > 50) {
            if (!this.data.willCancel) {
                this.setData({ willCancel: true });
            }
        } else {
            if (this.data.willCancel) {
                this.setData({ willCancel: false });
            }
        }
    },

    stopRecording() {
        if (this.recorderManager) {
            this.recorderManager.stop();
        }
    },

    // 刷新当前书籍进度数据
    async refreshCurrentBookData() {
        try {
            const res = await wx.cloud.callFunction({
                name: 'getUserCurrentTask'
            });

            if (res.result && res.result.code === 0 && res.result.hasBook) {
                const book = res.result.currentBook;
                app.globalData.currentBook = book;
                this.setData({ currentBook: book });
            }
        } catch (err) {
            console.error('[refreshCurrentBookData] 刷新书籍进度失败', err);
        }
    },

    showSuccessAnimation(pointsEarned) {
        this.setData({
            showAnimation: true,
            earnedPoints: pointsEarned // 需要在 data 中添加
        });

        setTimeout(() => {
            this.setData({ showAnimation: false });
            wx.showModal({
                title: `🎉 获得 ${pointsEarned} 积分!`,
                content: '想不想和 AI 老师聊聊刚才读的内容？',
                confirmText: '去聊天',
                cancelText: '待会',
                success: (res) => {
                    if (res.confirm) {
                        wx.switchTab({ url: '/pages/chat/chat' });
                    }
                }
            });
        }, 2000);
    }
});
