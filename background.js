import { pushToGitHub, checkFileExists, testConnection } from './utils/github.js';
import {
  getConfig,
  getStats,
  saveStats,
  getSyncHistory,
  addSyncHistoryEntry,
  resetStats as resetStatsStorage,
  getProblemIndex,
} from './utils/storage.js';
import { fetchSolvedQuestions, fetchSubmissionDetails } from './utils/leetcode.js';
import { generateReadme } from './utils/readme.js';

const ALARM_NAME = 'process_submission_queue';
const QUEUE_KEY = 'codetrail_submission_queue';
const BULK_ALARM_NAME = 'process_bulk_queue';
const BULK_QUEUE_KEY = 'codetrail_bulk_queue';
const PROCESS_SUBMISSION_NEXT_ALARM = 'process_submission_queue_next';
const PROCESS_BULK_NEXT_ALARM = 'process_bulk_queue_next';

// ============================================================
// INITIALIZATION
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('CodeTrail: Extension installed/updated.');
  // Ensure alarms exist
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    }
  });

  chrome.alarms.get(BULK_ALARM_NAME, (alarm) => {
    if (!alarm) {
      // Process bulk queue every 1 minute (to be safe with LeetCode API)
      // We can also trigger it manually for faster processing
      chrome.alarms.create(BULK_ALARM_NAME, { periodInMinutes: 1 });
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME || alarm.name === PROCESS_SUBMISSION_NEXT_ALARM) {
    processSubmissionQueue();
  }
  if (alarm.name === BULK_ALARM_NAME || alarm.name === PROCESS_BULK_NEXT_ALARM) {
    processBulkQueue();
  }
});

// Track Window Position

// ============================================================
// MESSAGE HANDLERS
// ============================================================

let syncWindowId = null;

chrome.windows.onBoundsChanged.addListener(async (win) => {
  if (win.id === syncWindowId) {
    await chrome.storage.local.set({
      sync_window_bounds: {
        left: win.left,
        top: win.top,
        width: win.width,
        height: win.height,
      },
    });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === syncWindowId) {
    syncWindowId = null;
  }
});

// ============================================================
// MESSAGE HANDLERS
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (message.type) {
        case 'OPEN_SYNC_WINDOW': {
          // Save data first
          await chrome.storage.local.set({ pending_sync_data: message.data });

          // Get saved bounds
          const { sync_window_bounds } = await chrome.storage.local.get('sync_window_bounds');

          const createOptions = {
            url: 'sync_window.html',
            type: 'popup',
            focused: true,
          };

          if (sync_window_bounds) {
            createOptions.left = sync_window_bounds.left;
            createOptions.top = sync_window_bounds.top;
            createOptions.width = sync_window_bounds.width;
            createOptions.height = sync_window_bounds.height;
          } else {
            createOptions.width = 500;
            createOptions.height = 600;
          }

          // Open window
          const win = await chrome.windows.create(createOptions);
          syncWindowId = win.id;
          return { success: true };
        }

        case 'CONFIRM_SYNC': {
          // Received enriched data from sync window
          // We need to generate the final README here since we moved logic out of content.js
          // Or we can rely on a helper.
          // Let's attach the README generation logic here or import it.
          // Since we can't easily import `generateReadmeWithRefs` from content.js (it's isolated),
          // we should have moved it to a shared utils file.
          // For now, I'll implement a simple reconstruct here or rely on the data passed.

          const data = message.data;

          // Reconstruct README using the data we have
          // We need `generateReadmeWithRefs` logic.
          // Since I cannot modify `utils/github.js` easily to include DOM parser dependent logic (Node vs Browser),
          // I will implement a text-based generator here or import a new utility.
          // Actually, `content.js` passed `readmeDescription` (markdown formatted).
          // So we can build the README string here easily!

          const readmeContent = generateReadme(data);
          data.readme = readmeContent;

          // Ensure timestamp is normalized (ms)
          if (data.timestamp && data.timestamp < 10000000000) {
            data.timestamp = data.timestamp * 1000;
          } else if (!data.timestamp) {
            data.timestamp = Date.now();
          }

          const syncResult = await handleSyncSubmission(data);
          if (syncResult && syncResult.action === 'Created') {
            await updateStats(data.difficulty);
          }
          return { success: true };
        }

        case 'SUBMISSION_DETECTED':
          await handleSubmissionDetected(message.data, sender.tab?.id);
          return { success: true };

        case 'INIT_BULK_SYNC':
          return await startBulkSync();

        case 'GET_CONFIG':
          return await getConfig();

        case 'TEST_CONNECTION':
          return await testConnection(message.config);

        case 'GET_SYNC_HISTORY':
          return await getSyncHistory();

        case 'GET_STATS':
          return await getStats();

        case 'RESET_STATS':
          await resetStatsStorage();
          return { success: true };

        default:
          return { success: false, error: 'Unknown message type' };
      }
    } catch (error) {
      console.error('CodeTrail: Message handler error:', error);
      return { success: false, error: error.message };
    }
  };

  handleAsync()
    .then(sendResponse)
    .catch((error) => {
      console.error('CodeTrail: Async handler failed:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // Keep channel open for async response
});

// ============================================================
// BULK SYNC MANAGEMENT
// ============================================================

async function getBulkQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get([BULK_QUEUE_KEY], (result) => {
      resolve(result[BULK_QUEUE_KEY] || []);
    });
  });
}

async function saveBulkQueue(queue) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [BULK_QUEUE_KEY]: queue }, resolve);
  });
}

async function startBulkSync() {
  const config = await getConfig();
  if (!config.username) throw new Error('GitHub not configured');

  // 1. Fetch all solved questions from LeetCode
  // We need the LeetCode username. Usually this is inferred from the session.
  // Let's hope the user is logged in.

  try {
    const solvedQuestions = await fetchSolvedQuestions();
    console.log(`CodeTrail: Found ${solvedQuestions.length} solved questions.`);

    // 2. Filter out already synced questions
    const problemIndex = await getProblemIndex();
    const existingSlugs = new Set(
      Object.values(problemIndex).map((p) => p.folderName.replace(/^\d+-/, ''))
    );
    // Note: heuristics for slug matching might be imperfect if folder naming changed.
    // Better: Use `titleSlug` if we stored it? We didn't explicitly store titleSlug in index.
    // Fallback: Check if `folderName` contains the slug.

    const newQuestions = solvedQuestions.filter((q) => {
      // q.titleSlug e.g. "two-sum"
      // index check: "0001-two-sum" includes "two-sum"

      // Precise check: iterate index
      // Performance: O(N*M) but N is small (< 3000).
      for (const key in problemIndex) {
        if (key.includes(q.titleSlug)) return false;
      }
      return true;
    });

    console.log(`CodeTrail: ${newQuestions.length} new questions to sync.`);

    if (newQuestions.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'All problems needed syncing are already synced!',
      };
    }

    // 3. Add to Bulk Queue
    const queue = await getBulkQueue();

    // Avoid duplicates in the queue itself
    const existingQueueSlugs = new Set(queue.map((q) => q.titleSlug));

    let addedCount = 0;
    newQuestions.forEach((q) => {
      if (!existingQueueSlugs.has(q.titleSlug)) {
        queue.push(q);
        addedCount++;
      }
    });

    await saveBulkQueue(queue);

    // Trigger processing
    processBulkQueue();

    return {
      success: true,
      count: addedCount,
      message: `Added ${addedCount} problems to sync queue.`,
    };
  } catch (error) {
    console.error('Bulk Sync Init Failed', error);
    throw error;
  }
}

async function processBulkQueue() {
  if (await isProcessingActive('bulk')) return;
  await setProcessingState('bulk', true);

  try {
    const queue = await getBulkQueue();
    if (queue.length === 0) {
      return;
    }

    // Process 1 item
    const question = queue[0];
    console.log(`CodeTrail: Bulk processing ${question.titleSlug}...`);

    try {
      const submissionData = await fetchSubmissionDetails(question.titleSlug);

      if (submissionData) {
        // Add to main Sync Queue
        await handleSubmissionDetected(submissionData, null); // null tabId (background)
        console.log(`CodeTrail: Moved ${question.titleSlug} to main sync queue.`);

        // Remove from bulk queue
        queue.shift();
        await saveBulkQueue(queue);
      } else {
        console.warn(
          `CodeTrail: No accepted submission found for ${question.titleSlug}, skipping.`
        );
        // Remove anyway to avoid stuck queue
        queue.shift();
        await saveBulkQueue(queue);
      }
    } catch (error) {
      console.error(`CodeTrail: Error fetching details for ${question.titleSlug}`, error);
      // On error, maybe retry later? For now, skip to prevent blocking.
      queue.shift();
      await saveBulkQueue(queue);
    }
  } finally {
    await setProcessingState('bulk', false);

    // Continue if more items
    const queue = await getBulkQueue();
    if (queue.length > 0) {
      // Delay to respect LeetCode API (e.g., 5 seconds between fetches)
      chrome.alarms.create(PROCESS_BULK_NEXT_ALARM, { delayInMinutes: 0.1 });
    }
  }
}

// ============================================================
// SUBMISSION QUEUE MANAGEMENT
// ============================================================

async function getQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get([QUEUE_KEY], (result) => {
      resolve(result[QUEUE_KEY] || []);
    });
  });
}

async function saveQueue(queue) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [QUEUE_KEY]: queue }, resolve);
  });
}

async function handleSubmissionDetected(data, tabId) {
  const config = await getConfig();

  if (!config.enabled) return;

  // Auto-generate README if missing (e.g. from Bulk Sync)
  if (!data.readme) {
    data.readme = generateReadme(data);
  }

  const queue = await getQueue();

  // Prevent duplicates in queue based on submissionId or folderName
  const isDuplicate = queue.some(
    (item) =>
      (item.submissionId && item.submissionId === data.submissionId) ||
      item.folderName === data.folderName
  );

  if (isDuplicate) {
    console.log('CodeTrail: Duplicate submission in queue, skipping.');
    return;
  }

  queue.push({
    ...data,
    tabId, // Note: tabId might be invalid if tab closes, handle gracefully in sendSyncStatus
    timestamp: data.timestamp || Date.now(),
    retryCount: 0,
  });

  await saveQueue(queue);

  // Trigger immediate processing
  processSubmissionQueue();
}

// ============================================================
// QUEUE PROCESSING
// ============================================================

// Helper to manage processing state atomically
async function setProcessingState(queueName, isActive) {
  await chrome.storage.session.set({ [queueName + '_processing']: isActive });
}

async function isProcessingActive(queueName) {
  const result = await chrome.storage.session.get([queueName + '_processing']);
  return !!result[queueName + '_processing'];
}

async function processSubmissionQueue() {
  if (await isProcessingActive('submission')) return;
  await setProcessingState('submission', true);

  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      return;
    }

    const item = queue[0]; // Peek

    // Valid item
    const total = queue.length + 1; // Approx total including current

    // Report progress
    chrome.runtime
      .sendMessage({
        type: 'BULK_SYNC_PROGRESS',
        processed: total - queue.length,
        total: total,
        current: item.titleSlug,
      })
      .catch(() => {});

    // Notify "syncing"
    await sendSyncStatus(item.tabId, 'syncing', `Syncing "${item.title}"...`);

    try {
      const syncResult = await handleSyncSubmission(item);

      // Success
      if (syncResult && syncResult.action === 'Created') {
        await updateStats(item.difficulty);
      }
      await sendSyncStatus(item.tabId, 'success', 'Synced to GitHub');

      // Remove from queue
      queue.shift();
      await saveQueue(queue);
    } catch (error) {
      console.error('CodeTrail: Sync failed for item:', item.title, error);

      // Check for fatal errors that shouldn't be retried
      const isFatal =
        error.message.includes('Invalid token') ||
        error.message.includes('not found') ||
        error.message.includes('Bad credentials');

      if (!isFatal && item.retryCount < 3) {
        item.retryCount++;
        queue[0] = item;
        await saveQueue(queue);

        await sendSyncStatus(item.tabId, 'error', `Sync failed: ${error.message}. Retrying...`);
      } else {
        // Max retries reached or fatal error
        const finalMsg = isFatal
          ? `Sync failed: ${error.message} (Check Settings)`
          : `Sync failed permanently: ${error.message}`;
        await sendSyncStatus(item.tabId, 'error', finalMsg);
        queue.shift(); // Remove
        await saveQueue(queue);
      }
    }
  } catch (error) {
    console.error('CodeTrail: Queue processing fatal error:', error);
  } finally {
    await setProcessingState('submission', false);

    // If more items, trigger again (or wait for alarm)
    const queue = await getQueue();
    if (queue.length > 0) {
      // Small delay to prevent rate limits
      chrome.alarms.create(PROCESS_SUBMISSION_NEXT_ALARM, { delayInMinutes: 0.05 });
    }
  }
}

/**
 * Send sync status to content script
 */
async function sendSyncStatus(tabId, status, message) {
  const payload = {
    type: 'SYNC_STATUS',
    status,
    message,
  };

  // 1. Notify the Popup Window (Runtime)
  try {
    await chrome.runtime.sendMessage(payload);
  } catch (e) {
    // Popup might be closed, ignore
  }

  // 2. Notify the Content Script (Tab)
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    // Tab might be closed or not accessible, harmless
    // console.log('CodeTrail: Could not send sync status (tab closed?):', error.message);
  }
}

// ============================================================
// SYNC LOGIC
// ============================================================

async function handleSyncSubmission(data) {
  const config = await getConfig();

  if (!config.token || !config.username || !config.repo) {
    throw new Error('GitHub not configured');
  }

  const problemIndex = await getProblemIndex();
  const existsLocally = !!problemIndex[data.folderName];
  const existsOnGitHub = await checkFileExists(config, data.folderName);
  
  const exists = existsLocally || existsOnGitHub;
  const action = exists ? 'Updated' : 'Created';

  await pushToGitHub(config, data);

  await addSyncHistoryEntry({
    title: data.title,
    number: data.number,
    difficulty: data.difficulty,
    language: data.language,
    url: data.url,
    folderName: data.folderName,
    timestamp: data.timestamp || Date.now(),
    action: action,
    runtime: data.runtime,
    memory: data.memory,
    submissionId: data.submissionId,
  });

  return { action };
}

// ============================================================
// STATS TRACKING
// ============================================================

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

  await saveStats(stats);
  return stats;
}

// ============================================================
// WEBNAV LISTENER
// ============================================================

console.log('CodeTrail: Background service worker started (v2.0.0)');

// Keep-Alive Mechanism
chrome.runtime.onStartup.addListener(() => {
  // Ensure alarms are set
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  });
  chrome.alarms.get(BULK_ALARM_NAME, (alarm) => {
    if (!alarm) chrome.alarms.create(BULK_ALARM_NAME, { periodInMinutes: 1 });
  });
});
