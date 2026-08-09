import {
  saveConfig,
  getConfig,
  saveStats,
  getStats,
  resetStats,
  getSyncHistory,
  addSyncHistoryEntry,
  getAnalytics,
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
      // Verification of migration save (optional but good)
      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          codetrail_username: 'user',
          codetrail_repo: 'repo',
          codetrail_token: 'token',
          codetrail_enabled: false,
        }),
        expect.any(Function)
      );
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
          codetrail_username: 'newuser',
          codetrail_enabled: true,
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

  describe('getAnalytics', () => {
    test('calculates correct counts', async () => {
      const now = new Date();

      // Calculate boundaries exactly like implementation
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay() || 7;
      if (day !== 1) startOfWeek.setHours(-24 * (day - 1));
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const history = [
        { title: 'p1', titleSlug: 'p1', timestamp: now.getTime() },
        { title: 'p2', titleSlug: 'p2', timestamp: startOfWeek.getTime() + 1000 },
        { title: 'p3', titleSlug: 'p3', timestamp: startOfWeek.getTime() - 1000 },
        { title: 'p4', titleSlug: 'p4', timestamp: startOfMonth.getTime() + 1000 },
        { title: 'p1', titleSlug: 'p1', timestamp: now.getTime() - 100 },
      ];

      mockStorage.get.mockImplementation((keys, callback) => {
        callback({ codetrail_history: history });
      });

      const analytics = await getAnalytics();

      const expectedWeekly = new Set(
        history.filter((h) => h.timestamp >= startOfWeek.getTime()).map((h) => h.titleSlug)
      ).size;
      const expectedMonthly = new Set(
        history.filter((h) => h.timestamp >= startOfMonth.getTime()).map((h) => h.titleSlug)
      ).size;
      const expectedYearly = new Set(
        history.filter((h) => h.timestamp >= startOfYear.getTime()).map((h) => h.titleSlug)
      ).size;

      expect(analytics.weekly).toBe(expectedWeekly);
      expect(analytics.monthly).toBe(expectedMonthly);
      expect(analytics.yearly).toBe(expectedYearly);
      expect(analytics.weekly).toBeGreaterThanOrEqual(1);
    });
  });

  describe('addSyncHistoryEntry', () => {
    test('prevents duplicate processing (if implemented) and caps limit', async () => {
      // Mock existing history
      const existing = Array(500)
        .fill()
        .map((_, i) => ({
          submissionId: `old-${i}`,
          title: `Old ${i}`,
          timestamp: Date.now() - 1000 * i,
        }));

      mockStorage.get.mockImplementation((keys, callback) => {
        callback({ codetrail_history: existing });
      });

      const newEntry = { submissionId: 'new-1', title: 'New Problem', timestamp: Date.now() };
      await addSyncHistoryEntry(newEntry);

      const setCall = mockStorage.set.mock.calls[0][0];
      const newHistory = setCall.codetrail_history;

      expect(newHistory.length).toBe(500); // capped
      expect(newHistory[0]).toEqual(newEntry); // newest first
      expect(newHistory[500]).toBeUndefined(); // old one dropped
    });
  });
});
