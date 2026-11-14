const dayjs = require('dayjs');
const { getDatabase, initDatabase } = require('./database');

/**
 * Add a new transaction (expense or income)
 * @param {Object} params
 * @param {string|number} params.userId - User identifier
 * @param {number} params.amount - Transaction amount (positive integer)
 * @param {'expense'|'income'} [params.type='expense'] - Transaction type
 * @param {string} [params.category] - Category name
 * @param {string} [params.description=''] - Note or description
 * @param {string|Date} [params.date] - Optional custom transaction datetime
 * @returns {Object} Created transaction
 */
function addTransaction({ userId, amount, type = 'expense', category, description = '', date = null }) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const rawAmount = parseInt(amount, 10);
  if (isNaN(rawAmount) || rawAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  const parsedAmount = rawAmount;

  const normalizedType = type === 'income' ? 'income' : 'expense';
  const finalCategory = category && category.trim()
    ? category.trim()
    : (normalizedType === 'income' ? 'Thu nhập' : 'Khác');

  const createdAt = date
    ? dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    : dayjs().format('YYYY-MM-DD HH:mm:ss');

  const db = getDatabase();

  // Ensure user exists
  db.prepare(`
    INSERT INTO users (user_id, created_at)
    VALUES (?, datetime('now'))
    ON CONFLICT(user_id) DO NOTHING
  `).run(String(userId));

  // Insert transaction
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, amount, type, category, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    String(userId),
    parsedAmount,
    normalizedType,
    finalCategory,
    description ? description.trim() : '',
    createdAt
  );

  return {
    id: Number(info.lastInsertRowid),
    user_id: String(userId),
    amount: parsedAmount,
    type: normalizedType,
    category: finalCategory,
    description: description ? description.trim() : '',
    created_at: createdAt
  };
}

/**
 * Delete the user's most recent transaction (for undo functionality)
 * @param {string|number} userId
 * @returns {Object|null} Deleted transaction or null if no transaction exists
 */
function deleteLastTransaction(userId) {
  if (!userId) return null;

  const db = getDatabase();
  const userStr = String(userId);

  const lastTx = db.prepare(`
    SELECT * FROM transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userStr);

  if (!lastTx) {
    return null;
  }

  db.prepare('DELETE FROM transactions WHERE id = ?').run(lastTx.id);
  return lastTx;
}

/**
 * Get transactions with optional date range and limit
 * @param {string|number} userId
 * @param {Object} [options]
 * @param {string|Date} [options.startDate]
 * @param {string|Date} [options.endDate]
 * @param {number} [options.limit=20]
 * @param {string} [options.type]
 * @param {string} [options.category]
 * @returns {Array<Object>}
 */
function getTransactions(userId, { startDate, endDate, limit = 20, type = null, category = null } = {}) {
  if (!userId) return [];

  const db = getDatabase();
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [String(userId)];

  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(dayjs(startDate).format('YYYY-MM-DD HH:mm:ss'));
  }

  if (endDate) {
    sql += ' AND created_at <= ?';
    const endFormatted = (typeof endDate === 'string' && endDate.length === 10)
      ? dayjs(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
      : dayjs(endDate).format('YYYY-MM-DD HH:mm:ss');
    params.push(endFormatted);
  }

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  sql += ' ORDER BY created_at DESC, id DESC';

  if (limit && Number(limit) > 0) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }

  return db.prepare(sql).all(...params);
}

/**
 * Get summary breakdown for a specific period
 * @param {string|number} userId
 * @param {'day'|'week'|'month'|'year'|'all'|Object} [period='month']
 * @returns {Object} { period, startDate, endDate, totalExpense, totalIncome, balance, totalTransactions, byCategory, budget }
 */
function getSummary(userId, period = 'month') {
  const db = getDatabase();
  const userStr = String(userId);

  let startStr, endStr;
  let periodKey = 'month';

  if (typeof period === 'object' && period !== null) {
    startStr = dayjs(period.startDate).format('YYYY-MM-DD HH:mm:ss');
    endStr = (typeof period.endDate === 'string' && period.endDate.length === 10)
      ? dayjs(period.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
      : dayjs(period.endDate).format('YYYY-MM-DD HH:mm:ss');
    periodKey = 'custom';
  } else {
    const p = String(period || 'month').toLowerCase().trim();
    if (p === 'day' || p === 'today' || p === 'ngay' || p === 'ngày') {
      startStr = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');
      endStr = dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss');
      periodKey = 'day';
    } else if (p === 'week' || p === 'tuan' || p === 'tuần') {
      const now = dayjs();
      const dayOfWeek = (now.day() + 6) % 7; // Monday = 0, Sunday = 6
      startStr = now.subtract(dayOfWeek, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');
      endStr = now.subtract(dayOfWeek, 'day').add(6, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');
      periodKey = 'week';
    } else if (p === 'year' || p === 'nam' || p === 'năm') {
      startStr = dayjs().startOf('year').format('YYYY-MM-DD HH:mm:ss');
      endStr = dayjs().endOf('year').format('YYYY-MM-DD HH:mm:ss');
      periodKey = 'year';
    } else if (p === 'all' || p === 'tatca') {
      startStr = '1970-01-01 00:00:00';
      endStr = '2099-12-31 23:59:59';
      periodKey = 'all';
    } else {
      startStr = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      endStr = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      periodKey = 'month';
    }
  }

  // Get total expense and income
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncome,
      COUNT(*) AS totalTransactions
    FROM transactions
    WHERE user_id = ? AND created_at >= ? AND created_at <= ?
  `).get(userStr, startStr, endStr);

  const totalExpense = Number(totals.totalExpense);
  const totalIncome = Number(totals.totalIncome);
  const balance = totalIncome - totalExpense;
  const totalTransactions = Number(totals.totalTransactions);

  // Category breakdown for expenses
  const catRows = db.prepare(`
    SELECT
      t.category,
      SUM(t.amount) AS total,
      COUNT(t.id) AS count,
      COALESCE(c.icon, '📝') AS icon
    FROM transactions t
    LEFT JOIN categories c ON t.category = c.name
    WHERE t.user_id = ? AND t.type = 'expense' AND t.created_at >= ? AND t.created_at <= ?
    GROUP BY t.category
    ORDER BY total DESC
  `).all(userStr, startStr, endStr);

  const byCategory = catRows.map((row) => {
    const total = Number(row.total);
    const percentage = totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0;
    const percentFormatted = totalExpense > 0 ? (total / totalExpense * 100).toFixed(1) : '0.0';
    return {
      category: row.category,
      total,
      count: Number(row.count),
      icon: row.icon,
      percentage,
      percentFormatted
    };
  });

  const budget = getBudget(userId);

  return {
    period: periodKey,
    startDate: startStr,
    endDate: endStr,
    totalExpense,
    totalIncome,
    balance,
    totalTransactions,
    byCategory,
    budget
  };
}

/**
 * Set monthly budget for user
 * @param {string|number} userId
 * @param {number} monthlyBudget
 * @returns {Object} { userId, monthlyBudget }
 */
function setBudget(userId, monthlyBudget) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const budgetVal = Math.max(0, parseInt(monthlyBudget, 10) || 0);
  const db = getDatabase();
  const userStr = String(userId);

  db.prepare(`
    INSERT INTO users (user_id, monthly_budget, created_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET monthly_budget = excluded.monthly_budget
  `).run(userStr, budgetVal);

  return {
    userId: userStr,
    monthlyBudget: budgetVal
  };
}

/**
 * Get monthly budget status and current spending
 * @param {string|number} userId
 * @returns {Object} { userId, monthlyBudget, currentSpending, remaining, percentUsed, isOverBudget }
 */
function getBudget(userId) {
  if (!userId) {
    return {
      userId: '',
      monthlyBudget: 0,
      currentSpending: 0,
      remaining: 0,
      percentUsed: 0,
      isOverBudget: false
    };
  }

  const db = getDatabase();
  const userStr = String(userId);

  const userRow = db.prepare('SELECT monthly_budget FROM users WHERE user_id = ?').get(userStr);
  const monthlyBudget = userRow ? Number(userRow.monthly_budget || 0) : 0;

  const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
  const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');

  const spendRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS currentSpending
    FROM transactions
    WHERE user_id = ? AND type = 'expense' AND created_at >= ? AND created_at <= ?
  `).get(userStr, startOfMonth, endOfMonth);

  const currentSpending = Number(spendRow ? spendRow.currentSpending : 0);
  const remaining = monthlyBudget - currentSpending;
  const percentUsed = monthlyBudget > 0
    ? Number(((currentSpending / monthlyBudget) * 100).toFixed(1))
    : 0;

  return {
    userId: userStr,
    monthlyBudget,
    currentSpending,
    remaining,
    percentUsed,
    isOverBudget: monthlyBudget > 0 && currentSpending > monthlyBudget
  };
}

/**
 * Get all available categories
 * @param {'expense'|'income'|null} [type=null]
 * @returns {Array<Object>}
 */
function getCategories(type = null) {
  const db = getDatabase();
  if (type) {
    return db.prepare('SELECT * FROM categories WHERE type = ? ORDER BY id ASC').all(type);
  }
  return db.prepare('SELECT * FROM categories ORDER BY id ASC').all();
}

/**
 * Get category by name
 * @param {string} name
 * @returns {Object|undefined}
 */
function getCategoryByName(name) {
  if (!name) return undefined;
  const db = getDatabase();
  return db.prepare('SELECT * FROM categories WHERE LOWER(name) = LOWER(?)').get(name.trim());
}

/**
 * Get user information
 * @param {string|number} userId
 * @returns {Object|undefined}
 */
function getUser(userId) {
  if (!userId) return undefined;
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(String(userId));
}

/**
 * Clear all data for a specific user (useful for testing)
 * @param {string|number} userId
 */
function clearUserData(userId) {
  if (!userId) return;
  const db = getDatabase();
  const userStr = String(userId);
  db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userStr);
  db.prepare('DELETE FROM users WHERE user_id = ?').run(userStr);
}

module.exports = {
  initDatabase,
  getDatabase,
  addTransaction,
  deleteLastTransaction,
  getTransactions,
  getSummary,
  setBudget,
  getBudget,
  getCategories,
  getCategoryByName,
  getUser,
  clearUserData
};
