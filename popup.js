// LeetHub Popup Script
// Enhanced with stats display and repository link

// Cached HTML escape element for performance
const escapeElement = document.createElement('div');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

document.addEventListener('DOMContentLoaded', async () => {
    const statusIndicator = document.getElementById('statusIndicator');
    const configCard = document.getElementById('configCard');
    const enableToggle = document.getElementById('enableToggle');
    const historyList = document.getElementById('historyList');
    const openOptionsBtn = document.getElementById('openOptions');
    const openOptionsLink = document.getElementById('openOptionsLink');
    const openRepoLink = document.getElementById('openRepoLink');
    const resetStatsBtn = document.getElementById('resetStats');

    // Stats elements
    const statTotal = document.getElementById('statTotal');
    const statEasy = document.getElementById('statEasy');
    const statMedium = document.getElementById('statMedium');
    const statHard = document.getElementById('statHard');

    // Initialize UI
    await loadConfig();
    await loadStats();
    await loadHistory();

    // Event Listeners
    openOptionsBtn?.addEventListener('click', openOptionsPage);
    openOptionsLink?.addEventListener('click', (e) => {
        e.preventDefault();
        openOptionsPage();
    });

    enableToggle?.addEventListener('change', async () => {
        await saveEnabled(enableToggle.checked);
        updateStatusIndicator(enableToggle.checked);
    });

    resetStatsBtn?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset your statistics? This cannot be undone.')) {
            await resetStats();
            await loadStats();
        }
    });

    openRepoLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        const config = await getConfig();
        if (config.username && config.repo) {
            chrome.tabs.create({
                url: `https://github.com/${config.username}/${config.repo}`
            });
        }
    });

    // Functions
    async function loadConfig() {
        try {
            const config = await getConfig();

            if (config.token && config.username && config.repo) {
                configCard.innerHTML = `
                    <div class="config-icon">✓</div>
                    <div class="config-info">
                        <h3>Connected</h3>
                        <p>${escapeHtml(config.username)}/${escapeHtml(config.repo)}</p>
                    </div>
                    <button class="btn-configure" id="openOptions">Settings</button>
                `;
                configCard.style.borderColor = 'rgba(0, 184, 163, 0.3)';
                configCard.style.background = 'rgba(0, 184, 163, 0.1)';

                // Show repo link
                if (openRepoLink) {
                    openRepoLink.style.display = 'inline';
                }

                // Re-attach event listener
                document.getElementById('openOptions')?.addEventListener('click', openOptionsPage);
            }

            enableToggle.checked = config.enabled !== false;
            updateStatusIndicator(enableToggle.checked);
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    async function loadStats() {
        try {
            const stats = await getStats();

            if (statTotal) statTotal.textContent = stats.total || 0;
            if (statEasy) statEasy.textContent = stats.easy || 0;
            if (statMedium) statMedium.textContent = stats.medium || 0;
            if (statHard) statHard.textContent = stats.hard || 0;
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    async function loadHistory() {
        try {
            const history = await getHistory();

            if (history.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">📭</span>
                        <p>No synced problems yet</p>
                    </div>
                `;
                return;
            }

            historyList.innerHTML = history.slice(0, 10).map(item => `
                <div class="history-item">
                    <div class="history-main">
                        <a href="${escapeHtml(item.url)}" target="_blank" class="history-title" title="${escapeHtml(item.title)}">
                            ${escapeHtml(item.title)}
                        </a>
                        <div class="history-meta">
                            <span class="difficulty ${getDifficultyClass(item.difficulty)}">${escapeHtml(item.difficulty)}</span>
                            <span class="language">${escapeHtml(item.language)}</span>
                            ${item.runtime ? `<span class="runtime">⏱ ${escapeHtml(item.runtime)}</span>` : ''}
                        </div>
                    </div>
                    <span class="history-time">${formatTime(item.timestamp)}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load history:', error);
            historyList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">⚠️</span>
                    <p>Failed to load history</p>
                </div>
            `;
        }
    }

    function updateStatusIndicator(enabled) {
        const dot = statusIndicator.querySelector('.status-dot');
        const text = statusIndicator.querySelector('.status-text');

        if (enabled) {
            dot.classList.add('active');
            dot.classList.remove('inactive');
            text.textContent = 'Active';
        } else {
            dot.classList.add('inactive');
            dot.classList.remove('active');
            text.textContent = 'Disabled';
        }
    }

    function openOptionsPage() {
        chrome.runtime.openOptionsPage();
    }

    // API Functions with retry logic
    async function getConfig() {
        return retryOperation(async () => {
            return new Promise((resolve) => {
                chrome.storage.local.get(
                    ['github_username', 'github_repo', 'github_token', 'extension_enabled'],
                    (result) => {
                        resolve({
                            username: result.github_username || '',
                            repo: result.github_repo || '',
                            token: result.github_token || '',
                            enabled: result.extension_enabled !== false
                        });
                    }
                );
            });
        });
    }

    async function getStats() {
        return retryOperation(async () => {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Stats fetch error:', chrome.runtime.lastError);
                        resolve({ total: 0, easy: 0, medium: 0, hard: 0 });
                        return;
                    }
                    resolve(response || { total: 0, easy: 0, medium: 0, hard: 0 });
                });
            });
        });
    }

    async function resetStats() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'RESET_STATS' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Stats reset error:', chrome.runtime.lastError);
                }
                resolve(response);
            });
        });
    }

    async function getHistory() {
        return retryOperation(async () => {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: 'GET_SYNC_HISTORY' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('History fetch error:', chrome.runtime.lastError);
                        resolve([]);
                        return;
                    }
                    resolve(response || []);
                });
            });
        });
    }

    async function saveEnabled(enabled) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ extension_enabled: enabled }, resolve);
        });
    }

    // Retry helper
    async function retryOperation(operation, retries = MAX_RETRIES) {
        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
            }
        }
    }

    // Utility Functions
    function escapeHtml(text) {
        if (!text) return '';
        escapeElement.textContent = text;
        return escapeElement.innerHTML;
    }

    function getDifficultyClass(difficulty) {
        switch (difficulty?.toLowerCase()) {
            case 'easy': return 'easy';
            case 'medium': return 'medium';
            case 'hard': return 'hard';
            default: return '';
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return date.toLocaleDateString();
    }
});
