const app = getApp();

Page({
    data: {
        bookTitle: '',
        score: 0,
        totalQuestions: 0,
        correctCount: 0,
        pointsEarned: 0
    },

    onLoad(options) {
        // 登录检查
        if (!app.globalData.isRegistered) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(() => {
                wx.switchTab({ url: '/pages/home/home' });
            }, 1000);
            return;
        }

        const score = parseInt(options.score) || 0;
        const total = parseInt(options.total) || 0;
        const correct = parseInt(options.correct) || 0;
        const bookTitle = app.globalData.currentBook?.title || '书籍';

        this.setData({
            bookTitle: bookTitle,
            score: score,
            totalQuestions: total,
            correctCount: correct,
            pointsEarned: score // 积分等于总得分
        });
    },

    onShareAppMessage() {
        return {
            title: `我在《${this.data.bookTitle}》闯关中得了${this.data.score}分！`,
            path: '/pages/home/home'
        }
    },

    goBack() {
        wx.navigateBack({
            delta: 1
        });
    },

    goHome() {
        wx.switchTab({
            url: '/pages/home/home'
        });
    }
});
