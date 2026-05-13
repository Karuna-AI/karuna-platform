/**
 * Production server for Caregiver Portal
 * Serves static files and proxies API requests
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;
const API_URL = process.env.API_URL || 'https://karuna-api-production.up.railway.app';

// Body size limit — applied before proxy to prevent large-payload amplification
app.use(express.json({ limit: '1mb' }));

// HSTS for TLS-terminating deployments
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Rate limiting on auth routes (strict) before proxy
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait and try again.' },
});
app.use('/api/care/auth', authLimiter);

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

// SPA fallback — only for non-API, non-WS paths
app.get(/^(?!\/api|\/ws).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Caregiver Portal running on port ${PORT}`);
    console.log(`API proxied to: ${API_URL}`);
  } else {
    console.log(`Caregiver Portal running on port ${PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Caregiver Portal server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Caregiver Portal server closed');
    process.exit(0);
  });
});
