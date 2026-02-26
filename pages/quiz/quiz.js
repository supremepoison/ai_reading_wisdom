// pages/quiz/quiz.js
const app = getApp();

Page({
    data: {
        // 三个关卡定义
        levels: [
            { id: 1, label: '第一关：基础题', type: 'choice' },
            { id: 2, label: '第二关：理解题', type: 'choice' },
            { id: 3, label: '第三关：挑战题', type: 'choice' }
        ],
        currentLevelIndex: 0,
        currentQuestions: [],
        currentQuestion: null,
        currentQIndex: 0,
        selectedOption: null,
        isCorrect: null,
        showExplanation: false,
        isLoading: false,
        loadingTip: '正在加载题目...',
        correctCount: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        isRegistered: false,
        _loaded: false,
        currentBook: null
    },

    onLoad() {
        app.checkAuthAndRedirect(this, 'Quiz');
    },

    async onShow() {
        if (!app.checkAuthAndRedirect(this, 'Quiz')) return;
        if (this.data._loaded && this.data.currentBook) return;

        // 1. 获取当前书籍数据
        await this.loadCurrentBook();

        // 2. 从第一关开始
        this.setData({
            currentLevelIndex: 0,
            totalCorrect: 0,
            totalQuestions: 0,
            _loaded: true
        });

        this.loadCurrentLevel();
    },

    async loadCurrentBook() {
        if (app.globalData.currentBook && app.globalData.currentBook.title) {
            this.setData({ currentBook: app.globalData.currentBook });
            return;
        }

        try {
            const res = await wx.cloud.callFunction({ name: 'getUserCurrentTask' });
            if (res.result.code === 0 && res.result.hasBook) {
                const book = res.result.currentBook;
                app.globalData.currentBook = book;
                this.setData({ currentBook: book });
            } else {
                this.setData({
                    currentBook: { title: '西游记', currentChapter: '第七回' }
                });
            }
        } catch (err) {
            console.error('[Quiz] 获取书籍失败', err);
            this.setData({
                currentBook: app.globalData.currentBook || { title: '西游记', currentChapter: '第七回' }
            });
        }
    },

    // 加载当前关卡的题目
    async loadCurrentLevel() {
        const { levels, currentLevelIndex, currentBook } = this.data;
        if (!currentBook) {
            console.error('[loadCurrentLevel] No currentBook, loading it first');
            await this.loadCurrentBook();
        }

        const currentLevel = levels[currentLevelIndex];
        this.setData({ isLoading: true, loadingTip: `正在加载${currentLevel.label}...` });

        try {
            const res = await wx.cloud.callFunction({
                name: 'generateQuiz',
                data: {
                    bookName: this.data.currentBook.title || '西游记',
                    chapter: this.data.currentBook.currentChapter || '第一回',
                    level: currentLevel.id
                }
            });

            wx.hideLoading(); // 必须调用，否则 handleNext 开启的 loading 不会消失

            if (res.result && res.result.code === 0 && res.result.data) {
                const questions = res.result.data;
                this.setData({
                    currentQuestions: questions,
                    currentQuestion: questions[0],
                    currentQIndex: 0,
                    selectedOption: null,
                    isCorrect: null,
                    showExplanation: false,
                    isLoading: false,
                    correctCount: 0
                });
            } else {
                throw new Error(res.result.msg || '获取题目失败');
            }
        } catch (err) {
            console.error('[loadCurrentLevel] 失败:', err);
            wx.hideLoading();
            wx.showToast({ title: '题目加载失败，请重试', icon: 'none' });
            this.setData({ isLoading: false });
        }
    },

    // 选择答案
    selectOption(e) {
        if (this.data.isCorrect !== null) return; // 已答题

        const { index } = e.currentTarget.dataset;
        const { currentQuestion } = this.data;
        const isCorrect = (index === currentQuestion.correctIndex);

        this.setData({
            selectedOption: index,
            isCorrect: isCorrect,
            showExplanation: true,
            correctCount: isCorrect ? this.data.correctCount + 1 : this.data.correctCount
        });
    },

    // 处理“下一题/下一关”点击
    handleNext() {
        const { currentQuestions, currentQIndex, currentLevelIndex, levels, correctCount, totalCorrect, totalQuestions } = this.data;

        if (currentQIndex < currentQuestions.length - 1) {
            // 情况 A: 下一题
            const nextIndex = currentQIndex + 1;
            this.setData({
                currentQuestion: currentQuestions[nextIndex],
                currentQIndex: nextIndex,
                selectedOption: null,
                isCorrect: null,
                showExplanation: false
            });
        } else {
            // 情况 B: 关卡结束
            const newTotalCorrect = totalCorrect + correctCount;
            const newTotalQuestions = totalQuestions + currentQuestions.length;

            if (currentLevelIndex < levels.length - 1) {
                // 跳转下一关（去掉 Modal 减少弹窗，直接加载）
                wx.showLoading({ title: '正在进入下一关' });
                this.setData({
                    currentLevelIndex: currentLevelIndex + 1,
                    totalCorrect: newTotalCorrect,
                    totalQuestions: newTotalQuestions,
                    showExplanation: false,
                    selectedOption: null,
                    isCorrect: null
                });
                this.loadCurrentLevel();
            } else {
                // 全部通关
                this.finishQuiz(newTotalCorrect, newTotalQuestions);
            }
        }
    },

    async finishQuiz(totalCorrect, totalQuestions) {
        // 1 题 1 分，全对通过则 10 分
        const score = totalCorrect === totalQuestions ? 10 : totalCorrect;
        wx.showLoading({ title: '提交中...' });

        try {
            const res = await wx.cloud.callFunction({
                name: 'submitQuiz',
                data: {
                    bookName: this.data.currentBook.title,
                    chapter: this.data.currentBook.currentChapter,
                    score: score,
                    correctCount: totalCorrect,
                    totalQuestions: totalQuestions
                }
            });

            wx.hideLoading();
            const earned = res.result?.pointsEarned ?? 0;
            wx.navigateTo({
                url: `/subPackages/quiz/quiz-result/quiz-result?correct=${totalCorrect}&total=${totalQuestions}&score=${earned}`
            });
        } catch (err) {
            console.error('[finishQuiz] 失败:', err);
            wx.hideLoading();
            wx.navigateTo({
                url: `/subPackages/quiz/quiz-result/quiz-result?correct=${totalCorrect}&total=${totalQuestions}&score=0`
            });
        }
    }
});
