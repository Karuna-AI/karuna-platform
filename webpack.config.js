const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

const appDirectory = path.resolve(__dirname);

const babelLoaderConfiguration = {
  test: /\.(js|jsx|ts|tsx)$/,
  include: [
    path.resolve(appDirectory, 'index.web.js'),
    path.resolve(appDirectory, 'src'),
    path.resolve(appDirectory, 'node_modules/react-native-vector-icons'),
  ],
  use: {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      presets: [
        ['@babel/preset-env', { targets: { browsers: ['last 2 versions'] } }],
        '@babel/preset-react',
        '@babel/preset-typescript',
      ],
      plugins: [],
    },
  },
};

const imageLoaderConfiguration = {
  test: /\.(gif|jpe?g|png|svg)$/,
  use: {
    loader: 'url-loader',
    options: {
      name: '[name].[ext]',
      esModule: false,
    },
  },
};

module.exports = {
  entry: path.resolve(appDirectory, 'index.web.js'),
  output: {
    filename: 'bundle.[contenthash].js',
    path: path.resolve(appDirectory, 'dist'),
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js'],
    alias: {
      'react-native$': 'react-native-web',
      'react-native-tts': path.resolve(__dirname, 'src/web/tts-mock.ts'),
      'react-native-audio-recorder-player': path.resolve(__dirname, 'src/web/audio-recorder-mock.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/web/async-storage-mock.ts'),
      '@env': path.resolve(__dirname, 'src/web/env-mock.ts'),
      // Expo package mocks for web
      'expo-document-picker': path.resolve(__dirname, 'src/web/expo-document-picker-mock.ts'),
      'expo-notifications': path.resolve(__dirname, 'src/web/expo-notifications-mock.ts'),
      'expo-clipboard': path.resolve(__dirname, 'src/web/expo-clipboard-mock.ts'),
      'expo-background-fetch': path.resolve(__dirname, 'src/web/expo-background-fetch-mock.ts'),
      'expo-task-manager': path.resolve(__dirname, 'src/web/expo-task-manager-mock.ts'),
      'expo-secure-store': path.resolve(__dirname, 'src/web/expo-secure-store-mock.ts'),
      'expo-location': path.resolve(__dirname, 'src/web/expo-location-mock.ts'),
      'expo-localization': path.resolve(__dirname, 'src/web/expo-localization-mock.ts'),
      'expo-speech': path.resolve(__dirname, 'src/web/expo-speech-mock.ts'),
      'expo-local-authentication': path.resolve(__dirname, 'src/web/expo-local-authentication-mock.ts'),
      'expo-calendar': path.resolve(__dirname, 'src/web/expo-calendar-mock.ts'),
      'expo-file-system': path.resolve(__dirname, 'src/web/expo-file-system-mock.ts'),
      '@react-native-community/slider': path.resolve(__dirname, 'src/web/slider-mock.tsx'),
    },
  },
  module: {
    rules: [babelLoaderConfiguration, imageLoaderConfiguration],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(appDirectory, 'public/index.html'),
    }),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        TELEMETRY_ENDPOINT: process.env.TELEMETRY_ENDPOINT || '',
        NODE_ENV: process.env.NODE_ENV || 'development',
      }),
    }),
  ],
  devServer: {
    static: {
      directory: path.join(appDirectory, 'public'),
    },
    compress: true,
    port: 3020,
    hot: true,
    historyApiFallback: true,
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: 'source-map',
};
