/**
 * End-to-End Integration Test Suite for Zalo Expense Tracker Bot
 * 
 * Verifies the full pipeline:
 * 1. Simulates user sending "ăn sáng 35k" -> verifies DB transaction created, amount 35000, category "Ăn uống", response text contains format card.
 * 2. Simulates user sending "đổ xăng 50k" -> verifies DB transaction created, amount 50000.
 * 3. Simulates user sending "lương +15tr" -> verifies income transaction created, amount 15000000.
 * 4. Simulates "/ngansach 5000000" -> verifies monthly budget set to 5000000.
 * 5. Simulates "/thongke" -> verifies summary calculation (total expense 85000, total income 15000000, remaining budget 4915000).
 * 6. Simulates "/xoa" -> verifies latest transaction undone.
 * 7. Tests edge cases: invalid syntax, empty strings, unrecognized words.
 * 8. End-to-end HTTP Webhook & Simulator API pipeline verification.
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const repository = require('../db/repository');
const { getDatabase } = require('../db/database');
const commandHandler = require('../services/commandHandler');
const { app } = require('../server');
const zaloClient = require('../zalo/zaloClient');

console.log('================================================================');
console.log('🧪 RUNNING FULL END-TO-END INTEGRATION TEST SUITE');
console.log('   Target: Zalo Expense Tracker Bot Pipeline');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          console.log(`  ✅ [PASS] ${description}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${description}`);
          console.error(`     Error: ${err.message}`);
          throw err;
        });
    } else {
      console.log(`  ✅ [PASS] ${description}`);
      passedTests++;
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runAllIntegrationTests() {
  const testUserId = `e2e_user_${Date.now()}`;
  console.log(`👤 Using isolated test user ID: ${testUserId}\n`);

  // Ensure user is clean
  if (typeof repository.clearUserData === 'function') {
    repository.clearUserData(testUserId);
  }

  // -------------------------------------------------------------
  // Test 1: Simulates user sending "ăn sáng 35k"
  // -------------------------------------------------------------
  await it('Step 1: User sends "ăn sáng 35k" -> DB transaction created (35.000đ, "Ăn uống"), returns format card', async () => {
    const reply = await commandHandler.handleMessage(testUserId, 'ăn sáng 35k');

    // Verify response card format
    assert.ok(reply, 'Reply should not be empty');
    assert.ok(
      reply.includes('GHI NHẬN CHI TIÊU THÀNH CÔNG'),
      'Reply should contain expense confirmation title'
    );
    assert.ok(reply.includes('35.000'), 'Reply should format amount 35.000');
    assert.ok(reply.includes('Ăn uống'), 'Reply should contain category "Ăn uống"');
    assert.ok(reply.includes('🍔'), 'Reply should contain icon 🍔');

    // Verify DB state directly
    const txs = repository.getTransactions(testUserId, { limit: 10 });
    assert.strictEqual(txs.length, 1, 'Exactly 1 transaction should exist in DB');
    assert.strictEqual(txs[0].amount, 35000, 'DB amount must be 35000');
    assert.strictEqual(txs[0].type, 'expense', 'DB type must be expense');
    assert.strictEqual(txs[0].category, 'Ăn uống', 'DB category must be "Ăn uống"');
  });

  // -------------------------------------------------------------
  // Test 2: Simulates user sending "đổ xăng 50k"
  // -------------------------------------------------------------
  await it('Step 2: User sends "đổ xăng 50k" -> DB transaction created (50.000đ, "Đi lại")', async () => {
    const reply = await commandHandler.handleMessage(testUserId, 'đổ xăng 50k');

    // Verify response card
    assert.ok(reply.includes('GHI NHẬN CHI TIÊU THÀNH CÔNG'), 'Reply should contain success header');
    assert.ok(reply.includes('50.000'), 'Reply should format amount 50.000');
    assert.ok(reply.includes('Đi lại'), 'Reply should contain category "Đi lại"');
    assert.ok(reply.includes('🚗'), 'Reply should contain icon 🚗');

    // Verify DB state directly
    const txs = repository.getTransactions(testUserId, { limit: 10 });
    assert.strictEqual(txs.length, 2, '2 transactions should now exist in DB');
    const latestTx = txs[0]; // descending order
    assert.strictEqual(latestTx.amount, 50000, 'Latest DB amount must be 50000');
    assert.strictEqual(latestTx.type, 'expense', 'Latest DB type must be expense');
    assert.strictEqual(latestTx.category, 'Đi lại', 'Latest DB category must be "Đi lại"');
  });

  // -------------------------------------------------------------
  // Test 3: Simulates user sending "lương +15tr"
  // -------------------------------------------------------------
  await it('Step 3: User sends "lương +15tr" -> DB income transaction created (15.000.000đ, "Thu nhập")', async () => {
    const reply = await commandHandler.handleMessage(testUserId, 'lương +15tr');

    // Verify response card
    assert.ok(
      reply.includes('THU NHẬP') || reply.includes('GHI NHẬN THU NHẬP'),
      'Reply should contain income confirmation header'
    );
    assert.ok(reply.includes('15.000.000'), 'Reply should format amount 15.000.000');
    assert.ok(reply.includes('Thu nhập'), 'Reply should identify category "Thu nhập"');
    assert.ok(reply.includes('💵'), 'Reply should contain icon 💵');

    // Verify DB state directly
    const txs = repository.getTransactions(testUserId, { limit: 10 });
    assert.strictEqual(txs.length, 3, '3 transactions should now exist in DB');
    const incomeTx = txs.find(t => t.type === 'income');
    assert.ok(incomeTx, 'An income transaction must exist in DB');
    assert.strictEqual(incomeTx.amount, 15000000, 'Income amount must be 15000000');
    assert.strictEqual(incomeTx.category, 'Thu nhập', 'Income category must be "Thu nhập"');
  });

  // -------------------------------------------------------------
  // Test 4: Simulates user sending "/ngansach 5000000"
  // -------------------------------------------------------------
  await it('Step 4: User sends "/ngansach 5000000" -> monthly budget set to 5000000', async () => {
    const reply = await commandHandler.handleMessage(testUserId, '/ngansach 5000000');

    // Verify response text
    assert.ok(reply.includes('CÀI ĐẶT NGÂN SÁCH THÀNH CÔNG'), 'Reply should confirm budget setting');
    assert.ok(reply.includes('5.000.000'), 'Reply should display 5.000.000 đ budget');

    // Verify DB state directly
    const budgetInfo = repository.getBudget(testUserId);
    assert.strictEqual(budgetInfo.monthlyBudget, 5000000, 'DB monthlyBudget must be 5000000');
    assert.strictEqual(budgetInfo.currentSpending, 85000, 'Current spending must be 35k + 50k = 85000');
    assert.strictEqual(budgetInfo.remaining, 4915000, 'Remaining budget must be 4915000');
  });

  // -------------------------------------------------------------
  // Test 5: Simulates user sending "/thongke"
  // -------------------------------------------------------------
  await it('Step 5: User sends "/thongke" -> verifies summary (expense: 85k, income: 15tr, budget remaining: 4915000)', async () => {
    const reply = await commandHandler.handleMessage(testUserId, '/thongke');

    // Verify response text calculations
    assert.ok(reply.includes('BÁO CÁO THỐNG KÊ'), 'Reply should contain report header');
    assert.ok(reply.includes('15.000.000'), 'Reply should include total income 15.000.000');
    assert.ok(reply.includes('85.000'), 'Reply should include total expense 85.000');
    assert.ok(reply.includes('14.915.000'), 'Reply should include balance 14.915.000');
    assert.ok(reply.includes('4.915.000'), 'Reply should include remaining budget 4.915.000');
    assert.ok(reply.includes('Ăn uống'), 'Reply should list category Ăn uống');
    assert.ok(reply.includes('Đi lại'), 'Reply should list category Đi lại');

    // Direct repository assertion
    const summary = repository.getSummary(testUserId, 'month');
    assert.strictEqual(summary.totalExpense, 85000, 'Total expense must be 85000');
    assert.strictEqual(summary.totalIncome, 15000000, 'Total income must be 15000000');
    assert.strictEqual(summary.balance, 14915000, 'Balance must be 14915000');
    assert.strictEqual(summary.budget.remaining, 4915000, 'Remaining budget must be 4915000');
  });

  // -------------------------------------------------------------
  // Test 6: Simulates user sending "/xoa" -> latest transaction undone
  // -------------------------------------------------------------
  await it('Step 6: User sends "/xoa" -> latest transaction undone and removed from DB', async () => {
    // Current transactions count is 3 (Ăn uống 35k, Đi lại 50k, Thu nhập 15tr)
    const beforeCount = repository.getTransactions(testUserId).length;
    assert.strictEqual(beforeCount, 3);

    const reply = await commandHandler.handleMessage(testUserId, '/xoa');

    assert.ok(reply.includes('ĐÃ XÓA GIAO DỊCH GẦN NHẤT'), 'Reply should confirm undo of last transaction');
    assert.ok(reply.includes('15.000.000'), 'Undone transaction was the 15tr income');

    // Direct repository assertion
    const afterCount = repository.getTransactions(testUserId).length;
    assert.strictEqual(afterCount, 2, 'Transactions count should now be 2');

    // Summary re-check: income should now be 0, expenses still 85000
    const summaryAfterUndo = repository.getSummary(testUserId, 'month');
    assert.strictEqual(summaryAfterUndo.totalIncome, 0, 'Income must be 0 after undo');
    assert.strictEqual(summaryAfterUndo.totalExpense, 85000, 'Expenses remain 85000');
    assert.strictEqual(summaryAfterUndo.budget.remaining, 4915000, 'Budget remaining is unchanged');
  });

  // -------------------------------------------------------------
  // Test 7: Edge cases & error handling
  // -------------------------------------------------------------
  await it('Step 7.1: Edge Case - Empty or whitespace string', async () => {
    const reply1 = await commandHandler.handleMessage(testUserId, '');
    assert.ok(reply1.includes('trống'), 'Empty string should return empty warning');

    const reply2 = await commandHandler.handleMessage(testUserId, '   ');
    assert.ok(reply2.includes('trống'), 'Whitespace string should return empty warning');
  });

  await it('Step 7.2: Edge Case - Unrecognized natural conversation without amount', async () => {
    const reply = await commandHandler.handleMessage(testUserId, 'hôm nay thời tiết đẹp quá nhỉ bot ơi');
    assert.ok(
      reply.includes('chưa nhận diện') || reply.includes('Cách ghi chi tiêu'),
      'Chat without amounts should guide user with examples'
    );
  });

  await it('Step 7.3: Edge Case - Unsupported slash command', async () => {
    const reply = await commandHandler.handleMessage(testUserId, '/khongtontai');
    assert.ok(reply.includes('không được hỗ trợ'), 'Unsupported command should prompt help guide');
  });

  await it('Step 7.4: Edge Case - Invalid budget syntax', async () => {
    const reply = await commandHandler.handleMessage(testUserId, '/ngansach abcxyz');
    assert.ok(
      reply.includes('không hợp lệ') || reply.includes('Vui lòng nhập số tiền'),
      'Invalid budget parameter should give helpful warning'
    );
  });

  await it('Step 7.5: Edge Case - Consecutive /xoa until history is empty', async () => {
    // Delete 50k
    const del1 = await commandHandler.handleMessage(testUserId, '/xoa');
    assert.ok(del1.includes('ĐÃ XÓA GIAO DỊCH GẦN NHẤT'));

    // Delete 35k
    const del2 = await commandHandler.handleMessage(testUserId, '/xoa');
    assert.ok(del2.includes('ĐÃ XÓA GIAO DỊCH GẦN NHẤT'));

    // Try deleting when empty
    const delEmpty = await commandHandler.handleMessage(testUserId, '/xoa');
    assert.ok(
      delEmpty.includes('chưa có giao dịch nào') || delEmpty.includes('ℹ️'),
      'Deleting when empty should safely notify user without crashing'
    );
  });

  // -------------------------------------------------------------
  // Test 8: End-to-End HTTP Webhook & Simulator API Server Pipeline
  // -------------------------------------------------------------
  console.log('\n--- Testing End-to-End HTTP Server Pipeline ---');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const requestHelper = (method, pathUrl, body = null) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathUrl, baseUrl);
      const headers = {};
      let bodyData = '';
      if (body) {
        bodyData = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }
      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: data ? JSON.parse(data) : null,
              rawBody: data
            });
          } catch (_) {
            resolve({
              statusCode: res.statusCode,
              body: null,
              rawBody: data
            });
          }
        });
      });
      req.on('error', reject);
      if (bodyData) req.write(bodyData);
      req.end();
    });
  };

  try {
    await it('Step 8.1: Server GET /health returns status ok', async () => {
      const res = await requestHelper('GET', '/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    await it('Step 8.2: Server GET /webhook echoes challenge', async () => {
      const res = await requestHelper('GET', '/webhook?challenge=integration_test_challenge_abc');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.rawBody, 'integration_test_challenge_abc');
    });

    await it('Step 8.3: Server GET /simulator serves HTML UI', async () => {
      const res = await requestHelper('GET', '/simulator');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.rawBody.includes('Zalo Expense Bot Simulator'));
      assert.ok(res.rawBody.includes('Trình Giả Lập Chat Zalo'));
    });

    await it('Step 8.4: Server POST /api/simulate routes message and returns bot reply', async () => {
      const simUserId = `sim_http_user_${Date.now()}`;
      const res = await requestHelper('POST', '/api/simulate', {
        userId: simUserId,
        message: 'mua sách tiki 120k'
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.reply.includes('GHI NHẬN CHI TIÊU THÀNH CÔNG'));
      assert.ok(res.body.reply.includes('120.000'));
      assert.ok(res.body.reply.includes('Mua sắm'));

      // Check DB persisted via HTTP endpoint
      const txs = repository.getTransactions(simUserId);
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].amount, 120000);
      assert.strictEqual(txs[0].category, 'Mua sắm');
    });

    await it('Step 8.5: Server POST /webhook handles standard Zalo OA event payload', async () => {
      const zaloUserId = `zalo_oa_sender_${Date.now()}`;
      const webhookPayload = {
        app_id: '1234567890',
        event_name: 'user_send_text_message',
        sender: { id: zaloUserId },
        recipient: { id: 'oa_recipient_id' },
        message: {
          msg_id: 'msg_webhook_001',
          text: 'cơm trưa 40k'
        },
        timestamp: Date.now()
      };

      const res = await requestHelper('POST', '/webhook', webhookPayload);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.reply.includes('GHI NHẬN CHI TIÊU THÀNH CÔNG'));
      assert.ok(res.body.reply.includes('40.000'));

      // Verify DB record created from Zalo webhook
      const txs = repository.getTransactions(zaloUserId);
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].amount, 40000);
      assert.strictEqual(txs[0].category, 'Ăn uống');
    });
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

// Execute tests
runAllIntegrationTests().catch((err) => {
  console.error('\n💥 Integration test execution failed with unhandled error:');
  console.error(err);
  process.exit(1);
});
