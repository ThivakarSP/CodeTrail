import { pushToGitHub, checkFileExists, testConnection } from '../../utils/github.js';

// Mock fetch
const mockFetch = global.fetch;

describe('GitHub Utils', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const mockConfig = {
    username: 'testuser',
    repo: 'testrepo',
    token: 'ghp_testtoken',
  };

  describe('testConnection', () => {
    it('should return success on valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ default_branch: 'main' }),
      });

      const result = await testConnection(mockConfig);
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/testrepo',
        expect.any(Object)
      );
    });

    it('should return error on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
      });

      const result = await testConnection(mockConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('should return error on 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const result = await testConnection(mockConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Repository "testuser/testrepo" not found');
    });
  });

  describe('checkFileExists', () => {
    it('should return true if file exists (200 OK)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

      const exists = await checkFileExists(mockConfig, 'Two-Sum');
      expect(exists).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/testrepo/contents/Two-Sum',
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should return false if file does not exist (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404, // fetch throws on network error, returns response on 404
        ok: false,
      });

      const exists = await checkFileExists(mockConfig, 'Non-Existent');
      expect(exists).toBe(false);
    });
  });

  // Note: Testing pushToGitHub requires mocking the entire chain of Git Data API calls
  // (getRef, getCommit, getTree, createBlob, createTree, createCommit, updateRef)
  // For brevity in this initial setup, we are testing the easier functions first.
  // A comprehensive test would mock all these sequential fetch calls.
});
