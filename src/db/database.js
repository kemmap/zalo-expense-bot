const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEFAULT_CATEGORIES = [
  { name: 'Ăn uống', type: 'expense', icon: '🍔' },
  { name: 'Đi lại', type: 'expense', icon: '🚗' },
  { name: 'Mua sắm', type: 'expense', icon: '🛍️' },
  { name: 'Hóa đơn', type: 'expense', icon: '📄' },
  { name: 'Giải trí', type: 'expense', icon: '🎮' },
  { name: 'Y tế', type: 'expense', icon: '💊' },
  { name: 'Tiết kiệm', type: 'expense', icon: '💰' },
  { name: 'Thu nhập', type: 'income', icon: '💵' },
  { name: 'Khác', type: 'expense', icon: '📝' }
];

let dbInstance = null;

/**
 * Get or initialize SQLite database connection
 * @param {string} [customPath] - Optional custom path (e.g. ':memory:' or specific file)
 * @returns {Database.Database}
 */
function initDatabase(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  // If a specific custom path is provided and an instance is already open, close previous if different
  if (customPath && dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {}
    dbInstance = null;
  }

  const dbPath = customPath || process.env.DB_PATH || path.resolve(__dirname, '../../expense_bot.db');

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Enable foreign keys and optimize performance
  try {
    db.pragma('journal_mode = WAL');
  } catch (_) {}
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      zalo_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      monthly_budget INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      icon TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      category TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions (user_id, type);
  `);

  // Pre-seed default categories
  const checkCat = db.prepare('SELECT COUNT(*) as count FROM categories');
  const catCount = checkCat.get().count;

  if (catCount === 0) {
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, type, icon) VALUES (?, ?, ?)');
    const insertMany = db.transaction((categories) => {
      for (const cat of categories) {
        insertCat.run(cat.name, cat.type, cat.icon);
      }
    });
    insertMany(DEFAULT_CATEGORIES);
  }

  dbInstance = db;
  return dbInstance;
}

/**
 * Returns current database instance or creates default one
 * @returns {Database.Database}
 */
function getDatabase() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

/**
 * Closes the active database connection
 */
function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {}
    dbInstance = null;
  }
}

module.exports = {
  DEFAULT_CATEGORIES,
  initDatabase,
  getDatabase,
  closeDatabase
};
