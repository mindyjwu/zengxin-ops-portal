module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '!**/__tests__/**/*.e2e.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!.github/**',
  ],
};
