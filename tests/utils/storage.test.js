import {
  getConfig,
  saveConfig,
  getStats,
  saveStats,
  getSyncHistory,
  addSyncHistoryEntry,
} from '../../utils/storage.js';

// Mock chrome.storage.local
const mockStorage = global.chrome.storage.local;

describe('Storage Utils', () => {
  beforeEach(() => {
    mockStorage.get.mockClear();
    mockStorage.set.mockClear();
  });

  describe('getConfig', () => {
    it('should return default config if storage is empty', async () => {
      mockStorage.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const config = await getConfig();
      expect(config).toEqual({
        username: '',
        repo: '',
        token: '',
        enabled: true,
      });
    });

    it('should return stored config', async () => {
      const storedData = {
        github_username: 'user',
        github_repo: 'repo',
        github_token: 'token',
        extension_enabled: false,
      };
      mockStorage.get.mockImplementation((keys, callback) => {
        callback(storedData);
      });

      const config = await getConfig();
      expect(config).toEqual({
        username: 'user',
        repo: 'repo',
        token: 'token',
        enabled: false,
      });
    });
  });

  describe('saveConfig', () => {
    it('should save config to storage', async () => {
      mockStorage.set.mockImplementation((data, callback) => {
        callback();
      });

      await saveConfig({ username: 'newuser', enabled: true });
      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          github_username: 'newuser',
          extension_enabled: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('getStats', () => {
    it('should return default stats if empty', async () => {
      mockStorage.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const stats = await getStats();
      expect(stats).toEqual({
        total: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        lastUpdated: null,
      });
    });
  });
});
