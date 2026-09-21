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
        // Downgraded from 'off' → 'warn' (2026-09-21): new `any`s are flagged;
        // burn down the existing ~130 matches over time. See code-quality review.
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
    // NOTE: 'server/' intentionally linted (0 errors, 5 unused-var warnings as of
    // 2026-09-21 — left for the security track that owns server/). The portals
    // were un-ignored on the same date; keep them lint-clean.
    'webpack.config.js',
  ],
  rules: {
    'no-console': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': 'warn',
    'no-case-declarations': 'warn',
    'prefer-const': 'warn',
    'no-undef': 'off',
  },
};
