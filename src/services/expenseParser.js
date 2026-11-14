/**
 * expenseParser.js
 * Vietnamese natural language expense & income parser for Zalo Expense Tracker Bot.
 */

// Category icons mapping
const CATEGORY_ICONS = {
  'Ăn uống': '🍔',
  'Đi lại': '🚗',
  'Mua sắm': '🛍️',
  'Hóa đơn': '📄',
  'Giải trí': '🎮',
  'Y tế': '💊',
  'Tiết kiệm': '💰',
  'Thu nhập': '💵',
  'Khác': '📝'
};

// Keyword definitions for category classification
// Order matters: more specific categories/phrases are checked before general ones
const CATEGORY_RULES = [
  {
    category: 'Thu nhập',
    // Income keywords
    keywords: [
      'lương', 'luong', 'tiền lương', 'tien luong',
      'thưởng', 'thuong', 'tiền thưởng', 'tien thuong',
      'hoàn tiền', 'hoan tien', 'hoàn phí',
      'bán đồ', 'ban do', 'bán hàng', 'ban hang', 'bán xe', 'ban xe', 'bán đất', 'ban dat',
      'nhận chuyển khoản', 'nhan chuyen khoan', 'nhận ck', 'nhan ck',
      'thu nợ', 'thu no', 'đòi nợ', 'doi no',
      'được cho', 'duoc cho', 'được tặng', 'duoc tang', 'lì xì', 'li xi',
      'tiền về', 'tien ve', 'tiền vào', 'tien vao',
      'cổ tức', 'co tuc', 'tiền lãi', 'tien lai', 'lãi suất', 'lai suat',
      'trúng số', 'trung so', 'trúng thưởng', 'trung thuong',
      'thù lao', 'thu lao', 'freelance', 'hoa hồng', 'hoa hong',
      'thu nhập', 'thu nhap'
    ]
  },
  {
    category: 'Y tế',
    keywords: [
      'thuốc', 'thuoc', 'mua thuốc', 'mua thuoc', 'tiệm thuốc', 'tiem thuoc', 'nhà thuốc', 'nha thuoc',
      'khám', 'kham', 'khám bệnh', 'kham benh', 'bệnh viện', 'benh vien', 'viện phí', 'vien phi',
      'bác sĩ', 'bac si', 'nha khoa', 'nha si', 'khám răng', 'kham rang', 'nhổ răng', 'nho rang', 'trám răng', 'niềng răng',
      'khẩu trang', 'khau trang', 'y tế', 'y te', 'tiêm', 'tiem', 'vắc xin', 'vacxin', 'vaccine',
      'mắt', 'kính thuốc', 'kinh thuoc', 'đo mắt', 'cắt kính',
      'vitamin', 'dược phẩm', 'duoc pham', 'thực phẩm chức năng',
      'phòng khám', 'phong kham', 'xét nghiệm', 'xet nghiem', 'siêu âm', 'sieu am', 'chụp x-quang'
    ]
  },
  {
    category: 'Hóa đơn',
    keywords: [
      'tiền điện', 'tien dien', 'hóa đơn điện', 'hoa don dien', 'tiền điện thoại',
      'tiền nước', 'tien nuoc', 'hóa đơn nước', 'hoa don nuoc',
      'tiền mạng', 'tien mang', 'internet', 'wifi', 'hóa đơn internet', 'cước internet', 'cước mạng',
      'tiền phòng', 'tien phong', 'tiền nhà', 'tien nha', 'tiền trọ', 'tien tro', 'thuê nhà', 'thue nha', 'thuê phòng', 'thue phong',
      'phí chung cư', 'phi chung cu', 'chung cư', 'chung cu', 'phí dịch vụ', 'phi dich vu', 'ban quản lý',
      'hóa đơn', 'hoa don', '4g', '5g', 'nạp thẻ', 'nap the', 'nạp điện thoại', 'nap dien thoai', 'cước',
      'tiền rác', 'tien rac', 'truyền hình', 'truyen hinh', 'mặt bằng', 'mat bang'
    ]
  },
  {
    category: 'Đi lại',
    keywords: [
      'xăng', 'xang', 'đổ xăng', 'do xang', 'tiền xăng', 'tien xang',
      'grab', 'grap', 'taxi', 'be', 'gojek', 'xanh sm', 'gsm', 'vinfast', 'xsm',
      'xe bus', 'xe buýt', 'bus', 'buyt',
      'gửi xe', 'gui xe', 'vé xe', 've xe', 'đỗ xe', 'do xe', 'bến xe', 'ben xe',
      'bảo dưỡng', 'bao duong', 'thay nhớt', 'thay nhot', 'rửa xe', 'rua xe', 'sửa xe', 'sua xe', 'vá xe', 'va xe', 'bơm xe', 'bom xe',
      'rùa', 'rua',
      'tàu hỏa', 'tau hoa', 'tàu', 'tau', 'máy bay', 'may bay', 'vé máy bay', 've may bay',
      'cầu đường', 'cau duong', 'bot', 'vetc', 'epass', 'đường bộ', 'duong bo'
    ]
  },
  {
    category: 'Giải trí',
    keywords: [
      'netflix', 'spotify', 'youtube', 'apple music',
      'xem phim', 'rap', 'rạp', 'cgv', 'lotte cinema', 'bhd', 'galaxy cinema', 'vé xem phim', 've xem phim',
      'game', 'steam', 'playstation', 'ps5', 'ps4', 'nintendo', 'switch', 'nạp game', 'nap game', 'thẻ game', 'the game',
      'karaoke', 'billiards', 'bida', 'bowling',
      'du lịch', 'du lich', 'phượt', 'phuot', 'resort', 'khách sạn', 'khach san', 'hotel', 'homestay', 'tour', 'camping', 'cắm trại',
      'concert', 'show', 'vé ca nhạc', 've ca nhac', 'hội chợ', 'bar', 'pub', 'club'
    ]
  },
  {
    category: 'Ăn uống',
    keywords: [
      'ăn', 'an', 'ăn sáng', 'an sang', 'ăn trưa', 'an trua', 'ăn tối', 'an toi', 'ăn vặt', 'an vat',
      'phở', 'pho', 'cơm', 'com', 'cơm tấm', 'com tam', 'cơm sườn',
      'bún', 'bun', 'bún bò', 'bun bo', 'bún chả', 'bun cha', 'bún đậu', 'bun dau', 'bún riêu', 'bun rieu',
      'bánh mì', 'banh mi', 'hủ tiếu', 'hu tieu', 'mì', 'mi', 'miến', 'mien', 'cháo', 'chao', 'xôi', 'xoi',
      'cafe', 'cà phê', 'ca phe', 'càfe', 'caphe',
      'highland', 'highlands', 'starbucks', 'phúc long', 'phuclong', 'gong cha', 'katinat', 'the coffee house', 'trung nguyên',
      'kfc', 'lotteria', 'jollibee', 'mcdonalds', 'pizza', 'burger', 'gà rán', 'ga ran',
      'trà sữa', 'tra sua', 'trà đào', 'tra dao', 'trà chanh', 'tra chanh', 'sinh tố', 'sinh to', 'nước ép', 'nuoc ep', 'chè', 'che',
      'nhậu', 'nhau', 'bia', 'uống bia', 'uong bia', 'rượu', 'ruou', 'lẩu', 'lau', 'nướng', 'nuong', 'bbq', 'buffet',
      'quán', 'quan', 'đồ ăn', 'do an', 'thức ăn', 'thuc an',
      'bò né', 'nem rán', 'nem', 'bánh bao', 'kem', 'snack', 'bánh', 'banh', 'kẹo', 'keo',
      'thịt', 'thit', 'cá', 'ca', 'rau', 'trứng', 'trung',
      'uống nước', 'uong nuoc', 'nước ngọt', 'nuoc ngot', 'coca', 'pepsi'
    ]
  },
  {
    category: 'Mua sắm',
    keywords: [
      'shopee', 'lazada', 'tiki', 'sendo', 'tiktok shop',
      'quần áo', 'quan ao', 'quần', 'quan', 'áo', 'ao', 'áo thun', 'áo sơ mi', 'quần jean',
      'váy', 'vay', 'đầm', 'dam', 'túi xách', 'tui xach', 'balo', 'ví', 'vi',
      'giầy', 'giay', 'giày', 'dép', 'dep', 'sneaker',
      'uniqlo', 'zara', 'h&m', 'hm', 'routine', 'yody',
      'siêu thị', 'sieu thi', 'winmart', 'vinmart', 'co.op', 'coopmart', 'coop', 'big c', 'go!', 'lotte mart', 'aeon', 'bách hóa xanh', 'bach hoa xanh',
      'chợ', 'cho', 'mua đồ', 'mua do', 'mua sắm', 'mua sam', 'shopping', 'order', 'đặt hàng', 'dat hang',
      'mỹ phẩm', 'my pham', 'skincare', 'son môi', 'son', 'kem dưỡng', 'nước hoa', 'nuoc hoa',
      'đồ gia dụng', 'do gia dung', 'đồ điện tử', 'do dien tu', 'sách', 'sach', 'văn phòng phẩm',
      'phụ kiện', 'phu kien', 'tai nghe', 'bàn phím', 'chuột', 'ốp lưng', 'đồng hồ', 'dong ho'
    ]
  },
  {
    category: 'Tiết kiệm',
    keywords: [
      'tiết kiệm', 'tiet kiem', 'gửi tiết kiệm', 'gui tiet kiem', 'gửi ngân hàng', 'gui ngan hang',
      'heo đất', 'heo dat', 'ống heo', 'ong heo',
      'đầu tư', 'dau tu', 'chứng khoán', 'chung khoan', 'mua vàng', 'mua vang', 'vàng', 'vang', 'tích lũy', 'tich luy'
    ]
  }
];

// Single word matching helper with unicode boundary
function matchWord(text, word) {
  // Use unicode-aware word boundary pattern
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
  return regex.test(text);
}

/**
 * Extracts and calculates transaction amount from text.
 * Handles:
 * - 35k, 500k, 1000k
 * - 35.000, 35,000, 35.000đ, 35000vnd, 35000 vnđ
 * - 15tr, 15 triệu, 1.5 triệu, 1,5tr
 * - 2 củ, 3 lít, 5 xị
 * - 2 củ rưỡi, 3 lít rưỡi, 1tr5, 2k5
 * - +20tr, -50k
 * @param {string} text
 * @returns {Object|null} { amount: number, sign: '+'|'-'|null, rawMatch: string }
 */
function parseAmount(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Compound slang with 'rưỡi': e.g. "2 củ rưỡi", "1 triệu rưỡi", "3 lít rưỡi", "2 xị rưỡi"
  const ruoiRegex = /([+-])?\s*(\d+(?:[.,]\d+)?)\s*(củ|cu|chai|triệu|trieu|tr|lít|lit|xị|xi)\s+(?:rưỡi|ruoi)(?=[^\p{L}\p{N}]|$)/iu;
  let match = clean.match(ruoiRegex);
  if (match) {
    const explicitSign = match[1] || null;
    const num = parseFloat(match[2].replace(',', '.'));
    const unit = match[3].toLowerCase();
    let multiplier = 1000000;
    if (['lít', 'lit', 'xị', 'xi'].includes(unit)) {
      multiplier = 100000;
    }
    const amount = Math.round((num + 0.5) * multiplier);
    return { amount, sign: explicitSign, rawMatch: match[0] };
  }

  // 2. Compound abbreviation: e.g. "1tr5", "2tr3", "2k5", "1 củ 5"
  const compoundRegex = /([+-])?\s*(\d+)\s*(tr|trieu|triệu|củ|cu|chai|k)\s*(\d+)(?=[^\p{L}\p{N}]|$)/iu;
  match = clean.match(compoundRegex);
  if (match) {
    const explicitSign = match[1] || null;
    const base = parseInt(match[2], 10);
    const unit = match[3].toLowerCase();
    const subStr = match[4];
    let mult = 1000;
    if (['tr', 'trieu', 'triệu', 'củ', 'cu', 'chai'].includes(unit)) {
      mult = 1000000;
    }
    const val = base + parseFloat('0.' + subStr);
    const amount = Math.round(val * mult);
    return { amount, sign: explicitSign, rawMatch: match[0] };
  }

  // 3. Number with unit: e.g. 35k, 15tr, 15 triệu, 2 củ, 3 lít, 5 xị, 35.000đ, 35000vnd, 500k
  const unitRegex = /([+-])?\s*(\d+(?:[.,]\d+)?)\s*(triệu|trieu|tr|củ|cu|chai|lít|lit|xị|xi|k|nghìn|nghin|ngàn|ngan|đ|d|vnd|vnđ|đồng|dong)(?=[^\p{L}\p{N}]|$)/iu;
  match = clean.match(unitRegex);
  if (match) {
    const explicitSign = match[1] || null;
    const numStr = match[2];
    const unit = match[3].toLowerCase();
    let multiplier = 1;
    if (['triệu', 'trieu', 'tr', 'củ', 'cu', 'chai'].includes(unit)) {
      multiplier = 1000000;
    } else if (['lít', 'lit', 'xị', 'xi'].includes(unit)) {
      multiplier = 100000;
    } else if (['k', 'nghìn', 'nghin', 'ngàn', 'ngan'].includes(unit)) {
      multiplier = 1000;
    } else {
      multiplier = 1;
    }

    let num;
    if (multiplier === 1) {
      num = parseInt(numStr.replace(/[.,]/g, ''), 10);
    } else {
      num = parseFloat(numStr.replace(',', '.'));
    }
    const amount = Math.round(num * multiplier);
    return { amount, sign: explicitSign, rawMatch: match[0] };
  }

  // 4. Formatted number with separators: e.g. 35.000, 35,000, 1.500.000, 500.000
  const sepRegex = /([+-])?\s*(\d{1,3}(?:[.,]\d{3})+)(?=[^\p{L}\p{N}]|$)/iu;
  match = clean.match(sepRegex);
  if (match) {
    const explicitSign = match[1] || null;
    const num = parseInt(match[2].replace(/[.,]/g, ''), 10);
    return { amount: num, sign: explicitSign, rawMatch: match[0] };
  }

  // 5. Raw number >= 1000: e.g. 35000, 50000, 1500000
  const rawRegex = /([+-])?\s*(\b\d{4,12}\b)/u;
  match = clean.match(rawRegex);
  if (match) {
    const explicitSign = match[1] || null;
    const num = parseInt(match[2], 10);
    return { amount: num, sign: explicitSign, rawMatch: match[0] };
  }

  return null;
}

/**
 * Detects whether transaction is income or expense.
 * Detects 'thu', 'nhận', 'lương', 'thưởng', '+' as income; otherwise defaults to expense.
 * @param {string} text
 * @param {'+'|'-'|null} explicitSign
 * @returns {'income'|'expense'}
 */
function detectTransactionType(text, explicitSign = null) {
  if (explicitSign === '+') return 'income';
  if (explicitSign === '-') return 'expense';

  // Check income indicator keywords using unicode word boundaries
  const incomeRegex = /(?<=^|[^\p{L}\p{N}])(thu|nhận|nhan|lương|luong|thưởng|thuong|hoàn tiền|hoan tien|tiền về|tien ve|bán đồ|ban do|được cho|duoc cho|được tặng|duoc tang|lì xì|li xi|cổ tức|co tuc|trúng thưởng|trung thuong)(?=[^\p{L}\p{N}]|$)/iu;
  if (incomeRegex.test(text)) {
    return 'income';
  }

  // Check standalone '+' in text
  if (/(?:^|\s)\+(?:\s|\d)/.test(text)) {
    return 'income';
  }

  return 'expense';
}

/**
 * Infers category from sentence based on predefined Vietnamese keywords
 * @param {string} text
 * @param {'income'|'expense'} type
 * @returns {string} Category name
 */
function inferCategory(text, type = 'expense') {
  const lowerText = text.toLowerCase();

  // If transaction type is income, check income rules first
  if (type === 'income') {
    return 'Thu nhập';
  }

  // Scan expense categories (ordered by specificity)
  for (const rule of CATEGORY_RULES) {
    if (rule.category === 'Thu nhập') continue; // Skip income for expense transactions

    for (const kw of rule.keywords) {
      if (kw.includes(' ')) {
        // Multi-word phrase check
        if (lowerText.includes(kw)) {
          return rule.category;
        }
      } else {
        // Single word check with unicode word boundary
        if (matchWord(lowerText, kw)) {
          return rule.category;
        }
      }
    }
  }

  return 'Khác';
}

/**
 * Clean up text by removing amount and signs to produce a clean description
 * @param {string} text
 * @param {string} rawMatch
 * @param {'income'|'expense'} type
 * @param {string} category
 * @returns {string}
 */
function extractDescription(text, rawMatch, type, category) {
  let desc = text.replace(rawMatch, ' ');

  // Clean leading/trailing signs (+, -) and punctuation
  desc = desc.replace(/^[+\-:,.\s]+/, '').replace(/[+\-:,.\s]+$/, '').trim();
  // Collapse whitespace
  desc = desc.replace(/\s+/g, ' ');

  if (!desc) {
    return category && category !== 'Khác' ? category : (type === 'income' ? 'Thu nhập' : 'Chi tiêu');
  }

  return desc;
}

/**
 * Parses Vietnamese natural language expense sentence
 * @param {string} text - User message e.g. "ăn sáng 35k", "đổ xăng 50k", "lương +15tr"
 * @returns {Object} { success: true, amount, type, category, description, icon } OR { success: false, reason }
 */
function parseExpense(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      success: false,
      reason: 'Nội dung không hợp lệ hoặc để trống'
    };
  }

  const rawText = text.trim();

  // 1. Parse amount
  const parsedAmountObj = parseAmount(rawText);
  if (!parsedAmountObj) {
    return {
      success: false,
      reason: 'Không tìm thấy số tiền hợp lệ trong câu'
    };
  }

  const { amount, sign, rawMatch } = parsedAmountObj;
  if (isNaN(amount) || amount <= 0) {
    return {
      success: false,
      reason: 'Số tiền phải lớn hơn 0'
    };
  }

  // 2. Detect transaction type (income / expense)
  const type = detectTransactionType(rawText, sign);

  // 3. Infer category
  const category = inferCategory(rawText, type);

  // 4. Extract description
  const description = extractDescription(rawText, rawMatch, type, category);

  // 5. Get icon
  const icon = CATEGORY_ICONS[category] || '📝';

  return {
    success: true,
    amount,
    type,
    category,
    description,
    icon
  };
}

module.exports = {
  parseExpense,
  parseAmount,
  detectTransactionType,
  inferCategory,
  extractDescription,
  CATEGORY_ICONS,
  CATEGORY_RULES
};
