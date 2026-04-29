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

function renderMathImage(latex, block = false) {
  const expr = String(latex || "").trim()
  if (!expr) return ""
  const encoded = encodeURIComponent(`\\dpi{160} ${expr}`)
  const src = `https://latex.codecogs.com/svg.image?${encoded}`
  if (block) {
    return `<img src="${src}" style="display:block;max-width:100%;margin:10px auto;" />`
  }
  return `<img src="${src}" style="display:inline-block;vertical-align:middle;max-height:1.6em;" />`
}

function renderInlineMarkdown(text) {
  return String(text || "")
    .replace(/\\\((.+?)\\\)/g, (_, expr) => renderMathImage(expr, false))
    .replace(/\$([^$\n]+)\$/g, (_, expr) => renderMathImage(expr, false))
    .replace(/`([^`]+)`/g, "<code style=\"background:#eef0f4;padding:2px 4px;border-radius:4px;font-family:monospace;\">$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
}

function renderBlockMath(content) {
  return renderMathImage(content, true)
}

function parseTableRow(line) {
  const raw = String(line || "").trim()
  if (!raw.includes("|")) return null
  const noEdge = raw.replace(/^\|/, "").replace(/\|$/, "")
  return noEdge.split("|").map((cell) => renderInlineMarkdown(escapeHtml(cell.trim())))
}

function isTableDividerRow(line) {
  const cells = parseTableRow(line)
  if (!cells || !cells.length) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/&amp;/g, "&")))
}

function renderTable(lines) {
  const header = parseTableRow(lines[0]) || []
  const bodyRows = lines.slice(2).map((line) => parseTableRow(line)).filter(Boolean)
  const headHtml = header
    .map((cell) => `<th style="border:1px solid #d1d5db;padding:8px 10px;background:#f3f4f6;font-weight:700;text-align:left;">${cell}</th>`)
    .join("")
  const bodyHtml = bodyRows
    .map((row, idx) => {
      const rowBg = idx % 2 === 1 ? "background:#f9fafb;" : ""
      const tds = row
        .map((cell) => `<td style="border:1px solid #d1d5db;padding:8px 10px;vertical-align:top;">${cell}</td>`)
        .join("")
      return `<tr style="${rowBg}">${tds}</tr>`
    })
    .join("")
  return `<table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:15px;line-height:1.6;"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

function markdownToRichText(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n")
  const blocks = source.split("\n")
  const html = []
  let inCode = false
  let inUl = false
  let inOl = false
  let i = 0

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

  while (i < blocks.length) {
    const line = blocks[i]
    if (line.trim().startsWith("```")) {
      closeLists()
      if (!inCode) {
        inCode = true
        html.push("<pre style=\"background:#f6f7f9;padding:12px 14px;border-radius:10px;overflow:auto;margin:10px 0;\"><code>")
      } else {
        inCode = false
        html.push("</code></pre>")
      }
      i += 1
      continue
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`)
      i += 1
      continue
    }

    // 多行块公式：$$ ... $$（分隔符可独占多行）
    if (line.trim() === "$$") {
      closeLists()
      let j = i + 1
      const mathLines = []
      while (j < blocks.length && blocks[j].trim() !== "$$") {
        mathLines.push(blocks[j])
        j += 1
      }
      html.push(renderBlockMath(mathLines.join("\n")))
      i = j < blocks.length ? j + 1 : j
      continue
    }

    // 多行块公式：\[ ... \]
    if (line.trim() === "\\[") {
      closeLists()
      let j = i + 1
      const mathLines = []
      while (j < blocks.length && blocks[j].trim() !== "\\]") {
        mathLines.push(blocks[j])
        j += 1
      }
      html.push(renderBlockMath(mathLines.join("\n")))
      i = j < blocks.length ? j + 1 : j
      continue
    }

    const tableHead = parseTableRow(line)
    const tableDivider = blocks[i + 1] ? isTableDividerRow(blocks[i + 1]) : false
    if (tableHead && tableDivider) {
      closeLists()
      const tableLines = [line, blocks[i + 1]]
      let j = i + 2
      while (j < blocks.length) {
        const row = parseTableRow(blocks[j])
        if (!row) break
        tableLines.push(blocks[j])
        j += 1
      }
      html.push(renderTable(tableLines))
      i = j
      continue
    }

    if (!line.trim()) {
      closeLists()
      html.push("<p style=\"margin:8px 0;\"></p>")
      i += 1
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeLists()
      const level = h[1].length
      const headingSizeMap = {
        1: 20,
        2: 18,
        3: 17,
        4: 16,
        5: 15,
        6: 14
      }
      const fontSize = headingSizeMap[level] || 14
      const marginBottom = level === 1 ? "16px" : "8px"
      html.push(`<h${level} style="margin:14px 0 ${marginBottom};font-size:${fontSize}px;font-weight:700;line-height:1.35;">${renderInlineMarkdown(escapeHtml(h[2]))}</h${level}>`)
      i += 1
      continue
    }

    const blockMath = line.match(/^\s*\$\$(.+)\$\$\s*$/)
    if (blockMath) {
      closeLists()
      html.push(renderBlockMath(blockMath[1]))
      i += 1
      continue
    }

    if (/^---+$/.test(line.trim())) {
      closeLists()
      html.push("<hr style=\"border:none;border-top:1px solid #d1d5db;margin:12px 0;\"/>")
      i += 1
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (inOl) {
        html.push("</ol>")
        inOl = false
      }
      if (!inUl) {
        inUl = true
        html.push("<ul style=\"padding-left:22px;margin:8px 0;line-height:1.8;\">")
      }
      html.push(`<li style="margin:3px 0;">${renderInlineMarkdown(escapeHtml(ul[1]))}</li>`)
      i += 1
      continue
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (inUl) {
        html.push("</ul>")
        inUl = false
      }
      if (!inOl) {
        inOl = true
        html.push("<ol style=\"padding-left:24px;margin:8px 0;line-height:1.8;\">")
      }
      html.push(`<li style="margin:3px 0;">${renderInlineMarkdown(escapeHtml(ol[1]))}</li>`)
      i += 1
      continue
    }

    closeLists()
    html.push(`<p style="margin:8px 0;line-height:1.8;font-size:31rpx;">${renderInlineMarkdown(escapeHtml(line))}</p>`)
    i += 1
  }

  closeLists()
  if (inCode) {
    html.push("</code></pre>")
  }
  return html.join("")
}

function stripThinkContent(text) {
  const source = String(text || "")
  return source
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .trim()
}

function buildAssistantMessage(content) {
  const safeContent = stripThinkContent(content)
  return {
    role: "assistant",
    content: safeContent,
    richText: markdownToRichText(safeContent)
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
