// CodeTrail Options Page Script
// Handles configuration and connection testing using centralized storage

import { getConfig, saveConfig, resetStats } from './utils/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const usernameInput = document.getElementById('username');
  const repoInput = document.getElementById('repo');
  const tokenInput = document.getElementById('token');
  const toggleTokenBtn = document.getElementById('toggleToken');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusMessage = document.getElementById('statusMessage');
  const groqApiKeyInput = document.getElementById('groqApiKey');
  const toggleGroqKeyBtn = document.getElementById('toggleGroqKey');
  const testGroqBtn = document.getElementById('testGroqBtn');
  const groqStatus = document.getElementById('groqStatus');

  // Load saved settings
  await loadSettings();

  // Toggle token visibility
  toggleTokenBtn?.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      toggleTokenBtn.textContent = 'Hide';
    } else {
      tokenInput.type = 'password';
      toggleTokenBtn.textContent = 'Show';
    }
  });

  // Toggle Groq Key visibility
  toggleGroqKeyBtn?.addEventListener('click', () => {
    if (groqApiKeyInput.type === 'password') {
      groqApiKeyInput.type = 'text';
      toggleGroqKeyBtn.textContent = 'Hide';
    } else {
      groqApiKeyInput.type = 'password';
      toggleGroqKeyBtn.textContent = 'Show';
    }
  });

  // Auto-save Groq API Key on change/blur
  groqApiKeyInput?.addEventListener('change', async () => {
    const groqApiKey = groqApiKeyInput.value.trim();
    const config = await getConfig();
    await saveConfig({ ...config, groqApiKey });
    showStatus('API Key saved!', 'success');
  });

  // Test Groq API Key
  testGroqBtn?.addEventListener('click', async () => {
    const groqApiKey = groqApiKeyInput.value.trim();
    if (!groqApiKey) {
      groqStatus.textContent = 'Please enter an API key first.';
      groqStatus.style.color = 'var(--error)';
      return;
    }
    
    testGroqBtn.disabled = true;
    groqStatus.textContent = 'Testing...';
    groqStatus.style.color = 'var(--text-secondary)';

    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
        }
      });
      
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        groqStatus.textContent = '✅ API Key is valid!';
        groqStatus.style.color = 'var(--success)';
      } else {
        groqStatus.textContent = `❌ Error ${response.status}: ${data.error?.message || 'Invalid request'}`;
        groqStatus.style.color = 'var(--error)';
      }
    } catch (err) {
      groqStatus.textContent = `❌ Network Error: ${err.message}`;
      groqStatus.style.color = 'var(--error)';
    } finally {
      testGroqBtn.disabled = false;
    }
  });

  // Save settings
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  // Test connection
  testBtn?.addEventListener('click', async () => {
    await handleTestConnection();
  });

  // Clear all data
  clearBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all CodeTrail data? This cannot be undone.')) {
      await clearAllData();
    }
  });

  // Load settings from storage
  async function loadSettings() {
    const config = await getConfig();
    if (config.username) usernameInput.value = config.username;
    if (config.repo) repoInput.value = config.repo;
    if (config.token) tokenInput.value = config.token;
    if (config.groqApiKey) groqApiKeyInput.value = config.groqApiKey;
  }

  // Save settings to storage
  async function saveSettings() {
    const username = usernameInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();
    const groqApiKey = groqApiKeyInput.value.trim();

    if (!username || !repo || !token) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    // Validate username/repo format
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      showStatus('Username can only contain letters, numbers, hyphens, and underscores', 'error');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(repo)) {
      showStatus('Repository name contains invalid characters', 'error');
      return;
    }

    // Validate token format (basic check)
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      // Just a warning, don't block
      showStatus('Token usually starts with "ghp_" or "github_pat_"', 'warning');
    }

    // Show loading state
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await saveConfig({
        username,
        repo,
        token,
        groqApiKey,
      });

      showStatus('Settings saved successfully!', 'success');

      // Auto-test connection after save
      await handleTestConnection();
    } catch (error) {
      showStatus(`Failed to save: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  }

  // Test GitHub connection
  async function handleTestConnection() {
    const username = usernameInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();

    if (!username || !repo || !token) {
      showStatus('Please fill in all fields first', 'error');
      return;
    }

    showStatus('Testing connection...', 'info');
    testBtn.disabled = true;
    const originalText = testBtn.textContent;
    testBtn.textContent = 'Testing...';

    try {
      // equivalent to messaging background but faster/direct
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        config: { username, repo, token },
      });

      if (response.success) {
        showStatus('Connection successful! Ready to sync.', 'success');
      } else {
        showStatus(`${response.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  }

  // Bulk Sync Handler
  const bulkSyncBtn = document.getElementById('bulkSyncBtn');
  const bulkStatus = document.getElementById('bulkStatus');
  const bulkStatusText = document.getElementById('bulkStatusText');

  bulkSyncBtn?.addEventListener('click', async () => {
    if (
      !confirm(
        'This will fetch all your solved problems and sync them to GitHub. This process happens in the background and may take some time. Continue?'
      )
    ) {
      return;
    }

    bulkSyncBtn.disabled = true;
    bulkSyncBtn.textContent = 'Starting...';
    bulkStatus.style.display = 'block';
    bulkStatusText.textContent = 'Fetching solved problems...';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'INIT_BULK_SYNC' });

      if (response.success) {
        if (response.count === 0) {
          bulkStatusText.textContent = response.message;
          showStatus(response.message, 'info');
        } else {
          bulkStatusText.textContent = `Success! Added ${response.count} problems to the queue. They will sync in the background.`;
          showStatus(`Added ${response.count} problems to sync queue`, 'success');
        }
      } else {
        bulkStatusText.textContent = `Error: ${response.error}`;
        showStatus(`Bulk Sync Failed: ${response.error}`, 'error');
      }
    } catch (error) {
      bulkStatusText.textContent = `Error: ${error.message}`;
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      bulkSyncBtn.disabled = false;
      bulkSyncBtn.textContent = 'Sync All Solved Problems';
    }
  });

  // Clear all stored data
  async function clearAllData() {
    // Preserve in-flight queues
    const { codetrail_submission_queue, codetrail_bulk_queue } = await new Promise((r) =>
      chrome.storage.local.get(['codetrail_submission_queue', 'codetrail_bulk_queue'], r)
    );

    await new Promise((resolve) => chrome.storage.local.clear(resolve));

    // Restore queues if they had items
    if (codetrail_submission_queue?.length || codetrail_bulk_queue?.length) {
      await new Promise((r) =>
        chrome.storage.local.set({ codetrail_submission_queue, codetrail_bulk_queue }, r)
      );
    }

    // Reset UI
    usernameInput.value = '';
    repoInput.value = '';
    tokenInput.value = '';
    groqApiKeyInput.value = '';

    showStatus('All data cleared', 'success');
  }

  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide after delay
    const delay = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      statusMessage.style.display = 'none'; // Basic hide, CSS animation handles fade out if improved
    }, delay);
  }
});

// Listen for bulk sync progress
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BULK_SYNC_PROGRESS') {
    const statusDiv = document.getElementById('bulkStatus');
    const statusText = document.getElementById('bulkStatusText');

    statusDiv.style.display = 'block';
    statusText.textContent = `Syncing: ${message.current} (${message.processed}/${message.total})`;
  }
});
