import { jest } from '@jest/globals';

// Mock global chrome object
global.chrome = {
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      clear: jest.fn((callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
    },
    session: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: jest.fn(),
      clear: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
  },
  tabs: {
    sendMessage: jest.fn(),
  },
};

// Mock fetch
global.fetch = jest.fn();

// Mock console to keep test output clean
global.console = {
  ...console,
  // log: jest.fn(), // Uncomment to silence logs
  error: jest.fn(),
  warn: jest.fn(),
};
