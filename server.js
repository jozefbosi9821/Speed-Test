const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_DOWNLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB upper bound safeguard

app.disable('etag');

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  cacheControl: false,
  maxAge: 0,
}));

app.get('/api/ping', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store',
  });
  res.json({ timestamp: Date.now() });
});

app.get('/api/download', (req, res) => {
  const requestedSize = Number.parseInt(req.query.size, 10);
  const size = Number.isFinite(requestedSize) && requestedSize > 0
    ? Math.min(requestedSize, MAX_DOWNLOAD_SIZE)
    : DEFAULT_DOWNLOAD_SIZE;

  const buffer = Buffer.alloc(size, 'a');

  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Disposition': 'attachment; filename="payload.bin"',
  });

  res.send(buffer);
});

app.post('/api/upload', express.raw({ type: '*/*', limit: '100mb' }), (req, res) => {
  const bytesReceived = req.body ? req.body.length : 0;
  res.set({
    'Cache-Control': 'no-store',
  });
  res.json({ bytesReceived });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Speed test server running at http://localhost:${PORT}`);
});
