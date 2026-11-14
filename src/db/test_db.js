const assert = require('assert');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const { initDatabase, closeDatabase, DEFAULT_CATEGORIES } = require('./database');
const {
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
} = require('./repository');

console.log('🧪 Starting Comprehensive SQLite Database & Repository Test Suite...\n');

// 1. In-memory database initialization
const db = initDatabase(':memory:');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

// Test Suite 1: Schema & Seeding Verification
runTest('Pre-seeded categories exist with icons and correct types', () => {
  const categories = getCategories();
  assert.strictEqual(categories.length, DEFAULT_CATEGORIES.length, `Expected ${DEFAULT_CATEGORIES.length} categories, got ${categories.length}`);

  const anUong = getCategoryByName('Ăn uống');
  assert.ok(anUong, 'Category "Ăn uống" should exist');
  assert.strictEqual(anUong.icon, '🍔');
  assert.strictEqual(anUong.type, 'expense');

  const thuNhap = getCategoryByName('Thu nhập');
  assert.ok(thuNhap, 'Category "Thu nhập" should exist');
  assert.strictEqual(thuNhap.icon, '💵');
  assert.strictEqual(thuNhap.type, 'income');

  const diLai = getCategoryByName('Đi lại');
  assert.strictEqual(diLai.icon, '🚗');

  const tietKiem = getCategoryByName('Tiết kiệm');
  assert.strictEqual(tietKiem.icon, '💰');

  const hoaDon = getCategoryByName('Hóa đơn');
  assert.strictEqual(hoaDon.icon, '📄');

  const giaiTri = getCategoryByName('Giải trí');
  assert.strictEqual(giaiTri.icon, '🎮');

  const yTe = getCategoryByName('Y tế');
  assert.strictEqual(yTe.icon, '💊');

  const muaSam = getCategoryByName('Mua sắm');
  assert.strictEqual(muaSam.icon, '🛍️');

  const khac = getCategoryByName('Khác');
  assert.strictEqual(khac.icon, '📝');
});

// Test Suite 2: addTransaction Verification
const testUserId = 'test_user_001';

runTest('addTransaction adds expense and creates user automatically', () => {
  const tx1 = addTransaction({
    userId: testUserId,
    amount: 35000,
    type: 'expense',
    category: 'Ăn uống',
    description: 'Ăn sáng phở bò'
  });

  assert.ok(tx1.id > 0, 'Transaction should have a valid id');
  assert.strictEqual(tx1.user_id, testUserId);
  assert.strictEqual(tx1.amount, 35000);
  assert.strictEqual(tx1.type, 'expense');
  assert.strictEqual(tx1.category, 'Ăn uống');
  assert.strictEqual(tx1.description, 'Ăn sáng phở bò');

  // Verify user was automatically created in `users`
  const user = getUser(testUserId);
  assert.ok(user, 'User record should be created');
  assert.strictEqual(user.user_id, testUserId);
});

runTest('addTransaction adds second expense and income transaction', () => {
  const tx2 = addTransaction({
    userId: testUserId,
    amount: 50000,
    type: 'expense',
    category: 'Đi lại',
    description: 'Đổ xăng'
  });
  assert.strictEqual(tx2.amount, 50000);

  const tx3 = addTransaction({
    userId: testUserId,
    amount: 15000000,
    type: 'income',
    category: 'Thu nhập',
    description: 'Nhận lương tháng'
  });
  assert.strictEqual(tx3.type, 'income');
  assert.strictEqual(tx3.amount, 15000000);
});

runTest('addTransaction handles custom past dates correctly', () => {
  const pastDate = dayjs().subtract(10, 'day').format('YYYY-MM-DD HH:mm:ss');
  const txPast = addTransaction({
    userId: testUserId,
    amount: 200000,
    type: 'expense',
    category: 'Mua sắm',
    description: 'Mua áo',
    date: pastDate
  });
  assert.strictEqual(txPast.created_at, pastDate);
});

// Test Suite 3: getTransactions Verification
runTest('getTransactions returns all transactions in descending order', () => {
  const txs = getTransactions(testUserId, { limit: 10 });
  assert.strictEqual(txs.length, 4, 'Should have 4 transactions');
  // First transaction is the latest created_at
  assert.strictEqual(txs[0].amount, 15000000);
  assert.strictEqual(txs[1].amount, 50000);
  assert.strictEqual(txs[2].amount, 35000);
  assert.strictEqual(txs[3].amount, 200000);
});

runTest('getTransactions filters by type and category', () => {
  const expenses = getTransactions(testUserId, { type: 'expense' });
  assert.strictEqual(expenses.length, 3);

  const incomes = getTransactions(testUserId, { type: 'income' });
  assert.strictEqual(incomes.length, 1);

  const anUongList = getTransactions(testUserId, { category: 'Ăn uống' });
  assert.strictEqual(anUongList.length, 1);
  assert.strictEqual(anUongList[0].description, 'Ăn sáng phở bò');
});

runTest('getTransactions filters by date range', () => {
  const today = dayjs().format('YYYY-MM-DD');
  const todayTxs = getTransactions(testUserId, { startDate: today, endDate: today });
  // txPast is 10 days ago, so today should have 3 transactions
  assert.strictEqual(todayTxs.length, 3);
});

// Test Suite 4: Budget Verification (setBudget, getBudget)
runTest('setBudget & getBudget track monthly limits and spending accurately', () => {
  const budgetResult = setBudget(testUserId, 5000000);
  assert.strictEqual(budgetResult.monthlyBudget, 5000000);

  const budget = getBudget(testUserId);
  assert.strictEqual(budget.monthlyBudget, 5000000);
  // Total expenses this month: 35,000 + 50,000 + 200,000 = 285,000
  assert.strictEqual(budget.currentSpending, 285000);
  assert.strictEqual(budget.remaining, 4715000);
  assert.strictEqual(budget.isOverBudget, false);
  assert.ok(budget.percentUsed > 5 && budget.percentUsed < 6);
});

// Test Suite 5: getSummary Verification
runTest('getSummary computes expense, income, balance, and category breakdown', () => {
  const summary = getSummary(testUserId, 'month');

  assert.strictEqual(summary.totalExpense, 285000);
  assert.strictEqual(summary.totalIncome, 15000000);
  assert.strictEqual(summary.balance, 14715000);
  assert.strictEqual(summary.totalTransactions, 4);

  // Breakdown verification
  assert.strictEqual(summary.byCategory.length, 3);
  // 200k (Mua sắm) > 50k (Đi lại) > 35k (Ăn uống)
  assert.strictEqual(summary.byCategory[0].category, 'Mua sắm');
  assert.strictEqual(summary.byCategory[0].total, 200000);
  assert.strictEqual(summary.byCategory[0].icon, '🛍️');

  assert.strictEqual(summary.byCategory[1].category, 'Đi lại');
  assert.strictEqual(summary.byCategory[1].total, 50000);
  assert.strictEqual(summary.byCategory[1].icon, '🚗');

  assert.strictEqual(summary.byCategory[2].category, 'Ăn uống');
  assert.strictEqual(summary.byCategory[2].total, 35000);
  assert.strictEqual(summary.byCategory[2].icon, '🍔');

  // Verify budget is attached
  assert.strictEqual(summary.budget.monthlyBudget, 5000000);
  assert.strictEqual(summary.budget.remaining, 4715000);
});

runTest('getSummary supports periods: day, week, year, and custom date range', () => {
  const summaryDay = getSummary(testUserId, 'day');
  // Today expenses: 35k + 50k = 85k (200k was 10 days ago)
  assert.strictEqual(summaryDay.totalExpense, 85000);

  const summaryYear = getSummary(testUserId, 'year');
  assert.strictEqual(summaryYear.totalExpense, 285000);

  const customRange = {
    startDate: dayjs().subtract(15, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().subtract(5, 'day').format('YYYY-MM-DD')
  };
  const summaryCustom = getSummary(testUserId, customRange);
  assert.strictEqual(summaryCustom.totalExpense, 200000);
  assert.strictEqual(summaryCustom.totalIncome, 0);
});

// Test Suite 6: deleteLastTransaction (Undo) Verification
runTest('deleteLastTransaction removes the most recent transaction', () => {
  // Most recent inserted was txPast (id 4)
  const deleted = deleteLastTransaction(testUserId);
  assert.ok(deleted, 'Should return the deleted transaction');
  assert.strictEqual(deleted.amount, 200000);

  // Check remaining transactions
  const remainingTxs = getTransactions(testUserId);
  assert.strictEqual(remainingTxs.length, 3);

  // Undo one more: should be income 15,000,000
  const deletedIncome = deleteLastTransaction(testUserId);
  assert.strictEqual(deletedIncome.amount, 15000000);

  // Summary should reflect removed income and 200k expense
  const summaryAfterUndo = getSummary(testUserId, 'month');
  assert.strictEqual(summaryAfterUndo.totalIncome, 0);
  assert.strictEqual(summaryAfterUndo.totalExpense, 85000);
  assert.strictEqual(summaryAfterUndo.balance, -85000);
});

// Test Suite 7: Edge Cases & Validation
runTest('addTransaction validates input arguments', () => {
  assert.throws(() => {
    addTransaction({ amount: 10000 });
  }, /userId is required/);

  assert.throws(() => {
    addTransaction({ userId: 'u1', amount: 0 });
  }, /Amount must be a positive number/);

  assert.throws(() => {
    addTransaction({ userId: 'u1', amount: -500 });
  }, /Amount must be a positive number/);

  assert.throws(() => {
    addTransaction({ userId: 'u1', amount: 'abc' });
  }, /Amount must be a positive number/);
});

runTest('deleteLastTransaction on empty user returns null safely', () => {
  const result = deleteLastTransaction('empty_user_999');
  assert.strictEqual(result, null);
});

runTest('getBudget for user without budget returns default zeros', () => {
  const budget = getBudget('user_without_budget');
  assert.strictEqual(budget.monthlyBudget, 0);
  assert.strictEqual(budget.currentSpending, 0);
  assert.strictEqual(budget.remaining, 0);
  assert.strictEqual(budget.isOverBudget, false);
});

runTest('over-budget detection works when spending exceeds budget', () => {
  const overBudgetUserId = 'user_over_budget';
  setBudget(overBudgetUserId, 100000);
  addTransaction({ userId: overBudgetUserId, amount: 120000, category: 'Ăn uống' });
  const budget = getBudget(overBudgetUserId);
  assert.strictEqual(budget.isOverBudget, true);
  assert.strictEqual(budget.remaining, -20000);
  assert.strictEqual(budget.percentUsed, 120);
});

runTest('clearUserData clears all user data', () => {
  clearUserData(testUserId);
  const txs = getTransactions(testUserId);
  assert.strictEqual(txs.length, 0);
  const user = getUser(testUserId);
  assert.strictEqual(user, undefined);
});

// Test Suite 8: File-based SQLite Database Persistence Test
runTest('File-based SQLite database initialization & persistence', () => {
  const testDbFile = path.resolve(__dirname, '../../test_expense_temp.db');
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);

  const fileDb = initDatabase(testDbFile);
  const cats = getCategories();
  assert.strictEqual(cats.length, DEFAULT_CATEGORIES.length);

  addTransaction({
    userId: 'file_user',
    amount: 99000,
    category: 'Giải trí',
    description: 'Vé xem phim'
  });

  const txs = getTransactions('file_user');
  assert.strictEqual(txs.length, 1);
  assert.strictEqual(txs[0].amount, 99000);

  closeDatabase();
  assert.ok(fs.existsSync(testDbFile), 'Database file should exist on disk');

  // Re-open and verify persistence
  initDatabase(testDbFile);
  const reloadedTxs = getTransactions('file_user');
  assert.strictEqual(reloadedTxs.length, 1);
  assert.strictEqual(reloadedTxs[0].amount, 99000);

  closeDatabase();
  // Cleanup temp test file and WAL/SHM files
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  if (fs.existsSync(`${testDbFile}-wal`)) fs.unlinkSync(`${testDbFile}-wal`);
  if (fs.existsSync(`${testDbFile}-shm`)) fs.unlinkSync(`${testDbFile}-shm`);
});

console.log(`\n========================================`);
console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log(`========================================\n`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Database & Repository tests passed successfully!\n');
}
