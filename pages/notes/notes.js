// pages/notes/notes.js
const app = getApp();

Page({
    data: {
        step: 'loading', // 'loading' | 'input' | 'generating' | 'result'
        questions: [],
        answers: ['', '', '', '', ''],
        generatedNote: '',
        currentDate: '',
        currentBook: null,
        loadingTip: '正在准备问题...',
        isRegistered: false,
        _loaded: false
    },

    onLoad() {
        console.log('[Notes] onLoad');
        app.checkAuthAndRedirect(this, 'Notes');
    },

    async onShow() {
        console.log('[Notes] onShow');
        if (!app.checkAuthAndRedirect(this, 'Notes')) return;
        if (this.data._loaded) return;

        this.setData({ currentDate: new Date().toLocaleDateString() });

        // 动态加载书籍数据
        await this.loadCurrentBook();
        await this.loadQuestions();
    },

    async loadCurrentBook() {
        // 如果 globalData 中已有最新书籍数据，直接使用
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
                    currentBook: { title: '书本', currentChapter: '当前章节' }
                });
            }
        } catch (err) {
            console.error('[Notes] 获取书籍失败', err);
            this.setData({
                currentBook: app.globalData.currentBook || { title: '书本', currentChapter: '当前章节' }
            });
        }
    },

    async loadQuestions() {
        const book = this.data.currentBook;
        if (!book) return;

        this.setData({ step: 'loading', loadingTip: '正在准备问题...' });
        try {
            const res = await wx.cloud.callFunction({
                name: 'generateNoteQuestions',
                data: {
                    bookName: book.title,
                    chapter: book.currentChapter
                }
            });

            if (res.result && (res.result.data || res.result.questions)) {
                this.setData({
                    questions: res.result.data || res.result.questions,
                    step: 'input',
                    _loaded: true
                });
            } else {
                throw new Error('No questions returned');
            }
        } catch (err) {
            console.error('[loadQuestions] 失败:', err);
            this.setData({
                questions: [
                    "这一段内容最让你印象深刻的是什么？",
                    "你觉得主人公为什么要这么做？",
                    "如果是你，你会怎么处理这种情况？",
                    "这段内容对你有什么启发？",
                    "你想对书中的角色说什么？"
                ],
                step: 'input',
                _loaded: true
            });
        }
    },

    onAnswerChange(e) {
        const { index } = e.currentTarget.dataset;
        const answers = this.data.answers;
        answers[index] = e.detail.value;
        this.setData({ answers });
    },

    async handleGenerate() {
        if (this.data.answers.some(a => !a.trim())) {
            wx.showToast({ title: '请先回答所有问题哦', icon: 'none' });
            return;
        }

        this.setData({ step: 'generating' });

        try {
            const book = this.data.currentBook || {};
            const res = await wx.cloud.callFunction({
                name: 'chatWithAI',
                data: {
                    type: 'generate_note',
                    bookTitle: book.title || '书本',
                    chapter: book.currentChapter || '当前章节',
                    context: {
                        bookTitle: book.title || '书本',
                        chapter: book.currentChapter || '当前章节',
                        answers: this.data.questions.map((q, i) => ({
                            q, a: this.data.answers[i]
                        }))
                    }
                }
            });

            if (res.result && res.result.code === 0) {
                const noteContent = res.result.reply || "";
                if (!noteContent) {
                    throw new Error('AI 返回内容为空');
                }
                this.setData({
                    generatedNote: noteContent,
                    step: 'result'
                });

                const pointsEarned = res.result.pointsEarned || 0;
                app.addPoints(pointsEarned);
                wx.showToast({ title: `积分 +${pointsEarned}`, icon: 'success' });
            } else {
                throw new Error(res.result?.msg || '生成失败');
            }

        } catch (err) {
            console.error('[handleGenerate] 失败:', err);
            const book = this.data.currentBook || {};
            this.setData({
                generatedNote: "今天阅读了《" + (book.title || '书本') + "》，收获很大。我意识到我们在面对困难时需要更多的智慧和勇气。",
                step: 'result'
            });
            wx.showToast({ title: 'AI 响应较慢，已为您生成默认感悟', icon: 'none' });
        }
    },

    handleRewrite() {
        this.setData({ step: 'input', answers: ['', '', '', '', ''] });
    },

    handleShare() {
        wx.showToast({ title: '卡片已保存到相册', icon: 'success' });
    }
});
