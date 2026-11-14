const axios = require('axios');

class ZaloClient {
  constructor() {
    this.accessToken = process.env.ZALO_ACCESS_TOKEN || '';
    this.appId = process.env.ZALO_APP_ID || '';
    this.appSecret = process.env.ZALO_APP_SECRET || '';
    this.oaSecretKey = process.env.ZALO_OA_SECRET_KEY || '';
    this.refreshToken = process.env.ZALO_REFRESH_TOKEN || '';
    this.csEndpoint = 'https://openapi.zalo.me/v3.0/oa/message/cs';
    this.tokenEndpoint = 'https://oauth.zalo.me/v4/oa/access_token';
  }

  setAccessToken(token) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken || process.env.ZALO_ACCESS_TOKEN || '';
  }

  isConfigured() {
    return Boolean(this.getAccessToken());
  }

  /**
   * Send text message to a user via Zalo OA Customer Service API
   * @param {string} userId - Zalo User ID (from webhook sender.id)
   * @param {string|object} textMessage - Message string or object with text property
   * @returns {Promise<object>} Response from Zalo API
   */
  async sendMessage(userId, textMessage) {
    const text = typeof textMessage === 'string' ? textMessage : (textMessage?.text || '');
    const token = this.getAccessToken();

    if (!token || token.startsWith('dummy_') || token === 'your_access_token_here') {
      console.log(`[ZaloClient] [SIMULATED] Sending message to ${userId}:\n${text}`);
      return {
        error: 0,
        message: 'Success (Simulated - no active Zalo Access Token configured)',
        data: {
          msg_id: `sim_msg_${Date.now()}`,
          recipient: userId,
          text
        }
      };
    }

    try {
      const payload = {
        recipient: {
          user_id: userId
        },
        message: {
          text
        }
      };

      const response = await axios.post(this.csEndpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          access_token: token
        },
        timeout: 10000
      });

      console.log(`[ZaloClient] Sent message to ${userId}. Response:`, response.data);
      return response.data;
    } catch (error) {
      const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error(`[ZaloClient] Error sending message to ${userId}:`, errorMsg);
      return {
        error: -1,
        message: `Failed to send Zalo message: ${errorMsg}`,
        details: error.response?.data
      };
    }
  }

  /**
   * Renew Zalo OA Access Token using Refresh Token
   * @param {string} [refreshToken]
   * @param {string} [appId]
   * @param {string} [secretKey]
   * @returns {Promise<object>}
   */
  async refreshAccessToken(refreshToken, appId, secretKey) {
    const rToken = refreshToken || this.refreshToken || process.env.ZALO_REFRESH_TOKEN;
    const aId = appId || this.appId || process.env.ZALO_APP_ID;
    const sKey = secretKey || this.appSecret || process.env.ZALO_APP_SECRET || this.oaSecretKey || process.env.ZALO_OA_SECRET_KEY;

    if (!rToken || !aId || !sKey) {
      const missing = [];
      if (!rToken) missing.push('refreshToken');
      if (!aId) missing.push('appId');
      if (!sKey) missing.push('secretKey/appSecret');
      console.warn(`[ZaloClient] Cannot refresh token: missing ${missing.join(', ')}`);
      return {
        error: -1,
        message: `Missing configuration for token refresh: ${missing.join(', ')}`
      };
    }

    try {
      const params = new URLSearchParams();
      params.append('refresh_token', rToken);
      params.append('app_id', aId);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(this.tokenEndpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: sKey
        },
        timeout: 10000
      });

      if (response.data && response.data.access_token) {
        this.setAccessToken(response.data.access_token);
        if (response.data.refresh_token) {
          this.refreshToken = response.data.refresh_token;
        }
        console.log('[ZaloClient] Access token successfully refreshed. Expires in:', response.data.expires_in);
      } else {
        console.warn('[ZaloClient] Token refresh returned non-standard response:', response.data);
      }

      return response.data;
    } catch (error) {
      const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
      console.error('[ZaloClient] Error refreshing token:', errorMsg);
      return {
        error: -1,
        message: `Failed to refresh token: ${errorMsg}`,
        details: error.response?.data
      };
    }
  }
}

const defaultClient = new ZaloClient();

module.exports = defaultClient;
module.exports.ZaloClient = ZaloClient;
