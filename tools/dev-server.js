/**
 * 本機預覽伺服器
 *
 *   node tools/dev-server.js
 *   → http://localhost:5500
 *
 * 純粹是把專案根目錄當靜態網站丟出去，不需要安裝任何套件。
 * ⚠️ 這只是預覽，跟 GitHub Pages 的行為不完全一樣（沒有快取標頭）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');      // ⚠️ 不可寫死絕對路徑，macOS 上會爆掉
const PORT = 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';

  // 不讓路徑跳出專案資料夾
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, function () {
  console.log('預覽伺服器已啟動：http://localhost:' + PORT);
  console.log('按 Ctrl+C 停止');
});
