export default {
  transform: {}, // Disable transformation for ESM
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./setupTests.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Handle .js extensions in imports
  },
  testMatch: ['**/tests/**/*.test.js'],
};
