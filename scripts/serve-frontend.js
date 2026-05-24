const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = path.join(__dirname, '../client/build');
const port = Number(process.env.FRONTEND_PORT || 3000);
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3001';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function proxyToBackend(req, res) {
  const target = new URL(req.url, backendUrl);
  const headers = { ...req.headers, host: new URL(backendUrl).host };

  const proxyReq = http.request(
    target,
    { method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('后端不可用，请确认 server 已启动在 ' + backendUrl);
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  let filePath = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        const fallback = path.join(root, 'index.html');
        return fs.readFile(fallback, (fbErr, fbData) => {
          if (fbErr) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fbData);
        });
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname.startsWith('/api') || pathname.startsWith('/uploads')) {
    return proxyToBackend(req, res);
  }
  return serveStatic(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`前端入口: http://localhost:${port} (API/uploads 代理 -> ${backendUrl})`);
});
