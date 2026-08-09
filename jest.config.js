export default {
  transform: {}, // Disable transformation for ESM
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./setupTests.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Handle .js extensions in imports
  },
  moduleFileExtensions: ['js', 'json', 'node'], // Added moduleFileExtensions
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: ['background.js', 'content.js', 'utils/**/*.js', '!utils/constants.js'],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
};
