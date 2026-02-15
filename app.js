// app.js
App({
  globalData: {
    userInfo: null,
    userPoints: 0,
    streak: 0,
    isRegistered: false, // false=未登录, true=已登录
    // 数据库配置（等级、校区）
    levels: [],
    campuses: [],
    configLoaded: false,
    authLoaded: false, // 是否已完成登录检查
    currentBook: null
  },

  // ========== 订阅者列表 ==========
  _loginSubscribers: [],
  _pointsSubscribers: [],
  _configSubscribers: [],

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'cloudbase-7gak18djbca53c89',
      traceUser: true,
    });

    // 启动时并行加载配置和检查登录
    this._loadConfig();
    this._autoLogin();
  },

  // ========== 自动登录（静默） ==========
  _autoLogin() {
    // 先尝试从缓存恢复
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached.openid) {
      this.globalData.userInfo = cached;
      this.globalData.userPoints = cached.points || 0;
      this.globalData.streak = cached.continuous_days || 0;
      this.globalData.isRegistered = true;
      this.globalData.authLoaded = true; // 缓存有数据，先认为加载完成
      this._notifyLoginSubscribers(true);
      this._notifyAuthPendingSubscribers();
    }

    // 无论有无缓存，都向服务器确认一次（静默）
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: res => {
        console.log('[login] 调用成功:', res.result);
        const result = res.result;

        if (result.error) {
          console.error('[login] 服务端错误:', result.error);
          return;
        }

        if (result.registered === false) {
          // 用户未注册
          this.globalData.isRegistered = false;
          this.globalData.authLoaded = true;
          this.globalData.userInfo = null;
          this.globalData.openid = result.openid;
          wx.removeStorageSync('userInfo');
          this._notifyLoginSubscribers(false);
          this._notifyAuthPendingSubscribers();
        } else {
          // 已注册，用最新的服务器数据刷新
          const userInfo = result;
          this.globalData.userInfo = userInfo;
          this.globalData.userPoints = userInfo.points || 0;
          this.globalData.streak = userInfo.continuous_days || 0;
          this.globalData.isRegistered = true;
          this.globalData.authLoaded = true;
          wx.setStorageSync('userInfo', userInfo);
          this._notifyLoginSubscribers(true);
          this._notifyAuthPendingSubscribers();
        }
      },
      fail: err => {
        console.error('[login] 调用失败:', err);
        this.globalData.authLoaded = true; // 失败也标记完成，以允许界面跳转
        this._notifyAuthPendingSubscribers();
        // 网络失败时，保留缓存状态
        if (!cached) {
          this.globalData.isRegistered = false;
          this._notifyLoginSubscribers(false);
        }
      }
    });
  },

  // ========== 用户主动点击"老学员登录" ==========
  login() {
    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: res => {
        wx.hideLoading();
        const result = res.result;

        if (result.registered === false) {
          this.globalData.isRegistered = false;
          this.globalData.openid = result.openid;
          wx.removeStorageSync('userInfo');
          this._notifyLoginSubscribers(false);

          wx.showToast({ title: '未找到账号，请先注册', icon: 'none', duration: 1500 });
          setTimeout(() => {
            wx.navigateTo({ url: '/pages/register/register' });
          }, 1500);
        } else {
          const userInfo = result;
          this.globalData.userInfo = userInfo;
          this.globalData.userPoints = userInfo.points || 0;
          this.globalData.streak = userInfo.continuous_days || 0;
          this.globalData.isRegistered = true;
          wx.setStorageSync('userInfo', userInfo);
          this._notifyLoginSubscribers(true);
          wx.showToast({ title: '登录成功', icon: 'success' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('[login] 调用失败:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  },

  // ========== 注册成功后调用 ==========
  onRegistrationSuccess(userInfo) {
    this.globalData.userInfo = userInfo;
    this.globalData.userPoints = userInfo.points || 0;
    this.globalData.streak = userInfo.continuous_days || 0;
    this.globalData.isRegistered = true;
    wx.setStorageSync('userInfo', userInfo);
    this._notifyLoginSubscribers(true);
  },

  // ========== 订阅/通知机制 ==========
  // 页面订阅登录状态变化（支持多个页面同时监听）
  onLoginStatusChange(callback) {
    if (this._loginSubscribers.indexOf(callback) === -1) {
      this._loginSubscribers.push(callback);
    }
    // 立即用当前状态回调一次
    callback(this.globalData.isRegistered);
  },

  // 页面取消订阅（在 onUnload 时调用，防止内存泄漏）
  offLoginStatusChange(callback) {
    const idx = this._loginSubscribers.indexOf(callback);
    if (idx > -1) {
      this._loginSubscribers.splice(idx, 1);
    }
  },

  _notifyLoginSubscribers(isRegistered) {
    this._loginSubscribers.forEach(cb => cb(isRegistered));
  },

  // ========== 积分 ==========
  addPoints(points) {
    this.globalData.userPoints += points;
    this._pointsSubscribers.forEach(cb => cb(this.globalData.userPoints));
  },

  onPointsChange(callback) {
    if (this._pointsSubscribers.indexOf(callback) === -1) {
      this._pointsSubscribers.push(callback);
    }
  },

  offPointsChange(callback) {
    const idx = this._pointsSubscribers.indexOf(callback);
    if (idx > -1) {
      this._pointsSubscribers.splice(idx, 1);
    }
  },

  // ========== 统一登录守卫 ==========
  /**
   * 严格权限检查 (适用于 Tab 页面)
   * 配合 WXML 中的 wx:if="{{isRegistered}}" 使用，极致防止闪烁和绕过
   * @param {Object} page 页面实例 (this)
   * @param {string} pageName 调试用名称
   * @returns {boolean} 当前是否已确认登录
   */
  checkAuthAndRedirect(page, pageName = 'Unknown') {
    const { isRegistered, authLoaded } = this.globalData;

    // 立即同步页面本地状态，由 WXML 的 wx:if 接管渲染控制
    page.setData({ isRegistered });

    console.log(`[AuthGuard] ${pageName} 校验... authLoaded: ${authLoaded}, isRegistered: ${isRegistered}`);

    // 加载中且未登录 -> 注册异步跳转
    if (!authLoaded) {
      console.log(`[AuthGuard] ${pageName} 登录流程未完成，加入等待队列`);
      this._addAuthPendingSubscriber(() => {
        // 状态更新时再次同步给页面
        const currentIsReg = this.globalData.isRegistered;
        page.setData({ isRegistered: currentIsReg });
        if (!currentIsReg) {
          console.log(`[AuthGuard] ${pageName} 异步跳转 -> 首页`);
          wx.switchTab({ url: '/pages/home/home' });
        }
      });
      return false;
    }

    // 已加载且未登录 -> 立即跳转
    if (!isRegistered) {
      wx.switchTab({ url: '/pages/home/home' });
      return false;
    }

    return true; // 确定已登录
  },

  _authPendingSubscribers: [],
  _addAuthPendingSubscriber(cb) {
    this._authPendingSubscribers.push(cb);
  },
  _notifyAuthPendingSubscribers() {
    this._authPendingSubscribers.forEach(cb => cb());
    this._authPendingSubscribers = [];
  },

  // ========== 配置加载 ==========
  _loadConfig() {
    console.log('[App] 开始加载配置...');
    wx.cloud.callFunction({
      name: 'getConfig',
      success: res => {
        const { levels, campuses } = res.result || {};
        this.globalData.levels = levels || [];
        this.globalData.campuses = campuses || [];
        this.globalData.configLoaded = true;
        this._configSubscribers.forEach(cb => cb(this.globalData.levels, this.globalData.campuses));
        this._configSubscribers = [];
      },
      fail: err => {
        console.error('[getConfig] 失败:', err);
        this.globalData.configLoaded = true;
        if (this.globalData.levels.length === 0) {
          this.globalData.levels = [{ id: 1, name: '阅读小白' }];
        }
        this._configSubscribers.forEach(cb => cb(this.globalData.levels, this.globalData.campuses));
        this._configSubscribers = [];
      }
    });
  },

  // 页面等待配置就绪
  onConfigReady(callback) {
    if (this.globalData.configLoaded) {
      callback(this.globalData.levels, this.globalData.campuses);
    } else {
      this._configSubscribers.push(callback);
    }
  }
});
