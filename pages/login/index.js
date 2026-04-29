const { MODEL_API_CONFIG } = require("../../utils/model-api")

Page({
  data: {
    username: "",
    password: "",
    loading: false
  },

  onUsernameInput(e) {
    this.setData({ username: (e.detail.value || "").trim() })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value || "" })
  },

  _request(url, data) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: "POST",
        timeout: 120000,
        header: { "Content-Type": "application/json" },
        data,
        success: (res) => {
          const result = res.data || {}
          if (res.statusCode >= 200 && res.statusCode < 300 && result.ok) {
            resolve(result)
            return
          }
          reject(new Error(result?.error?.message || "请求失败"))
        },
        fail: (err) => reject(new Error(err.errMsg || "网络异常"))
      })
    })
  },

  _saveLogin(result) {
    wx.setStorageSync("auth_token", result.token || "")
    wx.setStorageSync("auth_user", result.user || {})
  },

  async onLogin() {
    const { username, password } = this.data
    if (!username || !password) {
      wx.showToast({ title: "请输入用户名和密码", icon: "none" })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await this._request(
        `${MODEL_API_CONFIG.backendBaseUrl}${MODEL_API_CONFIG.authLoginEndpoint}`,
        { username, password }
      )
      this._saveLogin(result)
      wx.showToast({ title: "登录成功", icon: "success" })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 300)
    } catch (e) {
      wx.showToast({ title: e.message || "登录失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onRegister() {
    const { username, password } = this.data
    if (!username || !password) {
      wx.showToast({ title: "请输入用户名和密码", icon: "none" })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await this._request(
        `${MODEL_API_CONFIG.backendBaseUrl}${MODEL_API_CONFIG.authRegisterEndpoint}`,
        { username, password, display_name: username }
      )
      this._saveLogin(result)
      wx.showToast({ title: "注册成功", icon: "success" })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 300)
    } catch (e) {
      wx.showToast({ title: e.message || "注册失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  }
})
// pages/login/index.js
Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})