// pages/chat/chat.js
const app = getApp();

Page({
    data: {
        messages: [],
        inputText: '',
        isLoading: false,
        isRegistered: false,
        _loaded: false,
        scrollToView: 'msg-bottom',
        currentBook: null
    },

    onLoad() {
        console.log('[Chat] onLoad');
        app.checkAuthAndRedirect(this, 'Chat');

        this._loginCb = (isRegistered) => {
            console.log('[Chat] 登录状态回调:', isRegistered);
            this.setData({ isRegistered });
            if (isRegistered && this.data.messages.length === 0) {
                this.loadBookAndInit();
            }
        };
        app.onLoginStatusChange(this._loginCb);
    },

    onShow() {
        console.log('[Chat] onShow');
        if (!app.checkAuthAndRedirect(this, 'Chat')) return;

        // 如果 globalData 已有书籍数据且本页还没初始化过，使用它
        if (app.globalData.currentBook && !this.data.currentBook) {
            this.setData({ currentBook: app.globalData.currentBook });
            if (this.data.messages.length === 0) {
                this.initChat();
            }
        }
    },

    // 从数据库加载当前书籍，然后初始化对话
    async loadBookAndInit() {
        try {
            const res = await wx.cloud.callFunction({ name: 'getUserCurrentTask' });
            if (res.result.code === 0 && res.result.hasBook) {
                const book = res.result.currentBook;
                app.globalData.currentBook = book;
                this.setData({ currentBook: book });
            } else {
                // 没有选书，使用全局 fallback
                this.setData({
                    currentBook: app.globalData.currentBook || { title: '书本', currentChapter: '当前章节' }
                });
            }
        } catch (err) {
            console.error('[Chat] 获取书籍失败', err);
            this.setData({
                currentBook: app.globalData.currentBook || { title: '书本', currentChapter: '当前章节' }
            });
        }
        this.initChat();
    },

    goToRegister() {
        wx.navigateTo({ url: '/pages/register/register' });
    },

    handleLogin() {
        app.login();
    },

    initChat() {
        const book = this.data.currentBook || {};
        const title = book.title || '书本';
        const chapter = book.currentChapter || '当前章节';

        const welcomeMessage = {
            id: 'welcome-' + Date.now(),
            role: 'ai',
            text: `你好！我是《${title}》的书灵 ✨ 我们正在读${chapter}，你有什么想和我聊聊的吗？`,
            timestamp: new Date().toLocaleTimeString()
        };
        this.setData({
            messages: [welcomeMessage]
        });
    },

    onInputChange(e) {
        this.setData({ inputText: e.detail.value });
    },

    async handleSend() {
        const text = this.data.inputText.trim();
        if (!text || this.data.isLoading) return;

        const userMsg = {
            id: 'user-' + Date.now(),
            role: 'user',
            text: text,
            timestamp: new Date().toLocaleTimeString()
        };

        const newMessages = [...this.data.messages, userMsg];
        this.setData({
            messages: newMessages,
            inputText: '',
            isLoading: true,
            scrollToView: 'msg-bottom'
        });

        try {
            const book = this.data.currentBook || {};
            const res = await wx.cloud.callFunction({
                name: 'smartDialogueAgent',
                data: {
                    message: text,
                    bookName: book.title || '书本',
                    chapter: book.currentChapter || '当前章节',
                    history: this.data.messages.slice(-6).map(m => ({
                        role: m.role === 'ai' ? 'assistant' : m.role,
                        content: m.text
                    }))
                }
            });

            console.log('[smartDialogueAgent] 结果:', res.result);

            const result = res.result || {};
            const aiText = result.reply || '唔，我刚才走神了，能再说一遍吗？';
            const aiMsg = {
                id: 'ai-' + Date.now(),
                role: 'ai',
                text: aiText,
                type: result.type || 'chat',
                intent: result.intent || 'chatting',
                plan: result.plan || null,
                timestamp: new Date().toLocaleTimeString()
            };

            this.setData({
                messages: [...this.data.messages, aiMsg],
                isLoading: false,
                scrollToView: 'msg-bottom'
            });

            // 如果是计划类型，显示操作按钮
            if (result.type === 'plan' && result.plan) {
                this.showPlanActions(result.plan);
            }

        } catch (err) {
            console.error('[smartDialogueAgent] 失败:', err);
            wx.showToast({ title: 'AI 走神了，请重试', icon: 'none' });
            this.setData({ isLoading: false });
        }
    },

    /**
     * 显示计划操作（后续升级为 UI 按钮）
     */
    showPlanActions(plan) {
        console.log('[Plan] 收到计划:', plan.plan_name);
        // 卡片已由 WXML 渲染
    },

    async handleConfirmPlan(e) {
        const { plan, msgid } = e.currentTarget.dataset;
        wx.showLoading({ title: '生成中...' });

        try {
            const res = await wx.cloud.callFunction({
                name: 'saveUserPlan',
                data: { plan }
            });

            wx.hideLoading();

            if (res.result && res.result.code === 0) {
                // 更新页面上该卡片的状态为已完成，隐藏按钮
                const messages = [...this.data.messages];
                const msgIndex = messages.findIndex(m => m.id === msgid);
                if (msgIndex !== -1) {
                    messages[msgIndex].plan.accepted = true;
                    this.setData({ messages });
                }

                wx.showToast({ title: '计划已确立', icon: 'success' });

                // 发送确认消息给 AI
                this.setData({ inputText: "就按这个计划来吧！" }, () => {
                    this.handleSend();
                });
            } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            console.error('[saveUserPlan] 失败:', err);
            wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        }
    },

    handleAdjustPlan(e) {
        // 请求优化专员调整
        this.setData({ inputText: "这有点难，能减少一点任务吗？" }, () => {
            this.handleSend();
        });
    },

    onUnload() {
        if (this._loginCb) {
            app.offLoginStatusChange(this._loginCb);
        }
    }
});
