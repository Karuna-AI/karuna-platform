const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable CSS support for web
config.resolver.sourceExts.push('css');

// Support for additional asset types
config.resolver.assetExts.push('db', 'mp3', 'wav', 'ttf', 'otf');

module.exports = config;
