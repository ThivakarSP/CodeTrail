import { sanitizeYoutubeUrl, sanitizeMarkdown } from '../../utils/sanitize.js';

describe('Sanitize Utils', () => {
  describe('sanitizeYoutubeUrl', () => {
    test('returns clean URL for valid youtube.com links', () => {
      expect(sanitizeYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    test('returns clean URL for valid youtu.be links', () => {
      expect(sanitizeYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'https://youtu.be/dQw4w9WgXcQ'
      );
    });

    test('returns clean URL for valid mobile links', () => {
      expect(sanitizeYoutubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    test('returns null for non-youtube links', () => {
      expect(sanitizeYoutubeUrl('https://google.com')).toBeNull();
      expect(sanitizeYoutubeUrl('https://vimeo.com/12345')).toBeNull();
    });

    test('returns null for invalid protocols (http)', () => {
      expect(sanitizeYoutubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });

    test('returns null for empty/null input', () => {
      expect(sanitizeYoutubeUrl('')).toBeNull();
      expect(sanitizeYoutubeUrl(null)).toBeNull();
      expect(sanitizeYoutubeUrl(undefined)).toBeNull();
    });

    test('encodes parentheses in valid URLs', () => {
      expect(sanitizeYoutubeUrl('https://www.youtube.com/watch?v=abc(123)')).toBe(
        'https://www.youtube.com/watch?v=abc%28123%29'
      );
    });
  });

  describe('sanitizeMarkdown', () => {
    test('escapes markdown special characters', () => {
      expect(sanitizeMarkdown('[link]')).toBe('\\[link\\]');
      expect(sanitizeMarkdown('(parentheses)')).toBe('\\(parentheses\\)');
      expect(sanitizeMarkdown('normal text')).toBe('normal text');
    });

    test('handles empty/null input', () => {
      expect(sanitizeMarkdown('')).toBe('');
      expect(sanitizeMarkdown(null)).toBe('');
      expect(sanitizeMarkdown(undefined)).toBe('');
    });

    test('treats non-string input as empty', () => {
      expect(sanitizeMarkdown(123)).toBe('');
      expect(sanitizeMarkdown({})).toBe('');
    });
  });
});
