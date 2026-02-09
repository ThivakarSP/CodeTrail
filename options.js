// LeetHub Options Page Script

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
    toggleTokenBtn.addEventListener('click', () => {
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            toggleTokenBtn.textContent = '🔒';
        } else {
            tokenInput.type = 'password';
            toggleTokenBtn.textContent = '👁️';
        }
    });

    // Save settings
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    // Test connection
    testBtn.addEventListener('click', async () => {
        await testConnection();
    });

    // Clear all data
    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all LeetHub data? This cannot be undone.')) {
            await clearAllData();
        }
    });

    // Load settings from storage
    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['github_username', 'github_repo', 'github_token'], (result) => {
                if (result.github_username) usernameInput.value = result.github_username;
                if (result.github_repo) repoInput.value = result.github_repo;
                if (result.github_token) tokenInput.value = result.github_token;
                resolve();
            });
        });
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

        // Validate token format
        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            showStatus('Token should start with "ghp_" or "github_pat_"', 'warning');
        }

        // Show loading state
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            // Save to storage
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    github_username: username,
                    github_repo: repo,
                    github_token: token
                }, resolve);
            });

            showStatus('Settings saved successfully!', 'success');

            // Auto-test connection after save with proper async flow
            await testConnection();
        } catch (error) {
            showStatus(`Failed to save: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Settings';
        }
    }

    // Test GitHub connection
    async function testConnection() {
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
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'TEST_CONNECTION',
                    config: { username, repo, token }
                }, resolve);
            });

            if (response && response.success) {
                showStatus('✅ Connection successful! Ready to sync.', 'success');
            } else {
                showStatus(`❌ ${response?.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            showStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = originalText;
        }
    }

    // Clear all stored data
    async function clearAllData() {
        await new Promise((resolve) => {
            chrome.storage.local.clear(resolve);
        });

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

        // Auto-hide after delay (shorter for success, longer for errors)
        const delay = type === 'error' ? 10000 : 5000;
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, delay);
    }
});
