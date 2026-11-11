const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  prettierRecommended,
  {
    // The React Compiler is not enabled in this project; this rule only reports that it would
    // skip components whose manual memoisation it cannot prove safe.
    rules: { 'react-hooks/preserve-manual-memoization': 'off' },
  },
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'public/*',
      'supabase/functions/*',
      'coverage/*',
      'node_modules/*',
    ],
  },
]);
