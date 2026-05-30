const { getDefaultConfig } = require('expo/metro-config');
// const path = require('path');

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

  // Force @babel/runtime helpers to their CommonJS build on every platform.
  // Their package exports map only node/import/default conditions; because the
  // 'import' condition is enabled above (needed for the EAS/Android build), a
  // bare `@babel/runtime/helpers/<name>` otherwise resolves to the ESM build
  // (helpers/esm/*). Metro transpiles consumers to CommonJS, so they do
  // `require('...helpers/interopRequireDefault')()` — but the ESM build's
  // module.exports is a namespace object, not the function, which crashes at
  // runtime ("_interopRequireDefault is not a function"). Resolving via Node's
  // require() conditions pins these to the CJS files, which are correct
  // everywhere, without changing resolution for any other package.
  if (/^@babel\/runtime\/helpers\/(?!esm\/)[^/]+$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [__dirname] }) };
  }

  // Force axios to use browser build
  if (moduleName === 'axios') {
    return context.resolveRequest(context, 'axios/dist/browser/axios.cjs', platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
