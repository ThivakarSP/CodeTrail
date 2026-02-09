// LeetHub Background Service Worker
// Handles message passing, notifications, GitHub sync, and stats tracking
// Enhanced with stats persistence and sync status messaging

import { pushToGitHub, checkFileExists, testConnection } from './utils/github.js';

// Cache for pending submissions to handle notification clicks
const pendingSubmissions = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes TTL

// Submission queue to prevent race conditions
const submissionQueue = [];
let isProcessingQueue = false;

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [notificationId, data] of pendingSubmissions.entries()) {
    if (data.timestamp && (now - data.timestamp > CACHE_TTL_MS)) {
      pendingSubmissions.delete(notificationId);
      chrome.notifications.clear(notificationId).catch(() => { });
    }
  }
}, 60000);

// ============================================================
// MESSAGE HANDLERS
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (message.type) {
        case 'SUBMISSION_DETECTED':
          await handleSubmissionDetected(message.data, sender.tab?.id);
          return { success: true };

        case 'GET_CONFIG':
          return await getConfig();

        case 'TEST_CONNECTION':
          return await testConnection(message.config);

        case 'GET_SYNC_HISTORY':
          return await getSyncHistory();

        case 'GET_STATS':
          return await getStats();

        case 'RESET_STATS':
          return await resetStats();

        default:
          return { success: false, error: 'Unknown message type' };
      }
    } catch (error) {
      console.error('LeetHub: Message handler error:', error);
      return { success: false, error: error.message };
    }
  };

  handleAsync()
    .then(sendResponse)
    .catch(error => {
      console.error('LeetHub: Async handler failed:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true;
});

// ============================================================
// SUBMISSION DETECTION & NOTIFICATION
// ============================================================

async function handleSubmissionDetected(data, tabId) {
  const config = await getConfig();

  if (!config.enabled) return;

  // Since the modal already confirmed the sync, directly queue for processing
  // No notification needed - modal handles user confirmation
  submissionQueue.push({
    ...data,
    tabId,
    timestamp: Date.now()
  });

  processSubmissionQueue();
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const submissionData = pendingSubmissions.get(notificationId);

  if (submissionData) {
    if (buttonIndex === 0) { // Sync
      submissionQueue.push(submissionData);
      processSubmissionQueue();
    }

    pendingSubmissions.delete(notificationId);
    chrome.notifications.clear(notificationId).catch(() => { });
  }
});

// Handle notification closed
chrome.notifications.onClosed.addListener((notificationId) => {
  if (pendingSubmissions.has(notificationId)) {
    pendingSubmissions.delete(notificationId);
  }
});

// ============================================================
// SUBMISSION QUEUE PROCESSING
// ============================================================

async function processSubmissionQueue() {
  if (isProcessingQueue || submissionQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (submissionQueue.length > 0) {
    const data = submissionQueue.shift();

    try {
      // Notify content script that sync started
      await sendSyncStatus(data.tabId, 'syncing', `Syncing "${data.title}"...`);

      await handleSyncSubmission(data);

      // Update stats
      await updateStats(data.difficulty);

      // Success notification
      await chrome.notifications.create(`leethub-success-${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'LeetHub: Synced!',
        message: `Successfully pushed "${data.title}" to GitHub.`,
        priority: 1
      });

      // Notify content script of success
      await sendSyncStatus(data.tabId, 'success', '✓ Synced to GitHub');

      // Rate limiting delay
      if (submissionQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('LeetHub: Sync failed:', error);

      // Error notification
      await chrome.notifications.create(`leethub-error-${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'LeetHub: Sync Failed',
        message: error.message || 'Unknown error occurred.',
        priority: 2
      });

      // Notify content script of error
      await sendSyncStatus(data.tabId, 'error', `✗ ${error.message || 'Sync failed'}`);
    }
  }

  isProcessingQueue = false;
}

/**
 * Send sync status to content script
 */
async function sendSyncStatus(tabId, status, message) {
  if (!tabId) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SYNC_STATUS',
      status,
      message
    });
  } catch (error) {
    // Tab might be closed or not accessible
    console.log('LeetHub: Could not send sync status to tab:', error.message);
  }
}

// ============================================================
// SYNC LOGIC
// ============================================================

async function handleSyncSubmission(data) {
  const config = await getConfig();

  if (!config.token || !config.username || !config.repo) {
    throw new Error('GitHub not configured. Please check extension settings.');
  }

  try {
    const exists = await checkFileExists(config, data.folderName);
    const action = exists ? 'Updated' : 'Created';

    await pushToGitHub(config, data);

    await saveSyncHistory({
      title: data.title,
      number: data.number,
      difficulty: data.difficulty,
      language: data.language,
      url: data.url,
      folderName: data.folderName,
      timestamp: Date.now(),
      action: action,
      runtime: data.runtime,
      memory: data.memory
    });

  } catch (error) {
    console.error('GitHub push failed:', error);
    throw error;
  }
}

// ============================================================
// STATS TRACKING
// ============================================================

/**
 * Get current stats
 */
async function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['leethub_stats'], (result) => {
      resolve(result.leethub_stats || {
        total: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        lastUpdated: null
      });
    });
  });
}

/**
 * Update stats after successful sync
 */
async function updateStats(difficulty) {
  const stats = await getStats();

  stats.total++;
  stats.lastUpdated = Date.now();

  switch (difficulty?.toLowerCase()) {
    case 'easy':
      stats.easy++;
      break;
    case 'medium':
      stats.medium++;
      break;
    case 'hard':
      stats.hard++;
      break;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ leethub_stats: stats }, () => {
      console.log('LeetHub: Stats updated:', stats);
      resolve(stats);
    });
  });
}

/**
 * Reset stats
 */
async function resetStats() {
  const emptyStats = {
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    lastUpdated: null
  };

  return new Promise((resolve) => {
    chrome.storage.local.set({ leethub_stats: emptyStats }, () => {
      console.log('LeetHub: Stats reset');
      resolve({ success: true });
    });
  });
}

// ============================================================
// CONFIGURATION
// ============================================================

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['github_username', 'github_repo', 'github_token', 'extension_enabled'], (result) => {
      resolve({
        username: result.github_username || '',
        repo: result.github_repo || '',
        token: result.github_token || '',
        enabled: result.extension_enabled !== false
      });
    });
  });
}

// ============================================================
// SYNC HISTORY
// ============================================================

async function getSyncHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sync_history'], (result) => {
      resolve(result.sync_history || []);
    });
  });
}

async function saveSyncHistory(entry) {
  const history = await getSyncHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 100); // Keep last 100 entries
  return new Promise((resolve) => {
    chrome.storage.local.set({ sync_history: trimmed }, resolve);
  });
}

// ============================================================
// WEBNAV LISTENER FOR SUBMISSION TRACKING
// ============================================================

// Listen for navigation to submission result pages
chrome.webNavigation?.onHistoryStateUpdated.addListener(
  (details) => {
    const match = details.url.match(/\/problems\/[\w-]+\/submissions\/(\d+)/);
    if (match) {
      console.log('LeetHub: Detected submission navigation:', match[1]);
      // The content script will handle fetching details via GraphQL
    }
  },
  { url: [{ hostSuffix: 'leetcode.com' }] }
);

console.log('LeetHub service worker initialized (v5 - Stats & Sync Status)');
