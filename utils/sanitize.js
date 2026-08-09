/**
 * Input Sanitization Utility
 * prevent injection and ensure valid URLs
 */

/**
 * Validates and sanitizes a YouTube URL
 * @param {string} url - User provided URL
 * @returns {string|null} Sanitized URL or null if invalid
 */
export function sanitizeYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  // Basic format check
  // Must start with https://
  if (!trimmed.startsWith('https://')) return null;

  try {
    const parsed = new URL(trimmed);

    // Allowed hostnames
    const allowedHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];
    if (!allowedHosts.includes(parsed.hostname)) return null;

    // Malicious character check (e.g. trying to break out of markdown link parens)
    if (trimmed.includes('(') || trimmed.includes(')')) {
      // We can encode them to be safe
      return trimmed.replace(/\(/g, '%28').replace(/\)/g, '%29');
    }

    return trimmed;
  } catch (e) {
    return null;
  }
}

/**
 * Escapes characters that could break Markdown structure
 * @param {string} text
 * @returns {string}
 */
export function sanitizeMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  // Escape brackets and parentheses to prevent link injection
  return text
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
