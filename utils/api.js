/**
 * GitHub API Wrapper with Rate Limiting and Retries
 * Handles 403/429 limits and network errors robustly
 */

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Validated GitHub Fetch with Retry Logic
 * @param {string} url - Full URL
 * @param {Object} options - Fetch options
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Response>}
 */
export async function githubFetch(url, options = {}, retryCount = 0) {
  options.headers = {
    'User-Agent': 'CodeTrail-Extension',
    ...options.headers,
  };

  try {
    const response = await fetch(url, options);

    // Rate Limit Handling (403 or 429)
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const resetTime = response.headers.get('x-ratelimit-reset');

      // If we have no retries left, throw error
      if (retryCount >= MAX_RETRIES) {
        throw new ApiError('Rate limit exceeded and max retries reached', response.status);
      }

      let waitTime = INITIAL_BACKOFF * Math.pow(2, retryCount);

      // If we hit a hard limit, respect the reset time if it's reasonable
      if (remaining === '0' && resetTime) {
        const resetDate = new Date(parseInt(resetTime) * 1000);
        const now = new Date();
        const diff = resetDate.getTime() - now.getTime();

        // If wait is too long (> 1 minute), might be better to just fail
        if (diff > 60000) {
          throw new ApiError(
            `Rate limit exceeded. Reset at ${resetDate.toLocaleTimeString()}`,
            response.status
          );
        }

        if (diff > 0) waitTime = diff + 1000; // Add 1s buffer
      }

      console.warn(
        `CodeTrail: Rate limit hit. Waiting ${waitTime}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      return githubFetch(url, options, retryCount + 1);
    }

    // Server Errors (5xx) - Retryable
    if (response.status >= 500 && response.status < 600) {
      if (retryCount < MAX_RETRIES) {
        const waitTime = INITIAL_BACKOFF * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return githubFetch(url, options, retryCount + 1);
      }
    }

    // 401 Unauthorized - Handled by caller (like testConnection)
    // if (response.status === 401) {
    //   throw new ApiError('Invalid GitHub Token. Please check your settings.', 401);
    // }

    return response;
  } catch (error) {
    // Network errors are retryable
    if (error instanceof ApiError) throw error;

    if (retryCount < MAX_RETRIES) {
      const waitTime = INITIAL_BACKOFF * Math.pow(2, retryCount);
      console.warn(`CodeTrail: Network error. Retrying...`, error);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return githubFetch(url, options, retryCount + 1);
    }
    throw error;
  }
}
