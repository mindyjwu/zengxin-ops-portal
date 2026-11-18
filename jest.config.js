module.exports = {
  testEnvironment: 'node',
  // 真正的 PostgreSQL 要建臨時資料庫，CI 機器磁碟慢時會超過預設 5 秒，所以只在真資料庫模式放寬
  testTimeout: process.env.TEST_PG_ADMIN_URL ? 60000 : 5000,
  testMatch: ['**/__tests__/**/*.test.js', '!**/__tests__/**/*.e2e.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!.github/**',
  ],
};
