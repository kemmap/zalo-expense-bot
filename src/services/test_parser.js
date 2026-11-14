/**
 * test_parser.js
 * Comprehensive test suite for expenseParser and commandHandler.
 * Verifies 25+ Vietnamese input phrases, amounts, categories, and command workflows.
 */

const assert = require('assert');
const path = require('path');
const { initDatabase, closeDatabase } = require('../db/database');
const repository = require('../db/repository');
const { parseExpense, parseAmount, inferCategory, detectTransactionType } = require('./expenseParser');
const { handleMessage } = require('./commandHandler');

// Use in-memory SQLite database for test isolation
const TEST_USER = 'test_user_services_' + Date.now();

let passedCount = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE SERVICE & PARSER TEST SUITE');
  console.log('====================================================\n');

  // Initialize DB in memory
  initDatabase(':memory:');

  console.log('--- 1. Testing Amount Parser ---');

  runTest('Handles 35k', () => {
    const res = parseAmount('35k');
    assert.strictEqual(res.amount, 35000);
  });

  runTest('Handles 35.000 with dot separator', () => {
    const res = parseAmount('35.000');
    assert.strictEqual(res.amount, 35000);
  });

  runTest('Handles 35.000đ with currency suffix', () => {
    const res = parseAmount('35.000đ');
    assert.strictEqual(res.amount, 35000);
  });

  runTest('Handles 35000vnd', () => {
    const res = parseAmount('35000vnd');
    assert.strictEqual(res.amount, 35000);
  });

  runTest('Handles 15tr', () => {
    const res = parseAmount('15tr');
    assert.strictEqual(res.amount, 15000000);
  });

  runTest('Handles 15 triệu', () => {
    const res = parseAmount('15 triệu');
    assert.strictEqual(res.amount, 15000000);
  });

  runTest('Handles 2 củ (slang for 2,000,000)', () => {
    const res = parseAmount('2 củ');
    assert.strictEqual(res.amount, 2000000);
  });

  runTest('Handles 3 lít (slang for 300,000)', () => {
    const res = parseAmount('3 lít');
    assert.strictEqual(res.amount, 300000);
  });

  runTest('Handles 5 xị (slang for 500,000)', () => {
    const res = parseAmount('5 xị');
    assert.strictEqual(res.amount, 500000);
  });

  runTest('Handles 500k', () => {
    const res = parseAmount('500k');
    assert.strictEqual(res.amount, 500000);
  });

  runTest('Handles +20tr with positive sign', () => {
    const res = parseAmount('+20tr');
    assert.strictEqual(res.amount, 20000000);
    assert.strictEqual(res.sign, '+');
  });

  runTest('Handles -50k with negative sign', () => {
    const res = parseAmount('-50k');
    assert.strictEqual(res.amount, 50000);
    assert.strictEqual(res.sign, '-');
  });

  runTest('Handles 1tr5 (compound million abbreviation)', () => {
    const res = parseAmount('1tr5');
    assert.strictEqual(res.amount, 1500000);
  });

  runTest('Handles 2k5 (compound thousand abbreviation)', () => {
    const res = parseAmount('2k5');
    assert.strictEqual(res.amount, 2500);
  });

  runTest('Handles 2 củ rưỡi', () => {
    const res = parseAmount('2 củ rưỡi');
    assert.strictEqual(res.amount, 2500000);
  });

  runTest('Handles 3 lít rưỡi', () => {
    const res = parseAmount('3 lít rưỡi');
    assert.strictEqual(res.amount, 350000);
  });

  runTest('Handles 1.5 triệu (decimal with dot)', () => {
    const res = parseAmount('1.5 triệu');
    assert.strictEqual(res.amount, 1500000);
  });

  console.log('\n--- 2. Testing Transaction Type & Category Inference ---');

  runTest('Type detection: lương is income', () => {
    assert.strictEqual(detectTransactionType('lương tháng này 15tr'), 'income');
  });

  runTest('Type detection: thưởng is income', () => {
    assert.strictEqual(detectTransactionType('thưởng dự án 2 củ'), 'income');
  });

  runTest('Type detection: +20tr is income', () => {
    assert.strictEqual(detectTransactionType('+20tr tiền về', '+'), 'income');
  });

  runTest('Type detection: ăn sáng 35k defaults to expense', () => {
    assert.strictEqual(detectTransactionType('ăn sáng 35k'), 'expense');
  });

  runTest('Category Ăn uống (🍔)', () => {
    const p1 = parseExpense('ăn sáng 35k');
    assert.strictEqual(p1.category, 'Ăn uống');
    assert.strictEqual(p1.amount, 35000);
    assert.strictEqual(p1.description, 'ăn sáng');

    const p2 = parseExpense('uống cafe highland 65k');
    assert.strictEqual(p2.category, 'Ăn uống');

    const p3 = parseExpense('phở bò tái 50k');
    assert.strictEqual(p3.category, 'Ăn uống');
  });

  runTest('Category Đi lại (🚗)', () => {
    const p1 = parseExpense('đổ xăng 50k');
    assert.strictEqual(p1.category, 'Đi lại');
    assert.strictEqual(p1.amount, 50000);
    assert.strictEqual(p1.description, 'đổ xăng');

    const p2 = parseExpense('đi grab car 85k');
    assert.strictEqual(p2.category, 'Đi lại');

    const p3 = parseExpense('gửi xe 5k');
    assert.strictEqual(p3.category, 'Đi lại');
  });

  runTest('Category Mua sắm (🛍️)', () => {
    const p1 = parseExpense('mua quần áo shopee 350k');
    assert.strictEqual(p1.category, 'Mua sắm');
    assert.strictEqual(p1.amount, 350000);

    const p2 = parseExpense('đi siêu thị winmart 450.000đ');
    assert.strictEqual(p2.category, 'Mua sắm');
  });

  runTest('Category Hóa đơn (📄)', () => {
    const p1 = parseExpense('tiền điện 500.000đ');
    assert.strictEqual(p1.category, 'Hóa đơn');
    assert.strictEqual(p1.amount, 500000);

    const p2 = parseExpense('tiền mạng internet 250k');
    assert.strictEqual(p2.category, 'Hóa đơn');

    const p3 = parseExpense('tiền phòng chung cư 3.5tr');
    assert.strictEqual(p3.category, 'Hóa đơn');
    assert.strictEqual(p3.amount, 3500000);
  });

  runTest('Category Giải trí (🎮)', () => {
    const p1 = parseExpense('xem phim cgv 120k');
    assert.strictEqual(p1.category, 'Giải trí');

    const p2 = parseExpense('nạp game steam 500k');
    assert.strictEqual(p2.category, 'Giải trí');
  });

  runTest('Category Y tế (💊)', () => {
    const p1 = parseExpense('mua thuốc cảm 50k');
    assert.strictEqual(p1.category, 'Y tế');

    const p2 = parseExpense('khám răng 3 lít');
    assert.strictEqual(p2.category, 'Y tế');
    assert.strictEqual(p2.amount, 300000);
  });

  runTest('Category Tiết kiệm (💰)', () => {
    const p1 = parseExpense('gửi tiết kiệm 5 củ');
    assert.strictEqual(p1.category, 'Tiết kiệm');
    assert.strictEqual(p1.amount, 5000000);
  });

  runTest('Category Thu nhập (💵)', () => {
    const p1 = parseExpense('lương +15tr');
    assert.strictEqual(p1.type, 'income');
    assert.strictEqual(p1.category, 'Thu nhập');
    assert.strictEqual(p1.amount, 15000000);

    const p2 = parseExpense('nhận chuyển khoản 2tr');
    assert.strictEqual(p2.type, 'income');
    assert.strictEqual(p2.category, 'Thu nhập');

    const p3 = parseExpense('bán đồ cũ +500k');
    assert.strictEqual(p3.type, 'income');
    assert.strictEqual(p3.category, 'Thu nhập');
  });

  runTest('Fallback Category Khác (📝)', () => {
    const p = parseExpense('chi phí linh tinh 100k');
    assert.strictEqual(p.category, 'Khác');
    assert.strictEqual(p.amount, 100000);
  });

  console.log('\n--- 3. Testing Command Handler Endpoints & Routing ---');

  await runAsyncTest('Command: /help returns detailed guide', async () => {
    const res = await handleMessage(TEST_USER, '/help');
    assert.ok(res.includes('HƯỚNG DẪN SỬ DỤNG'));
    assert.ok(res.includes('ăn sáng 35k'));
    assert.ok(res.includes('/thongke'));
  });

  await runAsyncTest('Command: /danhmuc returns category list', async () => {
    const res = await handleMessage(TEST_USER, '/danhmuc');
    assert.ok(res.includes('DANH MỤC CHI TIÊU'));
    assert.ok(res.includes('Ăn uống'));
    assert.ok(res.includes('Đi lại'));
  });

  await runAsyncTest('Command: /ngansach 5000000 sets monthly budget', async () => {
    const res = await handleMessage(TEST_USER, '/ngansach 5000000');
    assert.ok(res.includes('CÀI ĐẶT NGÂN SÁCH THÀNH CÔNG'));
    assert.ok(res.includes('5.000.000'));

    const b = repository.getBudget(TEST_USER);
    assert.strictEqual(b.monthlyBudget, 5000000);
  });

  await runAsyncTest('Natural input: "ăn sáng 35k" logs expense to DB', async () => {
    const res = await handleMessage(TEST_USER, 'ăn sáng 35k');
    assert.ok(res.includes('GHI NHẬN CHI TIÊU'));
    assert.ok(res.includes('35.000'));
    assert.ok(res.includes('Ăn uống'));

    const txs = repository.getTransactions(TEST_USER);
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].amount, 35000);
    assert.strictEqual(txs[0].category, 'Ăn uống');
  });

  await runAsyncTest('Natural input: "đổ xăng 50k" logs second expense', async () => {
    const res = await handleMessage(TEST_USER, 'đổ xăng 50k');
    assert.ok(res.includes('50.000'));
    assert.ok(res.includes('Đi lại'));

    const txs = repository.getTransactions(TEST_USER);
    assert.strictEqual(txs.length, 2);
  });

  await runAsyncTest('Natural input: "lương +15tr" logs income', async () => {
    const res = await handleMessage(TEST_USER, 'lương +15tr');
    assert.ok(res.includes('THU NHẬP'));
    assert.ok(res.includes('15.000.000'));

    const txs = repository.getTransactions(TEST_USER, { type: 'income' });
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].amount, 15000000);
  });

  await runAsyncTest('Command: /thongke shows summary, balance, categories and budget', async () => {
    const res = await handleMessage(TEST_USER, '/thongke');
    assert.ok(res.includes('BÁO CÁO THỐNG KÊ CHI TIÊU'));
    // Total expense 85.000
    assert.ok(res.includes('85.000'));
    // Total income 15.000.000
    assert.ok(res.includes('15.000.000'));
    // Remaining budget: 5,000,000 - 85,000 = 4,915,000
    assert.ok(res.includes('4.915.000'));
    assert.ok(res.includes('Ăn uống'));
    assert.ok(res.includes('Đi lại'));
  });

  await runAsyncTest('Command: /thongke ngay | tuan | thang work seamlessly', async () => {
    const resDay = await handleMessage(TEST_USER, '/thongke ngay');
    assert.ok(resDay.includes('HÔM NAY'));

    const resWeek = await handleMessage(TEST_USER, '/thongke tuan');
    assert.ok(resWeek.includes('TUẦN NÀY'));
  });

  await runAsyncTest('Command: /xoa undoes the latest transaction', async () => {
    const res = await handleMessage(TEST_USER, '/xoa');
    assert.ok(res.includes('ĐÃ XÓA GIAO DỊCH GẦN NHẤT'));
    assert.ok(res.includes('15.000.000')); // deleted income tx

    const txs = repository.getTransactions(TEST_USER);
    assert.strictEqual(txs.length, 2); // 2 expenses remain
  });

  console.log('\n--- 4. Testing Edge Cases & Error Handling ---');

  runTest('Rejects empty or non-string input', () => {
    const res1 = parseExpense('');
    assert.strictEqual(res1.success, false);

    const res2 = parseExpense(null);
    assert.strictEqual(res2.success, false);
  });

  runTest('Rejects sentence with no amount', () => {
    const res = parseExpense('hôm nay trời đẹp quá');
    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('Không tìm thấy'));
  });

  await runAsyncTest('Unrecognized command gives clear guidance', async () => {
    const res = await handleMessage(TEST_USER, '/lenh_khong_ton_tai');
    assert.ok(res.includes('không được hỗ trợ'));
  });

  await runAsyncTest('Unrecognized natural message gives quick example tips', async () => {
    const res = await handleMessage(TEST_USER, 'xin chào bot');
    assert.ok(res.includes('chưa nhận diện được'));
    assert.ok(res.includes('ăn sáng 35k'));
  });

  // Clean up
  closeDatabase();

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedCount}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Test suite execution failed:', err);
  process.exit(1);
});
