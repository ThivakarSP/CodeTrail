// CodeTrail Options Page Script
// Handles configuration and connection testing using centralized storage

import { getConfig, saveConfig, resetStats } from './utils/storage.js';
import { testConnection } from './utils/github.js';

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
  }

  // Save settings to storage
  async function saveSettings() {
    const username = usernameInput.value.trim();
    const repo = repoInput.value.trim();
    const token = tokenInput.value.trim();

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
        token
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
      // We can call testConnection directly since we are in a module and imported it
      // equivalent to messaging background but faster/direct
      const response = await testConnection({ username, repo, token });

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
    if (!confirm('This will fetch all your solved problems and sync them to GitHub. This process happens in the background and may take some time. Continue?')) {
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
    // Clear local storage
    await new Promise(resolve => chrome.storage.local.clear(resolve));

    // Reset UI
    usernameInput.value = '';
    repoInput.value = '';
    tokenInput.value = '';

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
