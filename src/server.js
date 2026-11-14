const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const zaloClient = require('./zalo/zaloClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for JSON & urlencoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Dynamically resolves commandHandler to avoid crash if services are still initializing
 */
function getCommandHandler() {
  try {
    return require('./services/commandHandler');
  } catch (err) {
    return null;
  }
}

/**
 * Process a message through command router
 * @param {string} senderId
 * @param {string} text
 * @returns {Promise<string>}
 */
async function processUserMessage(senderId, text) {
  const handler = getCommandHandler();
  if (handler && typeof handler.handleMessage === 'function') {
    try {
      return await handler.handleMessage(senderId, text);
    } catch (error) {
      console.error(`[Server] Error in handleMessage for ${senderId}:`, error);
      return `❌ Đã có lỗi xảy ra khi xử lý tin nhắn: ${error.message}`;
    }
  }

  // Graceful fallback if commandHandler is not yet available
  console.warn('[Server] commandHandler.handleMessage is not available.');
  return `⚠️ Dịch vụ phân tích tin nhắn đang khởi động. Đã nhận: "${text}"`;
}

// ==========================================
// 0. Root Redirect -> /qr
// ==========================================
app.get('/', (req, res) => {
  return res.redirect('/qr');
});

// ==========================================
// 1. Health Check Endpoint
// ==========================================
app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 2. Zalo OA Webhook Verification (GET)
// ==========================================
app.get('/webhook', (req, res) => {
  const challenge = req.query.challenge || req.query['hub.challenge'];
  if (challenge) {
    console.log('[Webhook GET] Echoing challenge verification:', challenge);
    return res.status(200).send(challenge);
  }
  return res.status(200).json({
    status: 'ok',
    message: 'Zalo OA Webhook endpoint is active and listening'
  });
});

// ==========================================
// 3. Zalo OA Webhook Handler (POST)
// ==========================================
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    console.log('[Webhook POST] Received event payload:', JSON.stringify(body));

    // Optional secret check
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const incomingSecret = req.headers['x-webhook-secret'] || req.query.secret;
      if (incomingSecret && incomingSecret !== webhookSecret) {
        console.warn('[Webhook POST] Unauthorized webhook call - invalid secret');
        return res.status(403).json({ error: 'Invalid webhook secret' });
      }
    }

    // Extract sender and text from Zalo OA event structure
    // Standard Zalo OA event name: 'user_send_text_message'
    const eventName = body.event_name || body.event;
    const senderId = body.sender?.id || body.user_id_by_app || body.userId;
    const text = body.message?.text || body.text;

    if (!senderId || !text) {
      console.log(`[Webhook POST] Event '${eventName || 'unknown'}' ignored (no senderId or text).`);
      return res.status(200).json({ status: 'ignored', message: 'No senderId or text found' });
    }

    // Route message to command handler
    const replyText = await processUserMessage(senderId, text);

    // Send reply via Zalo OA Customer Service API
    await zaloClient.sendMessage(senderId, replyText);

    return res.status(200).json({
      status: 'ok',
      senderId,
      reply: replyText
    });
  } catch (error) {
    console.error('[Webhook POST] Error processing webhook:', error);
    return res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
});

// ==========================================
// 4. API Simulation Endpoint (POST /api/simulate)
// ==========================================
app.post('/api/simulate', async (req, res) => {
  try {
    const { userId = 'user_demo_01', message = '' } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Tin nhắn không được để trống.'
      });
    }

    const trimmed = message.trim();
    const replyText = await processUserMessage(userId, trimmed);

    return res.status(200).json({
      success: true,
      userId,
      input: trimmed,
      reply: replyText,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Simulator API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// 4.1. Personal Bot (QR Login) Endpoints
// ==========================================
let personalBot;
try {
  personalBot = require('./personal/personalBot');
} catch (e) {
  personalBot = null;
}

app.get('/api/personal/status', (req, res) => {
  if (personalBot && typeof personalBot.getBotStatus === 'function') {
    return res.json(personalBot.getBotStatus());
  }
  return res.json({ status: 'not_available' });
});

app.post('/api/personal/start', async (req, res) => {
  if (!personalBot) {
    return res.status(500).json({ success: false, error: 'Module personalBot chưa sẵn sàng.' });
  }
  const current = personalBot.getBotStatus();
  if (current.status === 'logged_in') {
    return res.json({ success: true, message: 'Bot đã đăng nhập trước đó.', status: current.status });
  }
  // Start bot asynchronously
  personalBot.startPersonalBot().catch(err => {
    console.error('[Server] Lỗi khi chạy personalBot:', err.message);
  });
  return res.json({ success: true, message: 'Đang khởi động bot cá nhân...' });
});

app.get('/qr', (req, res) => {
  // Auto trigger startPersonalBot if idle
  if (personalBot && personalBot.getBotStatus().status === 'idle') {
    personalBot.startPersonalBot().catch(err => console.error('[Server QR] Start error:', err.message));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đăng Nhập Bot Zalo Cá Nhân | QR Code</title>
  <style>
    :root {
      --primary: #0068ff;
      --bg: #eef2f6;
      --text: #1e293b;
      --muted: #64748b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      padding: 36px 32px;
      border-radius: 24px;
      box-shadow: 0 12px 30px rgba(0, 104, 255, 0.08);
      text-align: center;
      max-width: 440px;
      width: 100%;
    }
    .badge-icon {
      width: 60px;
      height: 60px;
      border-radius: 18px;
      background: linear-gradient(135deg, #0068ff, #00a3ff);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 16px;
      box-shadow: 0 8px 20px rgba(0, 104, 255, 0.25);
    }
    h2 {
      margin: 0 0 8px;
      color: var(--text);
      font-size: 22px;
      font-weight: 700;
    }
    p.subtitle {
      color: var(--muted);
      font-size: 14px;
      margin: 0 0 24px;
      line-height: 1.5;
    }
    .qr-box {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 20px;
      padding: 20px;
      min-height: 240px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
      position: relative;
    }
    .qr-img {
      width: 220px;
      height: 220px;
      object-fit: contain;
      border-radius: 12px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      background: #e0f2fe;
      color: #0284c7;
      margin-top: 10px;
    }
    .status-pill.success {
      background: #dcfce7;
      color: #15803d;
    }
    .status-pill.warning {
      background: #fef3c7;
      color: #b45309;
    }
    .steps {
      text-align: left;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 16px 20px;
      border-radius: 14px;
      font-size: 13px;
      color: #334155;
    }
    .steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .steps li {
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .steps li:last-child {
      margin-bottom: 0;
    }
    .btn-simulator {
      display: inline-block;
      margin-top: 20px;
      color: var(--primary);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }
    .btn-simulator:hover {
      text-decoration: underline;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge-icon">📱</div>
    <h2>Đăng Nhập Zalo Cá Nhân</h2>
    <p class="subtitle">Quét mã QR bằng ứng dụng Zalo trên điện thoại để bắt đầu tự động ghi chép chi tiêu.</p>

    <div class="qr-box" id="qrContainer">
      <div class="spinner" id="spinner"></div>
      <div id="qrText" style="color: var(--muted); font-size: 14px;">Đang khởi tạo mã QR...</div>
      <img id="qrImg" class="qr-img" style="display: none;" alt="Zalo Login QR Code" />
    </div>

    <div id="statusBadge" class="status-pill">
      <span>Đang kết nối...</span>
    </div>

    <div class="steps">
      <ol>
        <li>Mở ứng dụng <strong>Zalo</strong> trên điện thoại.</li>
        <li>Bấm vào biểu tượng <strong>Quét mã QR</strong> ở góc trên bên phải.</li>
        <li>Quét mã QR ở trên và chọn <strong>Đăng nhập</strong> trên điện thoại.</li>
        <li>Sau khi đăng nhập, nhắn tin: <code>ăn sáng 35k</code>, <code>/thongke</code>!</li>
      </ol>
    </div>

    <a href="/simulator" class="btn-simulator">👈 Quay lại Trình Giả Lập Chat</a>
  </div>

  <script>
    const qrContainer = document.getElementById('qrContainer');
    const qrImg = document.getElementById('qrImg');
    const qrText = document.getElementById('qrText');
    const spinner = document.getElementById('spinner');
    const statusBadge = document.getElementById('statusBadge');

    let isChecking = false;

    async function checkStatus() {
      if (isChecking) return;
      isChecking = true;
      try {
        const res = await fetch('/api/personal/status');
        const data = await res.json();

        if (data.status === 'waiting_scan' && data.qrImage) {
          spinner.style.display = 'none';
          qrText.style.display = 'none';
          qrImg.src = data.qrImage;
          qrImg.style.display = 'block';
          statusBadge.className = 'status-pill';
          statusBadge.innerHTML = '🕒 Đang chờ quét mã QR...';
        } else if (data.status === 'scanned') {
          statusBadge.className = 'status-pill warning';
          statusBadge.innerHTML = '📱 Đã quét! Vui lòng nhấn [Đăng nhập] trên điện thoại...';
        } else if (data.status === 'logged_in') {
          spinner.style.display = 'none';
          qrImg.style.display = 'none';
          qrText.style.display = 'block';
          const name = data.account ? data.account.name : 'Người dùng Zalo';
          qrText.innerHTML = '<div style="font-size: 48px; margin-bottom: 12px;">🎉</div><strong style="color: #15803d; font-size: 16px;">Đăng nhập thành công!</strong><div style="margin-top: 6px; color: #475569;">Tài khoản: <strong>' + name + '</strong></div><div style="font-size: 13px; color: #64748b; margin-top: 8px;">Bot đã sẵn sàng tự động trả lời tin nhắn chi tiêu!</div>';
          statusBadge.className = 'status-pill success';
          statusBadge.innerHTML = '✅ Đang trực tuyến 24/7';
        } else if (data.status === 'generating_qr' || data.status === 'idle') {
          spinner.style.display = 'block';
          qrImg.style.display = 'none';
          qrText.style.display = 'block';
          qrText.textContent = 'Đang khởi tạo mã QR...';
          statusBadge.className = 'status-pill';
          statusBadge.innerHTML = 'Đang tạo mã...';
        }
      } catch (e) {
        console.error(e);
      } finally {
        isChecking = false;
      }
    }

    // Poll every 1.5s
    setInterval(checkStatus, 1500);
    checkStatus();
  </script>
</body>
</html>
`);
});

// ==========================================
// 5. Interactive Webhook Simulator & Chat UI (GET /simulator)
// ==========================================
app.get('/simulator', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zalo Expense Bot Simulator | Trình Giả Lập Chat Zalo</title>
  <style>
    :root {
      --zalo-blue: #0068ff;
      --zalo-blue-dark: #0052cc;
      --zalo-blue-light: #e6f0ff;
      --bg-gray: #e9ebed;
      --chat-bg: #f4f5f7;
      --bot-bubble-bg: #ffffff;
      --user-bubble-bg: #0068ff;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --card-border: #e2e8f0;
      --success-green: #10b981;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-gray);
      color: var(--text-main);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Top Navbar */
    .navbar {
      background: #ffffff;
      height: 56px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 10;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 38px;
      height: 38px;
      background: var(--zalo-blue);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 18px;
      box-shadow: 0 2px 6px rgba(0, 104, 255, 0.3);
    }

    .brand-info h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .verified-badge {
      background: #0068ff;
      color: white;
      border-radius: 50%;
      width: 15px;
      height: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }

    .brand-info p {
      font-size: 12px;
      color: var(--text-muted);
    }

    .navbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .user-select-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
      background: #f1f5f9;
      padding: 6px 12px;
      border-radius: 20px;
    }

    .user-select-wrap input {
      border: 1px solid #cbd5e1;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      width: 110px;
      outline: none;
    }

    .btn-toggle-inspector {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-toggle-inspector:hover {
      background: #e2e8f0;
    }

    /* Main Container */
    .app-main {
      flex: 1;
      display: flex;
      height: calc(100vh - 56px);
      overflow: hidden;
    }

    /* Chat Section */
    .chat-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--chat-bg);
      position: relative;
      height: 100%;
    }

    /* Chat Messages */
    .messages-container {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .msg-group {
      display: flex;
      gap: 10px;
      max-width: 80%;
    }

    .msg-group.bot {
      align-self: flex-start;
    }

    .msg-group.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .avatar.bot-avatar {
      background: linear-gradient(135deg, #0068ff, #00c6ff);
      color: white;
    }

    .avatar.user-avatar {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: white;
    }

    .bubble-wrapper {
      display: flex;
      flex-direction: column;
    }

    .bubble {
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    .msg-group.bot .bubble {
      background: var(--bot-bubble-bg);
      color: var(--text-main);
      border-top-left-radius: 4px;
      border: 1px solid var(--card-border);
    }

    .msg-group.user .bubble {
      background: var(--user-bubble-bg);
      color: #ffffff;
      border-top-right-radius: 4px;
    }

    .msg-time {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .msg-group.user .msg-time {
      text-align: right;
    }

    /* Typing indicator */
    .typing-indicator {
      display: none;
      align-self: flex-start;
      margin-left: 46px;
      background: #ffffff;
      border: 1px solid var(--card-border);
      padding: 8px 16px;
      border-radius: 16px;
      border-top-left-radius: 4px;
      gap: 4px;
      align-items: center;
    }

    .typing-dot {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out both;
    }

    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes typing {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    /* Quick Chips Bar */
    .chips-bar {
      background: #ffffff;
      border-top: 1px solid var(--card-border);
      padding: 8px 16px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      white-space: nowrap;
    }

    .chip {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: var(--text-main);
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
      user-select: none;
    }

    .chip:hover {
      background: var(--zalo-blue-light);
      border-color: var(--zalo-blue);
      color: var(--zalo-blue);
    }

    /* Input Toolbar */
    .input-bar {
      background: #ffffff;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-top: 1px solid var(--card-border);
    }

    .chat-input {
      flex: 1;
      height: 44px;
      border: 1px solid #cbd5e1;
      border-radius: 22px;
      padding: 0 18px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .chat-input:focus {
      border-color: var(--zalo-blue);
      box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.15);
    }

    .btn-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--zalo-blue);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .btn-send:hover {
      background: var(--zalo-blue-dark);
    }

    /* Inspector Side Panel */
    .inspector-panel {
      width: 380px;
      background: #1e293b;
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      border-left: 1px solid #334155;
      transition: all 0.3s ease;
    }

    .inspector-panel.hidden {
      display: none;
    }

    .inspector-header {
      padding: 14px 18px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .inspector-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .inspector-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
    }

    .inspector-box-title {
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .inspector-box pre {
      font-family: Consolas, Monaco, monospace;
      font-size: 12px;
      color: #38bdf8;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .online-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--success-green);
      border-radius: 50%;
      margin-right: 4px;
      box-shadow: 0 0 6px var(--success-green);
    }
  </style>
</head>
<body>

  <!-- Top Header -->
  <div class="navbar">
    <div class="brand">
      <div class="brand-logo">Z</div>
      <div class="brand-info">
        <h1>Bot Sổ Chi Tiêu <span class="verified-badge" title="Tài khoản đã xác thực">✓</span></h1>
        <p><span class="online-indicator"></span>Official Account • Webhook Simulator</p>
      </div>
    </div>
    <div class="navbar-actions">
      <div class="user-select-wrap">
        <span>👤 User ID:</span>
        <input type="text" id="userIdInput" value="user_zalo_demo" title="Thay đổi để kiểm tra tính độc lập dữ liệu giữa các người dùng">
      </div>
      <button class="btn-toggle-inspector" id="toggleInspectorBtn" title="Xem sự kiện Webhook">🛠️ Webhook Inspector</button>
      <button class="btn-toggle-inspector" id="clearChatBtn" style="color: #ef4444;" title="Xóa lịch sử chat trên màn hình">🗑️ Xóa chat</button>
    </div>
  </div>

  <!-- Main Workspace -->
  <div class="app-main">
    
    <!-- Chat Screen -->
    <div class="chat-section">
      <div class="messages-container" id="messagesContainer">
        <!-- Initial Welcome Message from Bot -->
        <div class="msg-group bot">
          <div class="avatar bot-avatar">🤖</div>
          <div class="bubble-wrapper">
            <div class="bubble">Xin chào! 👋 Tôi là **Bot Quản Lý Chi Tiêu Zalo**.
Tôi giúp bạn ghi chép, theo dõi và phân tích chi tiêu ngay trong tin nhắn!

💡 **Một số mẫu câu bạn có thể thử ngay:**
• 🍔 \`ăn trưa phở bò 45k\`
• 🚗 \`đổ xăng 50k\`
• 🛍️ \`shopee mua áo 150k\`
• 💵 \`lương tháng này +15tr\`
• 💰 \`thưởng tết 5 củ\`
• 📊 \`/thongke\` hoặc \`/baocao\` (xem tổng kết ngày/tuần/tháng)
• 🎯 \`/ngansach 5000000\` (đặt hạn mức chi tiêu tháng)
• ↩️ \`/xoa\` (hủy giao dịch vừa ghi nhầm)
• 📋 \`/danhmuc\` (xem danh mục phân loại)
• ❓ \`/help\` (hướng dẫn chi tiết)</div>
            <div class="msg-time">Vừa xong</div>
          </div>
        </div>
      </div>

      <!-- Typing indicator -->
      <div class="typing-indicator" id="typingIndicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>

      <!-- Quick Suggestion Chips -->
      <div class="chips-bar">
        <div class="chip" onclick="sendQuickText('ăn sáng 35k')">🍔 ăn sáng 35k</div>
        <div class="chip" onclick="sendQuickText('cà phê highlands 45k')">☕ cà phê 45k</div>
        <div class="chip" onclick="sendQuickText('đổ xăng 50k')">🚗 đổ xăng 50k</div>
        <div class="chip" onclick="sendQuickText('mua đồ shopee 180k')">🛍️ shopee 180k</div>
        <div class="chip" onclick="sendQuickText('lương +15tr')">💵 lương +15tr</div>
        <div class="chip" onclick="sendQuickText('/ngansach 5000000')">🎯 /ngansach 5tr</div>
        <div class="chip" onclick="sendQuickText('/thongke')">📊 /thongke</div>
        <div class="chip" onclick="sendQuickText('/xoa')">↩️ /xoa</div>
        <div class="chip" onclick="sendQuickText('/help')">❓ /help</div>
      </div>

      <!-- Input Bar -->
      <div class="input-bar">
        <input type="text" id="chatInput" class="chat-input" placeholder="Nhập chi tiêu hoặc câu lệnh (ví dụ: ăn phở 40k, /thongke)..." autocomplete="off">
        <button class="btn-send" id="sendBtn" title="Gửi tin nhắn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>

    <!-- Webhook Inspector Panel -->
    <div class="inspector-panel" id="inspectorPanel">
      <div class="inspector-header">
        <span>📡 Webhook Event Inspector</span>
        <span style="font-size: 11px; color: #38bdf8;">LIVE DEBUG</span>
      </div>
      <div class="inspector-content">
        <div class="inspector-box">
          <div class="inspector-box-title">Endpoint Đang Gọi</div>
          <pre>POST /api/simulate
(Tương đương Zalo POST /webhook)</pre>
        </div>

        <div class="inspector-box">
          <div class="inspector-box-title">Zalo OA Webhook Payload (Giả lập)</div>
          <pre id="inspectorPayload">// Chưa có sự kiện</pre>
        </div>

        <div class="inspector-box">
          <div class="inspector-box-title">Phản Hồi Từ Bot (Reply Card)</div>
          <pre id="inspectorResponse">// Chưa có phản hồi</pre>
        </div>
      </div>
    </div>

  </div>

  <script>
    const messagesContainer = document.getElementById('messagesContainer');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const userIdInput = document.getElementById('userIdInput');
    const typingIndicator = document.getElementById('typingIndicator');
    const toggleInspectorBtn = document.getElementById('toggleInspectorBtn');
    const inspectorPanel = document.getElementById('inspectorPanel');
    const inspectorPayload = document.getElementById('inspectorPayload');
    const inspectorResponse = document.getElementById('inspectorResponse');
    const clearChatBtn = document.getElementById('clearChatBtn');

    // Toggle inspector
    toggleInspectorBtn.addEventListener('click', () => {
      inspectorPanel.classList.toggle('hidden');
    });

    // Clear chat
    clearChatBtn.addEventListener('click', () => {
      messagesContainer.innerHTML = '';
    });

    // Scroll chat to bottom
    function scrollToBottom() {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Append Message to UI
    function appendMessage(text, isUser = false) {
      const group = document.createElement('div');
      group.className = 'msg-group ' + (isUser ? 'user' : 'bot');

      const avatar = document.createElement('div');
      avatar.className = 'avatar ' + (isUser ? 'user-avatar' : 'bot-avatar');
      avatar.innerText = isUser ? '👤' : '🤖';

      const wrapper = document.createElement('div');
      wrapper.className = 'bubble-wrapper';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;

      const time = document.createElement('div');
      time.className = 'msg-time';
      const now = new Date();
      time.innerText = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

      wrapper.appendChild(bubble);
      wrapper.appendChild(time);

      group.appendChild(avatar);
      group.appendChild(wrapper);

      messagesContainer.appendChild(group);
      scrollToBottom();
    }

    async function handleSend() {
      const text = chatInput.value.trim();
      const userId = userIdInput.value.trim() || 'user_zalo_demo';
      if (!text) return;

      // 1. Show user message
      appendMessage(text, true);
      chatInput.value = '';

      // 2. Show simulated webhook payload in inspector
      const simulatedWebhookPayload = {
        app_id: "1234567890123456",
        user_id_by_app: userId,
        event_name: "user_send_text_message",
        timestamp: Date.now(),
        sender: { id: userId },
        recipient: { id: "oa_expense_bot_01" },
        message: {
          msg_id: "msg_" + Math.random().toString(36).substring(7),
          text: text
        }
      };
      inspectorPayload.textContent = JSON.stringify(simulatedWebhookPayload, null, 2);

      // 3. Show typing indicator
      typingIndicator.style.display = 'inline-flex';
      scrollToBottom();

      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, message: text })
        });

        const data = await response.json();
        typingIndicator.style.display = 'none';

        if (data.success) {
          appendMessage(data.reply, false);
          inspectorResponse.textContent = JSON.stringify(data, null, 2);
        } else {
          appendMessage('❌ Lỗi: ' + (data.error || 'Không thể xử lý'), false);
          inspectorResponse.textContent = JSON.stringify(data, null, 2);
        }
      } catch (err) {
        typingIndicator.style.display = 'none';
        appendMessage('⚠️ Không thể kết nối tới máy chủ: ' + err.message, false);
        inspectorResponse.textContent = JSON.stringify({ error: err.message }, null, 2);
      }
    }

    function sendQuickText(text) {
      chatInput.value = text;
      handleSend();
    }

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSend();
      }
    });

    // Auto focus
    chatInput.focus();
  </script>
</body>
</html>
  `);
});

// ==========================================
// 6. Server Initialization
// ==========================================
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Zalo Expense Tracker Bot Server running on port ${PORT}`);
    console.log(`📱 Scan Zalo Personal QR  : http://localhost:${PORT}/qr`);
    console.log(`💬 Open Webhook Simulator : http://localhost:${PORT}/simulator`);
    console.log(`📡 Zalo OA Webhook URL   : http://localhost:${PORT}/webhook`);
    console.log(`🏥 Health Check           : http://localhost:${PORT}/health`);
    console.log(`====================================================`);

    // Auto-start personal bot if requested or running on cloud
    if (process.env.START_PERSONAL_BOT === 'true' || process.env.NODE_ENV === 'production') {
      if (personalBot && typeof personalBot.startPersonalBot === 'function') {
        console.log('🤖 [AutoStart] Khởi động Bot Zalo Cá Nhân...');
        personalBot.startPersonalBot().catch(err => console.error('[AutoStart Error]:', err.message));
      }
    }
  });
}

module.exports = {
  app,
  processUserMessage,
  getCommandHandler
};
