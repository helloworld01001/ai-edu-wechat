const { MODEL_API_CONFIG } = require("../../utils/model-api")
const { suggestionPool } = require("../../utils/suggestion-pool")

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

function extractCodeBlocks(markdown) {
  const source = String(markdown || "")
  const result = []
  const reg = /```[^\n]*\n([\s\S]*?)```/g
  let m = reg.exec(source)
  while (m) {
    result.push((m[1] || "").trim())
    m = reg.exec(source)
  }
  return result
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
  let codeLang = ""
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
        codeLang = (line.trim().slice(3).trim().split(/\s+/)[0] || "text").toLowerCase()
        html.push(
          `<div style="margin:10px 0;border-radius:10px;background:#f6f7f9;overflow:hidden;">` +
          `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px 4px;">` +
          `<span style="font-size:12px;color:#8b94a6;font-family:monospace;">${escapeHtml(codeLang)}</span>` +
          `<span style="font-size:12px;color:#8b94a6;">复制</span>` +
          `</div>` +
          `<pre style="margin:0;padding:8px 14px 12px;overflow:auto;background:transparent;"><code>`
        )
      } else {
        inCode = false
        codeLang = ""
        html.push("</code></pre></div>")
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
    html.push("</code></pre></div>")
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
    richText: markdownToRichText(safeContent),
    segments: splitAssistantSegments(safeContent)
  }
}

function buildUserMessage(content) {
  const safeContent = String(content || "")
  return {
    role: "user",
    content: safeContent,
    richText: `<p style="margin:0;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${escapeHtml(safeContent)}</p>`
  }
}

function splitAssistantSegments(markdown) {
  const source = String(markdown || "")
  const reg = /```([^\n]*)\n([\s\S]*?)```/g
  const segments = []
  let last = 0
  let m = reg.exec(source)
  while (m) {
    const textPart = source.slice(last, m.index)
    if (textPart && textPart.trim()) {
      segments.push({
        type: "text",
        html: markdownToRichText(textPart)
      })
    }
    const lang = ((m[1] || "").trim().split(/\s+/)[0] || "text").toLowerCase()
    const code = String(m[2] || "").replace(/\n$/, "")
    segments.push({
      type: "code",
      lang,
      code
    })
    last = reg.lastIndex
    m = reg.exec(source)
  }
  const tail = source.slice(last)
  if (tail && tail.trim()) {
    segments.push({
      type: "text",
      html: markdownToRichText(tail)
    })
  }
  if (!segments.length) {
    segments.push({ type: "text", html: markdownToRichText(source) })
  }
  return segments
}

function normalizeSuggestionGroup(group) {
  return (group || []).map((item) => ({
    title: item.tag || "",
    desc: item.text || "",
    emoji: item.icon || "✨"
  }))
}

function pickRandomSuggestions(pool, count = 4) {
  const all = (pool || []).reduce((acc, group) => acc.concat(normalizeSuggestionGroup(group)), [])
  if (!all.length) return []
  const copied = [...all]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copied[i]
    copied[i] = copied[j]
    copied[j] = temp
  }
  return copied.slice(0, Math.min(count, copied.length))
}

Page({
  data: {
    userName: "同学",
    assistantName: "启小智",
    greeting: getGreeting(),
    inputText: "",
    canSend: false,
    showQuickActions: false,
    loading: false,
    messages: [],
    suggestions: pickRandomSuggestions(suggestionPool, 4)
  },

  onLoad() {
    const sessionId = wx.getStorageSync("chat_session_id") || ""
    if (sessionId) {
      this.sessionId = sessionId
    }
    this.syncUserName()
  },

  onShow() {
    this.syncUserName()
  },

  syncUserName() {
    const user = wx.getStorageSync("auth_user") || {}
    const userName = (user.display_name || user.username || "").trim() || "同学"
    if (userName !== this.data.userName) {
      this.setData({ userName })
    }
  },

  onInput(e) {
    const value = e.detail.value || ""
    this.setData({
      inputText: value,
      canSend: !!value.trim()
    })
  },

  noop() {},

  closeQuickActions() {
    if (this.data.showQuickActions) {
      this.setData({ showQuickActions: false })
    }
  },

  toggleQuickActions() {
    this.setData({ showQuickActions: !this.data.showQuickActions })
  },

  onQuickActionTap(e) {
    const t = e.currentTarget.dataset.type
    const prompts = {
      qa: "请帮我解答这道题，并一步步讲清楚思路：",
      code: "请帮我完成这段编程任务，并解释关键代码：",
      research: "请围绕这个主题做深入研究，并给出结构化分析："
    }
    const text = prompts[t] || ""
    this.setData({
      inputText: text,
      canSend: !!text.trim(),
      showQuickActions: false
    })
  },

  useSuggestion(e) {
    const text = e.currentTarget.dataset.text || ""
    this.closeQuickActions()
    this.sendPrompt(text)
  },

  onCopyCodeTap(e) {
    const msgIndex = Number(e?.currentTarget?.dataset?.msgIndex)
    const segIndex = Number(e?.currentTarget?.dataset?.segIndex)
    if (Number.isNaN(msgIndex) || Number.isNaN(segIndex)) return
    const msg = this.data.messages[msgIndex]
    const seg = msg?.segments?.[segIndex]
    const code = seg?.type === "code" ? seg.code : ""
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "已复制", icon: "success" })
    })
  },

  switchSuggestions() {
    const nextSuggestions = pickRandomSuggestions(suggestionPool, 4)
    if (!nextSuggestions.length) return
    this.setData({
      suggestions: nextSuggestions
    })
  },

  async sendMessage() {
    const prompt = this.data.inputText.trim()
    await this.sendPrompt(prompt, true)
  },

  async handleSendButton() {
    if (this.data.loading) {
      this.stopGenerating()
      return
    }
    this.sendMessage()
  },

  stopGenerating() {
    this._stoppedByUser = true
    const generationId = this.currentGenerationId
    if (this.currentRequestTask && this.currentRequestTask.abort) {
      try {
        this.currentRequestTask.abort()
      } catch (_) {}
    }
    if (generationId) {
      const { backendBaseUrl, chatStopEndpoint } = MODEL_API_CONFIG
      wx.request({
        url: `${backendBaseUrl}${chatStopEndpoint}`,
        method: "POST",
        header: { "Content-Type": "application/json" },
        data: { generation_id: generationId },
        fail: () => {}
      })
    }
  },

  async sendPrompt(prompt, clearInput = false) {
    prompt = (prompt || "").trim()
    if (!prompt || this.data.loading) {
      return
    }

    const generationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.currentGenerationId = generationId
    this._stoppedByUser = false
    const userMsg = buildUserMessage(prompt)
    const updatedMessages = [...this.data.messages, userMsg]

    this.setData({
      loading: true,
      inputText: clearInput ? "" : this.data.inputText,
      canSend: clearInput ? false : this.data.canSend,
      messages: updatedMessages
    })

    try {
      const result = await this.requestModel(prompt, generationId)
      if (result && result.stopped) {
        this.setData({ messages: updatedMessages })
      } else {
        const reply = result.reply || result.content || ""
        this.setData({
          messages: [...updatedMessages, buildAssistantMessage(reply)]
        })
      }
    } catch (error) {
      if (error && error.message === "__ABORTED__") {
        this.setData({ messages: updatedMessages })
      } else {
        this.setData({
          messages: [
            ...updatedMessages,
            buildAssistantMessage(`请求失败：${error.message || "请检查接口配置"}`)
          ]
        })
      }
    } finally {
      this.setData({ loading: false })
      this.currentRequestTask = null
      this.currentGenerationId = ""
    }
  },

  requestModel(message, generationId) {
    const { backendBaseUrl, chatEndpoint } = MODEL_API_CONFIG
    const requestUrl = `${backendBaseUrl}${chatEndpoint}`
    return new Promise((resolve, reject) => {
      const requestTask = wx.request({
        url: requestUrl,
        method: "POST",
        timeout: 120000,
        header: {
          "Content-Type": "application/json"
        },
        data: {
          message,
          session_id: this.sessionId || undefined,
          generation_id: generationId
        },
        success: (res) => {
          const result = res.data || {}
          if (res.statusCode >= 200 && res.statusCode < 300 && result.ok) {
            if (result.session_id) {
              this.sessionId = result.session_id
              wx.setStorageSync("chat_session_id", result.session_id)
            }
            resolve(result)
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
          if ((err.errMsg || "").includes("abort")) {
            reject(new Error("__ABORTED__"))
            return
          }
          reject(
            new Error(
              `${err.errMsg || "后端接口调用失败"}\nURL: ${requestUrl}\n请检查：1) 合法域名 2) HTTPS 3) 后端在线`
            )
          )
        }
      })
      this.currentRequestTask = requestTask
    })
  }
})
