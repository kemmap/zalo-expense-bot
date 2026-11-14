/**
 * commandHandler.js
 * Command router and message dispatcher for Zalo Expense Tracker Bot.
 * Connects natural language parser with database repository.
 */

const dayjs = require('dayjs');
const repository = require('../db/repository');
const { parseExpense, parseAmount, CATEGORY_ICONS } = require('./expenseParser');

/**
 * Formats a number into Vietnamese Currency string (e.g. 35.000 đ)
 * @param {number} amount
 * @param {boolean} [includeSign=false]
 * @returns {string}
 */
function formatCurrency(amount, includeSign = false) {
  const num = Math.abs(parseInt(amount, 10) || 0);
  const formatted = num.toLocaleString('vi-VN') + ' đ';
  if (includeSign) {
    return (amount < 0 ? '-' : '+') + formatted;
  }
  return formatted;
}

/**
 * Generates ASCII progress bar
 * @param {number} percentage - 0 to 100+
 * @param {number} [length=10]
 * @returns {string} e.g. [██████░░░░]
 */
function generateProgressBar(percentage, length = 10) {
  const p = Math.max(0, percentage || 0);
  const filled = Math.min(length, Math.round((p / 100) * length));
  const empty = Math.max(0, length - filled);
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Builds formatted response card for a newly added transaction
 * @param {Object} tx - Created transaction object
 * @param {Object} budget - User's current budget info
 * @returns {string}
 */
function formatTransactionCard(tx, budget) {
  const isIncome = tx.type === 'income';
  const icon = CATEGORY_ICONS[tx.category] || (isIncome ? '💵' : '📝');
  const amountFormatted = isIncome
    ? `+${formatCurrency(tx.amount)}`
    : `-${formatCurrency(tx.amount)}`;

  const lines = [
    isIncome ? '💰 GHI NHẬN THU NHẬP THÀNH CÔNG' : '✅ GHI NHẬN CHI TIÊU THÀNH CÔNG',
    '──────────────────────',
    `💵 Số tiền: ${amountFormatted}`,
    `📁 Danh mục: ${icon} ${tx.category}`,
    `📝 Ghi chú: ${tx.description || (isIncome ? 'Thu nhập' : 'Chi tiêu')}`,
    `🕒 Thời gian: ${dayjs(tx.created_at).format('DD/MM/YYYY HH:mm:ss')}`
  ];

  if (!isIncome && budget && budget.monthlyBudget > 0) {
    const percent = budget.percentUsed;
    const bar = generateProgressBar(percent, 8);
    lines.push('──────────────────────');
    lines.push(`🎯 Ngân sách tháng: Còn ${formatCurrency(budget.remaining)} (${percent}% đã dùng) ${bar}`);

    if (budget.isOverBudget) {
      lines.push(`⚠️ CẢNH BÁO: Bạn đã vượt quá ngân sách tháng ${formatCurrency(Math.abs(budget.remaining))}!`);
    } else if (percent >= 80) {
      lines.push('⚠️ Lưu ý: Bạn đã sử dụng hơn 80% hạn mức ngân sách tháng!');
    }
  }

  return lines.join('\n');
}

/**
 * Handles `/help` or `/trogiup` command
 * @returns {string}
 */
function handleHelp() {
  return [
    '🤖 HƯỚNG DẪN SỬ DỤNG BOT QUẢN LÝ CHI TIÊU',
    '──────────────────────────────────',
    '✨ GHI NHANH CHI TIÊU BẰNG TIẾNG VIỆT TỰ NHIÊN:',
    '• "ăn sáng 35k"',
    '• "đổ xăng 50k"',
    '• "tiền điện 500.000đ"',
    '• "nhậu 5 xị"',
    '• "mua áo khoác 2 củ"',
    '• "mua shopee 350k"',
    '',
    '💰 GHI NHẬN THU NHẬP:',
    '• "lương +15tr" hoặc "nhận lương 15tr"',
    '• "thưởng dự án 3tr"',
    '• "bán đồ cũ +500k"',
    '• "thu nợ 2 củ"',
    '',
    '📋 CÁC CÂU LỆNH HỆ THỐNG:',
    '📊 /thongke [ngay|tuan|thang] - Xem báo cáo thống kê thu chi & số dư',
    '🎯 /ngansach [số_tiền] - Cài đặt hạn mức ngân sách tháng (vd: /ngansach 5tr)',
    '🗑️ /xoa hoặc /undo - Xóa giao dịch vừa ghi gần nhất',
    '📁 /danhmuc - Danh sách danh mục chi tiêu & từ khóa',
    '❓ /help hoặc /trogiup - Xem lại hướng dẫn này',
    '──────────────────────────────────',
    '💡 Mẹo: Nhập tắt "help", "thongke", "xoa", "danhmuc" không cần dấu "/" đều được!'
  ].join('\n');
}

/**
 * Handles `/danhmuc` command
 * @returns {string}
 */
function handleCategories() {
  const categories = repository.getCategories();
  const lines = [
    '📁 DANH MỤC CHI TIÊU ĐƯỢC HỖ TRỢ',
    '─────────────────────────────'
  ];

  const categoryExamples = {
    'Ăn uống': 'ăn, phở, cơm, cafe, bún, bánh mì, trà sữa, kfc, nhậu, lẩu...',
    'Đi lại': 'xăng, grab, taxi, be, xe bus, gửi xe, bảo dưỡng, thay nhớt...',
    'Mua sắm': 'shopee, lazada, tiki, quần áo, giày, uniqlo, zara, siêu thị...',
    'Hóa đơn': 'điện, nước, internet, wifi, tiền phòng, chung cư, phí dịch vụ...',
    'Giải trí': 'netflix, spotify, xem phim, rạp cgv, game, steam, du lịch...',
    'Y tế': 'thuốc, khám bệnh, nha khoa, bác sĩ, bệnh viện, mắt...',
    'Tiết kiệm': 'tiết kiệm, gửi ngân hàng, heo đất, vàng, tích lũy...',
    'Thu nhập': 'lương, thưởng, bán đồ, hoàn tiền, nhận chuyển khoản...',
    'Khác': 'các khoản mục chi tiêu khác'
  };

  for (const cat of categories) {
    const ex = categoryExamples[cat.name] || '';
    lines.push(`${cat.icon} ${cat.name} (${cat.type === 'income' ? 'Thu' : 'Chi'})`);
    if (ex) lines.push(`   ↳ ${ex}`);
  }

  lines.push('─────────────────────────────');
  lines.push('💡 Bot tự động nhận diện danh mục dựa trên từ khóa trong tin nhắn của bạn.');
  return lines.join('\n');
}

/**
 * Handles `/ngansach` command
 * @param {string} userId
 * @param {string} arg
 * @returns {string}
 */
function handleBudget(userId, arg) {
  const trimmed = (arg || '').trim();

  // If no amount is provided, show current budget status
  if (!trimmed) {
    const budget = repository.getBudget(userId);
    if (!budget.monthlyBudget || budget.monthlyBudget === 0) {
      return [
        '🎯 QUẢN LÝ NGÂN SÁCH THÁNG',
        '──────────────────────',
        'Bạn chưa cài đặt ngân sách chi tiêu cho tháng này.',
        '',
        '💡 Cách cài đặt:',
        'Nhập: /ngansach [số_tiền]',
        'Ví dụ: /ngansach 5000000 hoặc /ngansach 5tr'
      ].join('\n');
    }

    const bar = generateProgressBar(budget.percentUsed, 10);
    return [
      '🎯 THÔNG TIN NGÂN SÁCH THÁNG',
      '──────────────────────',
      `💵 Hạn mức ngân sách: ${formatCurrency(budget.monthlyBudget)}`,
      `💳 Đã chi tiêu: ${formatCurrency(budget.currentSpending)} (${budget.percentUsed}%)`,
      `📊 Tiến độ: ${bar}`,
      `💵 Hạn mức còn lại: ${formatCurrency(budget.remaining)}`,
      budget.isOverBudget
        ? `⚠️ CẢNH BÁO: Đã chi vượt ngân sách ${formatCurrency(Math.abs(budget.remaining))}!`
        : (budget.percentUsed >= 80 ? '⚠️ Chú ý: Bạn đã dùng hơn 80% ngân sách tháng!' : '✅ Chi tiêu trong tầm kiểm soát!'),
      '──────────────────────',
      '💡 Nhập /ngansach [số_tiền] để thay đổi hạn mức.'
    ].join('\n');
  }

  // Parse amount from arg (supports 5000000, 5tr, 5 củ, 5000k...)
  const parsed = parseAmount(trimmed);
  if (!parsed || parsed.amount <= 0) {
    return '⚠️ Số tiền ngân sách không hợp lệ. Vui lòng nhập số tiền hợp lệ (ví dụ: /ngansach 5000000 hoặc /ngansach 5tr).';
  }

  const budgetAmount = parsed.amount;
  repository.setBudget(userId, budgetAmount);
  const budget = repository.getBudget(userId);
  const bar = generateProgressBar(budget.percentUsed, 10);

  return [
    '🎯 CÀI ĐẶT NGÂN SÁCH THÀNH CÔNG!',
    '──────────────────────',
    `💵 Hạn mức ngân sách mới: ${formatCurrency(budget.monthlyBudget)}`,
    `💳 Đã chi tiêu tháng này: ${formatCurrency(budget.currentSpending)} (${budget.percentUsed}%)`,
    `📊 Tiến độ: ${bar}`,
    `💵 Hạn mức còn lại: ${formatCurrency(budget.remaining)}`,
    budget.isOverBudget
      ? `⚠️ CẢNH BÁO: Đã chi tiêu vượt quá ngân sách ${formatCurrency(Math.abs(budget.remaining))}!`
      : '✅ Bot sẽ tự động cảnh báo khi bạn chi tiêu chạm mốc ngân sách.',
    '──────────────────────'
  ].join('\n');
}

/**
 * Handles `/thongke` or `/baocao` command
 * @param {string} userId
 * @param {string} periodArg - 'ngay' | 'tuan' | 'thang' | 'nam' | 'all'
 * @returns {string}
 */
function handleSummary(userId, periodArg = 'thang') {
  const rawArg = (periodArg || 'thang').toLowerCase().trim();
  let period = 'month';
  let periodLabel = 'THÁNG NÀY';

  if (rawArg === 'ngay' || rawArg === 'today' || rawArg === 'hôm nay' || rawArg === 'hom nay') {
    period = 'day';
    periodLabel = 'HÔM NAY';
  } else if (rawArg === 'tuan' || rawArg === 'tuần' || rawArg === 'week') {
    period = 'week';
    periodLabel = 'TUẦN NÀY';
  } else if (rawArg === 'nam' || rawArg === 'năm' || rawArg === 'year') {
    period = 'year';
    periodLabel = 'NĂM NAY';
  } else if (rawArg === 'tatca' || rawArg === 'tất cả' || rawArg === 'all') {
    period = 'all';
    periodLabel = 'TOÀN BỘ THỜI GIAN';
  } else {
    period = 'month';
    periodLabel = `THÁNG ${dayjs().format('MM/YYYY')}`;
  }

  const summary = repository.getSummary(userId, period);
  const startFmt = dayjs(summary.startDate).format('DD/MM/YYYY');
  const endFmt = dayjs(summary.endDate).format('DD/MM/YYYY');

  const lines = [
    `📊 BÁO CÁO THỐNG KÊ CHI TIÊU [${periodLabel}]`,
    `📅 Thời gian: ${startFmt} - ${endFmt}`,
    '──────────────────────────────',
    `💰 Tổng thu nhập:  +${formatCurrency(summary.totalIncome)}`,
    `💸 Tổng chi tiêu:   -${formatCurrency(summary.totalExpense)}`,
    `📈 Số dư:          ${summary.balance >= 0 ? '+' : ''}${formatCurrency(summary.balance)}`,
    `🔢 Tổng giao dịch: ${summary.totalTransactions}`
  ];

  // Category breakdown
  if (summary.byCategory && summary.byCategory.length > 0) {
    lines.push('──────────────────────────────');
    lines.push('📁 CHI TIẾT CHI TIÊU THEO DANH MỤC:');
    for (const item of summary.byCategory) {
      const bar = generateProgressBar(item.percentage, 8);
      lines.push(`${item.icon} ${item.category}: ${formatCurrency(item.total)} (${item.percentFormatted}%) ${bar}`);
    }
  } else if (summary.totalExpense === 0 && summary.totalIncome === 0) {
    lines.push('──────────────────────────────');
    lines.push('ℹ️ Chưa có giao dịch nào được ghi nhận trong kỳ này.');
  }

  // Monthly budget status
  if (summary.budget && summary.budget.monthlyBudget > 0) {
    const b = summary.budget;
    const bar = generateProgressBar(b.percentUsed, 10);
    lines.push('──────────────────────────────');
    lines.push('🎯 TÌNH HÌNH NGÂN SÁCH THÁNG:');
    lines.push(`🎯 Ngân sách: ${formatCurrency(b.monthlyBudget)}`);
    lines.push(`💳 Đã chi tiêu: ${formatCurrency(b.currentSpending)} (${b.percentUsed}%) ${bar}`);
    lines.push(`💵 Còn lại: ${formatCurrency(b.remaining)}`);

    if (b.isOverBudget) {
      lines.push(`⚠️ CẢNH BÁO: Bạn đã vượt ngân sách ${formatCurrency(Math.abs(b.remaining))}!`);
    } else if (b.percentUsed >= 80) {
      lines.push('⚠️ Chú ý: Bạn đã dùng hơn 80% ngân sách tháng.');
    } else {
      lines.push('✅ Bạn đang quản lý ngân sách rất tốt!');
    }
  } else if (period === 'month') {
    lines.push('──────────────────────────────');
    lines.push('💡 Chưa cài đặt ngân sách. Gõ /ngansach [số_tiền] để đặt mục tiêu chi tiêu tháng.');
  }

  lines.push('──────────────────────────────');
  lines.push('💡 Xem kỳ khác: /thongke ngay | /thongke tuan | /thongke thang');
  return lines.join('\n');
}

/**
 * Handles `/xoa` or `/undo` command
 * @param {string} userId
 * @returns {string}
 */
function handleUndo(userId) {
  const deleted = repository.deleteLastTransaction(userId);
  if (!deleted) {
    return 'ℹ️ Bạn chưa có giao dịch nào gần đây để xóa.';
  }

  const isIncome = deleted.type === 'income';
  const icon = CATEGORY_ICONS[deleted.category] || (isIncome ? '💵' : '📝');
  const amountFormatted = isIncome
    ? `+${formatCurrency(deleted.amount)}`
    : `-${formatCurrency(deleted.amount)}`;

  return [
    '🗑️ ĐÃ XÓA GIAO DỊCH GẦN NHẤT',
    '──────────────────────',
    `💵 Số tiền: ${amountFormatted}`,
    `📁 Danh mục: ${icon} ${deleted.category}`,
    `📝 Ghi chú: ${deleted.description || (isIncome ? 'Thu nhập' : 'Chi tiêu')}`,
    `🕒 Ngày ghi: ${dayjs(deleted.created_at).format('DD/MM/YYYY HH:mm:ss')}`,
    '──────────────────────',
    '✅ Giao dịch đã được xóa hoàn toàn khỏi hệ thống.'
  ].join('\n');
}

/**
 * Main message handler routing user inputs to commands or natural expense parser
 * @param {string|number} userId - Zalo User ID or Session ID
 * @param {string} text - Message content
 * @returns {Promise<string>} Bot reply message
 */
async function handleMessage(userId, text) {
  if (!userId) {
    return '⚠️ Lỗi: Không xác định được danh tính người dùng.';
  }

  const userStr = String(userId).trim();
  if (!text || typeof text !== 'string' || !text.trim()) {
    return '❓ Tin nhắn trống. Vui lòng nhập nội dung chi tiêu hoặc gõ /help để xem hướng dẫn.';
  }

  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Command Router
  // /help or /trogiup or help
  if (lowerText === '/help' || lowerText === '/trogiup' || lowerText === 'help' || lowerText === 'trogiup' || lowerText === '/h') {
    return handleHelp();
  }

  // /danhmuc or danhmuc or /categories
  if (lowerText === '/danhmuc' || lowerText === 'danhmuc' || lowerText === '/categories') {
    return handleCategories();
  }

  // /xoa or /undo or xoa or undo
  if (lowerText === '/xoa' || lowerText === '/undo' || lowerText === 'xoa' || lowerText === 'undo') {
    return handleUndo(userStr);
  }

  // /ngansach [so_tien] or ngansach [so_tien]
  if (lowerText.startsWith('/ngansach') || lowerText.startsWith('ngansach') || lowerText.startsWith('/budget')) {
    const parts = cleanText.split(/\s+/);
    const arg = parts.slice(1).join(' ');
    return handleBudget(userStr, arg);
  }

  // /thongke or /baocao or thongke or baocao
  if (
    lowerText.startsWith('/thongke') ||
    lowerText.startsWith('thongke') ||
    lowerText.startsWith('/baocao') ||
    lowerText.startsWith('baocao') ||
    lowerText.startsWith('/report')
  ) {
    const parts = cleanText.split(/\s+/);
    const arg = parts[1] || 'thang';
    return handleSummary(userStr, arg);
  }

  // 2. Natural language expense / income parser
  const parseResult = parseExpense(cleanText);

  if (parseResult.success) {
    const { amount, type, category, description } = parseResult;

    // Save transaction to SQLite
    const createdTx = repository.addTransaction({
      userId: userStr,
      amount,
      type,
      category,
      description
    });

    // Retrieve budget for feedback
    const budget = repository.getBudget(userStr);

    return formatTransactionCard(createdTx, budget);
  }

  // 3. Fallback for unrecognized messages
  if (cleanText.startsWith('/')) {
    return `⚠️ Lệnh "${cleanText}" không được hỗ trợ.\nGõ /help để xem danh sách các câu lệnh có sẵn!`;
  }

  return [
    '❓ Bot chưa nhận diện được khoản chi tiêu hoặc câu lệnh.',
    '',
    '💡 Cách ghi chi tiêu cực nhanh:',
    '• Chi tiêu: "ăn sáng 35k", "đổ xăng 50k", "mua áo 350k", "nhậu 5 xị"',
    '• Thu nhập: "lương +15tr", "thưởng tết 10tr", "bán đồ cũ 500k"',
    '',
    '👉 Gõ /help để xem toàn bộ danh sách câu lệnh và hướng dẫn chi tiết!'
  ].join('\n');
}

// Attach helper functions to handleMessage for backward/forward compatibility
handleMessage.handleMessage = handleMessage;
handleMessage.formatCurrency = formatCurrency;
handleMessage.generateProgressBar = generateProgressBar;
handleMessage.handleHelp = handleHelp;
handleMessage.handleCategories = handleCategories;
handleMessage.handleBudget = handleBudget;
handleMessage.handleSummary = handleSummary;
handleMessage.handleUndo = handleUndo;
handleMessage.parseExpense = parseExpense;

module.exports = handleMessage;
