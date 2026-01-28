const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable CSS support for web
config.resolver.sourceExts.push('css');

// Support for additional asset types
config.resolver.assetExts.push('db', 'mp3', 'wav', 'ttf', 'otf');

// Prefer browser-compatible builds for packages
config.resolver.unstable_conditionNames = ['browser', 'react-native', 'require', 'import'];

// Custom resolver to handle axios and other problematic packages
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Node.js built-in modules to stub
  const nodeBuiltins = [
    'crypto', 'http', 'https', 'http2', 'url', 'stream', 'zlib', 'net', 'tls', 'fs',
    'path', 'os', 'events', 'assert', 'util', 'buffer', 'querystring',
    'form-data', 'proxy-from-env', 'follow-redirects', 'child_process', 'dns'
  ];

  if (nodeBuiltins.includes(moduleName)) {
    return { type: 'empty' };
  }

  // Force axios to use browser build
  if (moduleName === 'axios') {
    return context.resolveRequest(context, 'axios/dist/browser/axios.cjs', platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
