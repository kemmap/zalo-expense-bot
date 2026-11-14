/**
 * upload_to_github.js
 * Tự động tạo Repository và đẩy toàn bộ mã nguồn lên GitHub qua GitHub REST API
 * Yêu cầu: GitHub Personal Access Token (classic hoặc fine-grained với quyền repo).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROJECT_DIR = path.resolve(__dirname, '..');

// Danh sách các file/folder được phép tải lên (loại bỏ node_modules, data, .env)
const IGNORED_PATHS = ['node_modules', '.env', 'data', '.git', 'zalo_session.json', '.DS_Store'];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    if (IGNORED_PATHS.includes(file)) return;

    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function uploadToGitHub(token, repoName = 'zalo-expense-bot', isPrivate = false) {
  if (!token) {
    throw new Error('Vui lòng cung cấp GitHub Personal Access Token.');
  }

  const client = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Zalo-Expense-Bot-Uploader'
    }
  });

  console.log('🔍 Đang kiểm tra tài khoản GitHub...');
  const userRes = await client.get('/user');
  const username = userRes.data.login;
  console.log(`👤 Đăng nhập thành công với tài khoản: ${username}`);

  // 1. Kiểm tra hoặc tạo Repo mới
  console.log(`📁 Đang kiểm tra repository "${repoName}"...`);
  let repoData;
  try {
    const existingRepo = await client.get(`/repos/${username}/${repoName}`);
    repoData = existingRepo.data;
    console.log(`ℹ️ Repository "${repoName}" đã tồn tại. Sẽ cập nhật mã nguồn mới...`);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log(`🚀 Đang tạo repository mới "${repoName}" trên GitHub...`);
      const createRes = await client.post('/user/repos', {
        name: repoName,
        description: 'Bot Zalo Quản lý Chi tiêu Cá nhân tự động',
        private: isPrivate,
        auto_init: true
      });
      repoData = createRes.data;
      console.log(`✅ Đã tạo repository: ${repoData.html_url}`);
      // Đợi 2s để GitHub khởi tạo branch main
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      throw err;
    }
  }

  // 2. Lấy commit SHA mới nhất của branch main
  let latestCommitSha;
  try {
    const refRes = await client.get(`/repos/${username}/${repoName}/git/ref/heads/main`);
    latestCommitSha = refRes.data.object.sha;
  } catch (e) {
    // Thử branch master nếu main không có
    const refRes = await client.get(`/repos/${username}/${repoName}/git/ref/heads/master`);
    latestCommitSha = refRes.data.object.sha;
  }

  // 3. Chuẩn bị danh sách files
  const filePaths = getAllFiles(PROJECT_DIR);
  console.log(`📦 Tìm thấy ${filePaths.length} files mã nguồn cần tải lên...`);

  // 4. Tạo các Git Blobs
  const treeItems = [];
  for (const filePath of filePaths) {
    const relativePath = path.relative(PROJECT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath);
    const isBinary = filePath.endsWith('.png') || filePath.endsWith('.ico') || filePath.endsWith('.jpg');

    const blobRes = await client.post(`/repos/${username}/${repoName}/git/blobs`, {
      content: content.toString(isBinary ? 'base64' : 'utf-8'),
      encoding: isBinary ? 'base64' : 'utf-8'
    });

    treeItems.push({
      path: relativePath,
      mode: '100644',
      type: 'blob',
      sha: blobRes.data.sha
    });
  }

  // 5. Tạo Git Tree mới
  console.log('🌳 Đang tạo Git Tree...');
  const treeRes = await client.post(`/repos/${username}/${repoName}/git/trees`, {
    base_tree: latestCommitSha,
    tree: treeItems
  });

  // 6. Tạo Git Commit mới
  console.log('📝 Đang tạo Commit...');
  const commitRes = await client.post(`/repos/${username}/${repoName}/git/commits`, {
    message: 'Deploy Zalo Expense Tracker Bot to Cloud',
    tree: treeRes.data.sha,
    parents: [latestCommitSha]
  });

  // 7. Cập nhật branch main trỏ tới commit mới
  console.log('📌 Đang cập nhật branch main...');
  await client.patch(`/repos/${username}/${repoName}/git/refs/heads/main`, {
    sha: commitRes.data.sha
  });

  console.log('\n===============================================================');
  console.log('🎉 TẢI LÊN GITHUB THÀNH CÔNG 100%!');
  console.log(`🔗 Link Repository: ${repoData.html_url}`);
  console.log('👉 Bây giờ bạn có thể kết nối link này vào Render.com để deploy!');
  console.log('===============================================================\n');

  return repoData.html_url;
}

if (require.main === module) {
  const token = process.argv[2] || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Cách dùng: node scripts/upload_to_github.js <GITHUB_TOKEN>');
    process.exit(1);
  }
  uploadToGitHub(token).catch((err) => {
    console.error('❌ Lỗi:', err.response?.data || err.message);
    process.exit(1);
  });
}

module.exports = { uploadToGitHub };
