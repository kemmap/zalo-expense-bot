require('dotenv').config();
const axios = require('axios');

async function checkZaloCredentials() {
  const token = process.env.ZALO_ACCESS_TOKEN;
  const appId = process.env.ZALO_APP_ID;
  const oaId = process.env.ZALO_OA_ID;

  console.log('====================================================');
  console.log('🔍 KIỂM TRA THÔNG TIN KẾT NỐI ZALO OA');
  console.log('====================================================');
  console.log(`• App ID:  ${appId || 'Chưa cấu hình'}`);
  console.log(`• OA ID:   ${oaId || 'Chưa cấu hình'}`);
  console.log(`• Token:   ${token ? token.substring(0, 15) + '...' : 'Chưa cấu hình'}`);
  console.log('----------------------------------------------------');

  if (!token || token.includes('your_zalo_access_token')) {
    console.log('⚠️  Chưa điền ZALO_ACCESS_TOKEN thực tế vào file .env');
    console.log('👉 Vui lòng mở file .env và điền các thông tin từ developers.zalo.me');
    return;
  }

  try {
    console.log('📡 Đang gửi yêu cầu kiểm tra tới Zalo OpenAPI...');
    const res = await axios.get('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: token }
    });

    if (res.data.error === 0) {
      console.log('🎉 KẾT NỐI ZALO OA THÀNH CÔNG!');
      console.log(`• Tên OA: ${res.data.data.name}`);
      console.log(`• OA ID:  ${res.data.data.oa_id}`);
      console.log(`• Mô tả:  ${res.data.data.description}`);
    } else {
      console.log('❌ LỖI TỪ ZALO API:');
      console.log(`• Mã lỗi: ${res.data.error}`);
      console.log(`• Thông báo: ${res.data.message}`);
    }
  } catch (err) {
    console.log('❌ Lỗi kết nối:', err.message);
  }
}

checkZaloCredentials();
