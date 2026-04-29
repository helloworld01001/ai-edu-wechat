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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "<code style=\"background:#eef0f4;padding:2px 4px;border-radius:4px;font-family:monospace;\">$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
}

function markdownToRichText(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n")
  const blocks = source.split("\n")
  const html = []
  let inCode = false
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>")
      inUl = false
    }
    if (inOl) {
      html.push("</ol>")
      inOl = false
    }
  }

  blocks.forEach((line) => {
    if (line.trim().startsWith("```")) {
      closeLists()
      if (!inCode) {
        inCode = true
        html.push("<pre style=\"background:#f6f7f9;padding:10px 12px;border-radius:8px;overflow:auto;\"><code>")
      } else {
        inCode = false
        html.push("</code></pre>")
      }
      return
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`)
      return
    }

    if (!line.trim()) {
      closeLists()
      html.push("<p style=\"margin:6px 0;\"></p>")
      return
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeLists()
      const level = h[1].length
      const fontSize = Math.max(20 - level * 2, 13)
      html.push(`<h${level} style="margin:10px 0 6px;font-size:${fontSize}px;font-weight:600;">${renderInlineMarkdown(escapeHtml(h[2]))}</h${level}>`)
      return
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (inOl) {
        html.push("</ol>")
        inOl = false
      }
      if (!inUl) {
        inUl = true
        html.push("<ul style=\"padding-left:18px;margin:6px 0;\">")
      }
      html.push(`<li style="margin:2px 0;">${renderInlineMarkdown(escapeHtml(ul[1]))}</li>`)
      return
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (inUl) {
        html.push("</ul>")
        inUl = false
      }
      if (!inOl) {
        inOl = true
        html.push("<ol style=\"padding-left:20px;margin:6px 0;\">")
      }
      html.push(`<li style="margin:2px 0;">${renderInlineMarkdown(escapeHtml(ol[1]))}</li>`)
      return
    }

    closeLists()
    html.push(`<p style="margin:6px 0;line-height:1.7;">${renderInlineMarkdown(escapeHtml(line))}</p>`)
  })

  closeLists()
  if (inCode) {
    html.push("</code></pre>")
  }
  return html.join("")
}

function buildAssistantMessage(content) {
  return {
    role: "assistant",
    content,
    richText: markdownToRichText(content)
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
        messages: [...updatedMessages, buildAssistantMessage(reply)]
      })
    } catch (error) {
      this.setData({
        messages: [
          ...updatedMessages,
          buildAssistantMessage(`请求失败：${error.message || "请检查接口配置"}`)
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
        timeout: 120000,
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
