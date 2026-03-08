module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  plugins: ['react-native'],
  extends: [
    'eslint:recommended',
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: {
      presets: ['@babel/preset-react'],
    },
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      extends: [
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-require-imports': 'off',
        'prefer-const': 'warn',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.expo/',
    'android/',
    'ios/',
    'coverage/',
    'server/',
    'caregiver-portal/',
    'admin-portal/',
    'webpack.config.js',
  ],
  rules: {
    'no-console': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-empty': 'warn',
    'no-case-declarations': 'warn',
    'prefer-const': 'warn',
    'no-undef': 'off',
  },
};
