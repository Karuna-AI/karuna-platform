/**
 * Production server for Caregiver Portal
 * Serves static files and proxies API requests
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;
const API_URL = process.env.API_URL || 'https://karuna-api-production.up.railway.app';

// API proxy
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  ws: true,
}));

// WebSocket proxy
app.use('/ws', createProxyMiddleware({
  target: API_URL.replace('https', 'wss').replace('http', 'ws'),
  changeOrigin: true,
  ws: true,
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Caregiver Portal running on port ${PORT}`);
  console.log(`API proxied to: ${API_URL}`);
});
