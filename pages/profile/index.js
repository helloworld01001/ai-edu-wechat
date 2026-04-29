const { MODEL_API_CONFIG } = require("../../utils/model-api")

Page({
  data: {
    isLoggedIn: false,
    user: {}
  },
  onShow() {
    const token = wx.getStorageSync("auth_token") || ""
    const user = wx.getStorageSync("auth_user") || {}
    this.setData({
      isLoggedIn: !!token,
      user: user || {}
    })
    if (token) {
      this.fetchMe(token)
    }
  },
  onLoginTap() {
    if (this.data.isLoggedIn) return
    wx.navigateTo({ url: "/pages/login/index" })
  },
  onSettingsTap() {
    wx.showToast({
      title: "设置功能待接入",
      icon: "none"
    })
  },
  onLogoutTap() {
    const token = wx.getStorageSync("auth_token") || ""
    if (!token) {
      wx.showToast({ title: "当前未登录", icon: "none" })
      return
    }
    wx.request({
      url: `${MODEL_API_CONFIG.backendBaseUrl}${MODEL_API_CONFIG.authLogoutEndpoint}`,
      method: "POST",
      header: { Authorization: `Bearer ${token}` },
      complete: () => {
        wx.removeStorageSync("auth_token")
        wx.removeStorageSync("auth_user")
        this.setData({ isLoggedIn: false, user: {} })
        wx.showToast({ title: "已退出登录", icon: "success" })
      }
    })
  },
  onFeedbackTap() {
    wx.showToast({
      title: "投诉与建议待接入",
      icon: "none"
    })
  },
  onSupportTap() {
    wx.showToast({
      title: "客服功能待接入",
      icon: "none"
    })
  },
  fetchMe(token) {
    wx.request({
      url: `${MODEL_API_CONFIG.backendBaseUrl}${MODEL_API_CONFIG.authMeEndpoint}`,
      method: "GET",
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        const result = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300 && result.ok && result.user) {
          wx.setStorageSync("auth_user", result.user)
          this.setData({ isLoggedIn: true, user: result.user })
        }
      },
      fail: () => {}
    })
  }
})