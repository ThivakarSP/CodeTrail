// Centralized Storage Utility
// Wraps chrome.storage.local/sync for consistent access and migration logic

// Constants for storage keys
const KEYS = {
  USERNAME: 'codetrail_username',
  REPO: 'codetrail_repo',
  TOKEN: 'codetrail_token',
  ENABLED: 'codetrail_enabled',
  STATS: 'codetrail_stats',
  HISTORY: 'codetrail_history',
  PROBLEM_INDEX: 'codetrail_problem_index',
  MODAL_POS: 'codetrail_modal_pos',
};

// Legacy keys for migration
const LEGACY_KEYS = {
  USERNAME: 'github_username',
  REPO: 'github_repo',
  TOKEN: 'github_token',
  ENABLED: 'extension_enabled',
  // 'codetrail_stats' was used in the checked version, but we might have 'leethub_stats' from even older versions
  STATS_OLD: 'leethub_stats',
  INDEX_OLD: 'leethub_problem_index',
  HISTORY_OLD: 'sync_history',
};

/**
 * Get configuration from storage (with auto-migration)
 * @returns {Promise<Object>}
 */
export async function getConfig() {
  const config = await getStorage([
    KEYS.USERNAME,
    KEYS.REPO,
    KEYS.TOKEN,
    KEYS.ENABLED,
    // Include legacy keys to check for migration
    LEGACY_KEYS.USERNAME,
    LEGACY_KEYS.REPO,
    LEGACY_KEYS.TOKEN,
    LEGACY_KEYS.ENABLED,
  ]);

  // Migration Logic
  let needsSave = false;
  let finalConfig = {
    username: config[KEYS.USERNAME] || '',
    repo: config[KEYS.REPO] || '',
    token: config[KEYS.TOKEN] || '',
    enabled: config[KEYS.ENABLED] !== false,
  };

  // If new keys are empty but old keys exist, migrate
  if (!finalConfig.username && config[LEGACY_KEYS.USERNAME]) {
    finalConfig.username = config[LEGACY_KEYS.USERNAME];
    finalConfig.repo = config[LEGACY_KEYS.REPO] || '';
    finalConfig.token = config[LEGACY_KEYS.TOKEN] || '';
    finalConfig.enabled = config[LEGACY_KEYS.ENABLED] !== false;
    needsSave = true;
  }

  if (needsSave) {
    console.log('CodeTrail: Migrating legacy configuration...');
    await saveConfig(finalConfig);
    // Optionally clear old keys, but keeping them for safety is also fine for now
    await removeStorage([
      LEGACY_KEYS.USERNAME,
      LEGACY_KEYS.REPO,
      LEGACY_KEYS.TOKEN,
      LEGACY_KEYS.ENABLED,
    ]);
  }

  return finalConfig;
}

/**
 * Save configuration to storage
 * @param {Object} config
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const data = {};
  if (config.username !== undefined) data[KEYS.USERNAME] = config.username;
  if (config.repo !== undefined) data[KEYS.REPO] = config.repo;
  if (config.token !== undefined) data[KEYS.TOKEN] = config.token;
  if (config.enabled !== undefined) data[KEYS.ENABLED] = config.enabled;

  await setStorage(data);
}

/**
 * Get stats from storage
 * @returns {Promise<Object>}
 */
export async function getStats() {
  const result = await getStorage([KEYS.STATS, LEGACY_KEYS.STATS_OLD]);

  if (result[KEYS.STATS]) {
    return result[KEYS.STATS];
  }

  // Migration for stats
  if (result[LEGACY_KEYS.STATS_OLD]) {
    const oldStats = result[LEGACY_KEYS.STATS_OLD];
    await saveStats(oldStats);
    await removeStorage([LEGACY_KEYS.STATS_OLD]);
    return oldStats;
  }

  return {
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    lastUpdated: null,
  };
}

/**
 * Update stats in storage
 * @param {Object} stats
 * @returns {Promise<void>}
 */
export async function saveStats(stats) {
  await setStorage({ [KEYS.STATS]: stats });
}

/**
 * Get sync history
 * @returns {Promise<Array>}
 */
export async function getSyncHistory() {
  const result = await getStorage([KEYS.HISTORY, LEGACY_KEYS.HISTORY_OLD]);

  if (result[KEYS.HISTORY]) {
    return result[KEYS.HISTORY];
  }

  // Migrate history
  if (result[LEGACY_KEYS.HISTORY_OLD]) {
    const oldHistory = result[LEGACY_KEYS.HISTORY_OLD];
    await setStorage({ [KEYS.HISTORY]: oldHistory });
    await removeStorage([LEGACY_KEYS.HISTORY_OLD]);
    return oldHistory;
  }

  return [];
}

/**
 * Add an entry to sync history
 * @param {Object} entry
 * @returns {Promise<void>}
 */
export async function addSyncHistoryEntry(entry) {
  const history = await getSyncHistory();

  // Prevent duplicates (check by submissionId if available, else by title + timestamp)
  const isDuplicate = history.some(h =>
    (entry.submissionId && h.submissionId === entry.submissionId) ||
    (h.title === entry.title && Math.abs(h.timestamp - entry.timestamp) < 1000)
  );

  if (isDuplicate) return;

  history.unshift(entry);
  // Removed limit: const trimmed = history.slice(0, 100); 
  await setStorage({ [KEYS.HISTORY]: history });
}

/**
 * Get problem index
 * @returns {Promise<Object>}
 */
export async function getProblemIndex() {
  const result = await getStorage([KEYS.PROBLEM_INDEX, LEGACY_KEYS.INDEX_OLD]);

  if (result[KEYS.PROBLEM_INDEX]) {
    return result[KEYS.PROBLEM_INDEX];
  }

  if (result[LEGACY_KEYS.INDEX_OLD]) {
    const oldIndex = result[LEGACY_KEYS.INDEX_OLD];
    await saveProblemIndex(oldIndex);
    await removeStorage([LEGACY_KEYS.INDEX_OLD]);
    return oldIndex;
  }

  return {};
}

/**
 * Save problem index
 * @param {Object} index
 * @returns {Promise<void>}
 */
export async function saveProblemIndex(index) {
  await setStorage({ [KEYS.PROBLEM_INDEX]: index });
}

/**
 * Reset stats
 * @returns {Promise<void>}
 */
export async function resetStats() {
  const emptyStats = {
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    lastUpdated: null,
  };
  await saveStats(emptyStats);
}

// ==========================================
// Promisified Chrome Storage Wrappers
// ==========================================

/**
 * Calculate analytics (Velocity)
 * @returns {Promise<Object>} { weekly, monthly, yearly }
 */
export async function getAnalytics() {
  const history = await getSyncHistory();
  const now = new Date();

  // Get start of current week (Monday)
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay() || 7; // Get current day number, converting Sun (0) to 7
  if (day !== 1) startOfWeek.setHours(-24 * (day - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  // Start of Month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Start of Year
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Helper to count UNIQUE slugs
  const countUnique = (entries) => {
    const slugs = new Set(entries.map(e => e.folderName || e.title)); // Use folderName as slug standard
    return slugs.size;
  };

  const weeklyEntries = history.filter(h => h.timestamp >= startOfWeek.getTime());
  const monthlyEntries = history.filter(h => h.timestamp >= startOfMonth.getTime());
  const yearlyEntries = history.filter(h => h.timestamp >= startOfYear.getTime());

  return {
    weekly: countUnique(weeklyEntries),
    monthly: countUnique(monthlyEntries),
    yearly: countUnique(yearlyEntries)
  };
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function removeStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}
