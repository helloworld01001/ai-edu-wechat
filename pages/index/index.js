const { MODEL_API_CONFIG } = require("../../utils/model-api")

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "上午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

function safeStringify(data) {
  if (typeof data === "string") return data
  try {
    return JSON.stringify(data)
  } catch (e) {
    return String(data || "")
  }
}

Page({
  data: {
    userName: "112",
    assistantName: "启小智",
    greeting: getGreeting(),
    inputText: "",
    canSend: false,
    loading: false,
    messages: [],
    suggestions: [
      {
        title: "概念判断题",
        desc: "给我 5 道人工智能概念判断题，难度初中到高中。",
        emoji: "✅"
      },
      {
        title: "学习规划",
        desc: "帮我做一份适合初中生的暑假 AI 启蒙学习计划。",
        emoji: "🗺️"
      },
      {
        title: "深度学习题",
        desc: "出 2 道关于 CNN 和 Transformer 的理解题。",
        emoji: "🧩"
      },
      {
        title: "AI 应用",
        desc: "人工智能现在在哪些地方已经帮到我们了？",
        emoji: "✨"
      }
    ]
  },

  onLoad() {
    const sessionId = wx.getStorageSync("chat_session_id") || ""
    if (sessionId) {
      this.sessionId = sessionId
    }
  },

  onInput(e) {
    const value = e.detail.value || ""
    this.setData({
      inputText: value,
      canSend: !!value.trim()
    })
  },

  useSuggestion(e) {
    const text = e.currentTarget.dataset.text || ""
    this.setData({
      inputText: text,
      canSend: !!text.trim()
    })
  },

  async sendMessage() {
    const prompt = this.data.inputText.trim()
    if (!prompt || this.data.loading) {
      return
    }

    const userMsg = { role: "user", content: prompt }
    const updatedMessages = [...this.data.messages, userMsg]

    this.setData({
      loading: true,
      inputText: "",
      canSend: false,
      messages: updatedMessages
    })

    try {
      const reply = await this.requestModel(prompt)
      this.setData({
        messages: [...updatedMessages, { role: "assistant", content: reply }]
      })
    } catch (error) {
      this.setData({
        messages: [
          ...updatedMessages,
          {
            role: "assistant",
            content: `请求失败：${error.message || "请检查接口配置"}`
          }
        ]
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  requestModel(message) {
    const { backendBaseUrl, chatEndpoint } = MODEL_API_CONFIG
    const requestUrl = `${backendBaseUrl}${chatEndpoint}`
    return new Promise((resolve, reject) => {
      wx.request({
        url: requestUrl,
        method: "POST",
        timeout: 30000,
        header: {
          "Content-Type": "application/json"
        },
        data: {
          message,
          session_id: this.sessionId || undefined
        },
        success: (res) => {
          const result = res.data || {}
          if (res.statusCode >= 200 && res.statusCode < 300 && result.ok) {
            if (result.session_id) {
              this.sessionId = result.session_id
              wx.setStorageSync("chat_session_id", result.session_id)
            }
            resolve(result.reply || result.content || "")
            return
          }
          const errorCode = result?.error?.code ? `[${result.error.code}] ` : ""
          const errorMessage = result?.error?.message || result?.error || "模型返回异常"
          const responsePreview = safeStringify(res.data).slice(0, 240)
          reject(
            new Error(
              `${errorCode}${errorMessage}\nHTTP: ${res.statusCode}\nURL: ${requestUrl}\n响应: ${responsePreview}`
            )
          )
        },
        fail: (err) => {
          reject(
            new Error(
              `${err.errMsg || "后端接口调用失败"}\nURL: ${requestUrl}\n请检查：1) 合法域名 2) HTTPS 3) 后端在线`
            )
          )
        }
      })
    })
  }
})
