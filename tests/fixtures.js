import { test as base, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const test = base.extend({
  context: async ({}, use) => {
    // Path to the root of the unpacked extension
    const pathToExtension = path.join(__dirname, '..');
    
    // Launch a persistent context with extension flags
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    
    await use(context);
    await context.close();
  },
  
  extensionId: async ({ context }, use) => {
    // Manifest V3 uses service workers. We grab the worker to extract the extension ID.
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    
    // Extract the ID from the service worker URL (chrome-extension://[ID]/background.js)
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
  
  setStorage: async ({ context }, use) => {
    const setExtensionStorage = async (data) => {
      let [serviceWorker] = context.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker');
      }
      // Execute in the service worker context to access the chrome.storage API
      await serviceWorker.evaluate(async (storageData) => {
        await chrome.storage.local.set(storageData);
      }, data);
    };
    await use(setExtensionStorage);
  },
});

export const expect = test.expect;
