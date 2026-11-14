const assert = require('assert');
const http = require('http');
const zaloClient = require('./zaloClient');
const { app, processUserMessage } = require('../server');

async function runTests() {
  console.log('--- Testing Zalo Client ---');

  // Test 1: ZaloClient initialization and simulation
  assert.strictEqual(typeof zaloClient.sendMessage, 'function');
  assert.strictEqual(typeof zaloClient.refreshAccessToken, 'function');

  const simResult = await zaloClient.sendMessage('test_user_123', 'Hello from test');
  assert.strictEqual(simResult.error, 0);
  assert(simResult.message.includes('Simulated') || simResult.error === 0);
  console.log('✓ ZaloClient.sendMessage (simulated mode) passed');

  // Test 2: Token refresh validation
  const refreshResult = await zaloClient.refreshAccessToken('', '', '');
  assert.strictEqual(refreshResult.error, -1);
  console.log('✓ ZaloClient.refreshAccessToken parameter check passed');

  console.log('--- Testing Express Server Endpoints ---');

  // Start test server on random free port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // Helper function for HTTP requests
    const makeRequest = (method, path, body = null, headers = {}) => {
      return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const reqHeaders = { ...headers };
        let bodyStr = '';
        if (body) {
          bodyStr = JSON.stringify(body);
          reqHeaders['Content-Type'] = 'application/json';
          reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = http.request(url, { method, headers: reqHeaders }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
      });
    };

    // Test 3: GET /health
    const healthRes = await makeRequest('GET', '/health');
    assert.strictEqual(healthRes.status, 200);
    const healthJson = JSON.parse(healthRes.body);
    assert.strictEqual(healthJson.status, 'ok');
    assert(typeof healthJson.uptime === 'number');
    console.log('✓ GET /health endpoint passed');

    // Test 4: GET /webhook verification with challenge
    const challengeRes = await makeRequest('GET', '/webhook?challenge=test_challenge_12345');
    assert.strictEqual(challengeRes.status, 200);
    assert.strictEqual(challengeRes.body, 'test_challenge_12345');
    console.log('✓ GET /webhook challenge verification passed');

    // Test 5: GET /webhook normal
    const webhookGetRes = await makeRequest('GET', '/webhook');
    assert.strictEqual(webhookGetRes.status, 200);
    const webhookGetJson = JSON.parse(webhookGetRes.body);
    assert.strictEqual(webhookGetJson.status, 'ok');
    console.log('✓ GET /webhook normal status passed');

    // Test 6: GET /simulator serves HTML UI
    const simRes = await makeRequest('GET', '/simulator');
    assert.strictEqual(simRes.status, 200);
    assert(simRes.headers['content-type'].includes('text/html'));
    assert(simRes.body.includes('Zalo Expense Bot Simulator'));
    assert(simRes.body.includes('Webhook Event Inspector'));
    console.log('✓ GET /simulator HTML playground passed');

    // Test 7: POST /api/simulate
    const apiSimRes = await makeRequest('POST', '/api/simulate', {
      userId: 'test_user_sim',
      message: 'ăn sáng 35k'
    });
    assert.strictEqual(apiSimRes.status, 200);
    const apiSimJson = JSON.parse(apiSimRes.body);
    assert.strictEqual(apiSimJson.success, true);
    assert.strictEqual(apiSimJson.userId, 'test_user_sim');
    assert(typeof apiSimJson.reply === 'string');
    console.log('✓ POST /api/simulate endpoint passed');

    // Test 8: POST /webhook (Zalo event)
    const zaloWebhookRes = await makeRequest('POST', '/webhook', {
      app_id: '123456789',
      event_name: 'user_send_text_message',
      sender: { id: 'zalo_user_999' },
      message: { text: '/help' }
    });
    assert.strictEqual(zaloWebhookRes.status, 200);
    const zaloWebhookJson = JSON.parse(zaloWebhookRes.body);
    assert.strictEqual(zaloWebhookJson.status, 'ok');
    console.log('✓ POST /webhook handling passed');

    console.log('\n🎉 ALL BOT_SERVER TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
