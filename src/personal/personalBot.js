/**
 * personalBot.js
 * Zalo Personal Account Bot (Quét mã QR - Không cần Zalo OA / Giấy phép kinh doanh)
 * Sử dụng thư viện zca-js để mô phỏng tương tác Zalo Web.
 */

const fs = require('fs');
const path = require('path');
const { Zalo, ThreadType, LoginQRCallbackEventType } = require('zca-js');
const qrcodeTerminal = require('qrcode-terminal');
const commandHandler = require('../services/commandHandler');

const DATA_DIR = path.join(__dirname, '../../data');
const SESSION_FILE = path.join(DATA_DIR, 'zalo_session.json');

// Global state
let currentStatus = 'idle'; // 'idle' | 'generating_qr' | 'waiting_scan' | 'scanned' | 'logged_in' | 'error'
let currentQrCode = null;   // QR string
let currentQrImage = null;  // base64 image data URI
let botAccountInfo = null;  // { id, name, avatar }
let zaloApi = null;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Gets current bot status & QR information
 */
function getBotStatus() {
  return {
    status: currentStatus,
    qrCode: currentQrCode,
    qrImage: currentQrImage,
    account: botAccountInfo
  };
}

/**
 * Saves login session credentials to disk
 */
function saveSession(data) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('💾 [PersonalBot] Đã lưu phiên đăng nhập vào zalo_session.json');
  } catch (err) {
    console.error('⚠️ [PersonalBot] Không thể lưu phiên đăng nhập:', err.message);
  }
}

/**
 * Loads saved credentials from disk
 */
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const content = fs.readFileSync(SESSION_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('⚠️ [PersonalBot] Lỗi đọc session cũ:', err.message);
  }
  return null;
}

/**
 * Sets up incoming message listener
 */
async function setupMessageListener(api) {
  const ownId = api.getOwnId ? api.getOwnId() : null;

  try {
    const accountInfo = await api.fetchAccountInfo();
    botAccountInfo = {
      id: ownId,
      name: accountInfo?.data?.name || accountInfo?.name || 'Zalo User',
      avatar: accountInfo?.data?.avatar || accountInfo?.avatar || ''
    };
    console.log(`👤 [PersonalBot] Đăng nhập tài khoản: ${botAccountInfo.name} (ID: ${ownId})`);
  } catch (err) {
    botAccountInfo = { id: ownId, name: 'Zalo User' };
  }

  api.listener.on('message', async (message) => {
    try {
      const isPlainText = typeof message.data?.content === 'string';
      if (!isPlainText) return;

      const text = message.data.content.trim();
      if (!text) return;

      // Avoid infinite reply loops if bot sends to another chat
      // Allow messages if sent to self (Cloud của tôi / Saved Messages)
      const isCloudSelfChat = message.isSelf && message.threadId === ownId;
      if (message.isSelf && !isCloudSelfChat) {
        return;
      }

      const senderId = message.data.uidFrom || message.threadId;
      console.log(`\n📩 [PersonalBot] Nhận tin nhắn từ [${senderId}]: "${text}"`);

      // Process message through Command Handler & SQLite
      const reply = await commandHandler(senderId, text);

      // In group chats, if message is not an expense or command, don't spam
      const isGroup = message.type === ThreadType.Group;
      const isUnrecognized = reply.startsWith('❓ Bot chưa nhận diện được');
      if (isGroup && isUnrecognized) {
        // Stay quiet in group if user is just talking normally
        return;
      }

      console.log(`📤 [PersonalBot] Phản hồi tới [${message.threadId}]:\n${reply}`);

      // Send reply
      await api.sendMessage(
        {
          msg: reply,
          quote: message.data // Quote the original message
        },
        message.threadId,
        message.type
      );
    } catch (err) {
      console.error('❌ [PersonalBot] Lỗi khi xử lý tin nhắn:', err.message);
    }
  });

  api.listener.on('error', (err) => {
    console.error('⚠️ [PersonalBot Listener Error]:', err.message);
  });

  api.listener.start();
  console.log('🚀 [PersonalBot] Trình lắng nghe tin nhắn đã bắt đầu hoạt động!');
  console.log('👉 Bây giờ bạn có thể mở Zalo và gửi tin nhắn cho nick này: "ăn phở 45k", "/thongke"...\n');
}

/**
 * Starts the Personal Bot
 */
async function startPersonalBot() {
  const zalo = new Zalo();
  currentStatus = 'generating_qr';

  // 1. Try restoring from saved session
  const savedCredentials = loadSession();
  if (savedCredentials && savedCredentials.cookie && savedCredentials.imei) {
    console.log('🔄 [PersonalBot] Đang khôi phục phiên đăng nhập từ zalo_session.json...');
    try {
      zaloApi = await zalo.login(savedCredentials);
      currentStatus = 'logged_in';
      console.log('🎉 [PersonalBot] Khôi phục phiên đăng nhập thành công!');
      await setupMessageListener(zaloApi);
      return zaloApi;
    } catch (err) {
      console.log('⚠️ [PersonalBot] Phiên cũ đã hết hạn, tiến hành quét mã QR mới...');
      try {
        fs.unlinkSync(SESSION_FILE);
      } catch (e) {}
    }
  }

  // 2. Perform QR Login
  console.log('\n===============================================================');
  console.log('📲 ĐĂNG NHẬP BOT ZALO CÁ NHÂN BẰNG MÃ QR');
  console.log('===============================================================');
  console.log('Đang tạo mã QR, vui lòng đợi vài giây...');

  try {
    zaloApi = await zalo.loginQR(
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      (event) => {
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated: {
            currentStatus = 'waiting_scan';
            currentQrCode = event.data.code;
            currentQrImage = event.data.image;

            console.log('\n---------------------------------------------------------------');
            console.log('📱 HÃY DÙNG APP ZALO TRÊN ĐIỆN THOẠI ĐỂ QUÉT MÃ QR NÀY:');
            console.log('---------------------------------------------------------------');
            try {
              qrcodeTerminal.generate(event.data.code, { small: true });
            } catch (e) {
              console.log('Link QR code:', event.data.code);
            }
            console.log('---------------------------------------------------------------');
            console.log('💡 Mẹo: Bạn cũng có thể mở trình duyệt xem mã QR rõ nét tại:');
            console.log('   👉 http://localhost:3000/qr');
            console.log('---------------------------------------------------------------\n');
            break;
          }

          case LoginQRCallbackEventType.QRCodeScanned: {
            currentStatus = 'scanned';
            console.log(`\n👀 [PersonalBot] Đã quét mã QR!`);
            if (event.data?.display_name) {
              console.log(`   Tài khoản: ${event.data.display_name}`);
            }
            console.log('👉 Vui lòng nhấn [Đăng nhập] trên màn hình điện thoại để xác nhận...');
            break;
          }

          case LoginQRCallbackEventType.GotLoginInfo: {
            console.log('🔑 [PersonalBot] Đã nhận thông tin đăng nhập thành công!');
            saveSession(event.data);
            break;
          }

          case LoginQRCallbackEventType.QRCodeExpired: {
            console.log('⏳ [PersonalBot] Mã QR đã hết hạn, đang tạo mã mới...');
            event.actions?.retry();
            break;
          }

          case LoginQRCallbackEventType.QRCodeDeclined: {
            console.log('❌ [PersonalBot] Đăng nhập bị từ chối trên điện thoại.');
            currentStatus = 'error';
            break;
          }
        }
      }
    );

    currentStatus = 'logged_in';
    console.log('🎉 [PersonalBot] ĐĂNG NHẬP THÀNH CÔNG!');
    await setupMessageListener(zaloApi);
    return zaloApi;
  } catch (err) {
    currentStatus = 'error';
    console.error('❌ [PersonalBot] Lỗi đăng nhập:', err.message);
    throw err;
  }
}

// Standalone execution
if (require.main === module) {
  startPersonalBot().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  startPersonalBot,
  getBotStatus
};
