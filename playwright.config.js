import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: 'tests/e2e/*.spec.js', // Run all tests in the e2e directory
  use: {
    headless: false, // Extensions only load in headful mode
  },
});
