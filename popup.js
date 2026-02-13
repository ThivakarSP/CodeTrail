// CodeTrail Popup Script
// Enhanced with stats display and repository link

import { getConfig, getStats, resetStats, getSyncHistory, saveConfig } from './utils/storage.js';

// Cached HTML escape element for performance
const escapeElement = document.createElement('div');

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
    try {
        await renderConfig();
        await renderStats();
        await renderAnalytics();
        await renderHistory();
    } catch (error) {
        console.error('CodeTrail: Error initializing popup:', error);
    }

    // Event Listeners
    openOptionsBtn?.addEventListener('click', openOptionsPage);
    openOptionsLink?.addEventListener('click', (e) => {
        e.preventDefault();
        openOptionsPage();
    });

    enableToggle?.addEventListener('change', async () => {
        const config = await getConfig();
        config.enabled = enableToggle.checked;
        await saveConfig({ enabled: enableToggle.checked });
        updateStatusIndicator(enableToggle.checked);
    });

    resetStatsBtn?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset your statistics? This cannot be undone.')) {
            await resetStats();
            await renderStats();
        }
    });

    openRepoLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        const config = await getConfig();
        if (config.username && config.repo) {
            chrome.tabs.create({
                url: `https://github.com/${config.username}/${config.repo}`,
            });
        }
    });

    // Render Functions
    async function renderConfig() {
        const config = await getConfig();

        if (config.token && config.username && config.repo) {
            configCard.innerHTML = `
                <div class="config-icon"></div>
                <div class="config-info">
                    <h3>Connected</h3>
                    <p>${escapeHtml(config.username)}/${escapeHtml(config.repo)}</p>
                </div>
                <button class="btn-configure" id="openOptions">Settings</button>
            `;

            // Re-attach listener to new button
            document.getElementById('openOptions')?.addEventListener('click', openOptionsPage);

            openRepoLink.style.display = 'inline-block';
        } else {
            configCard.innerHTML = `
                <div class="config-icon">⚠️</div>
                <div class="config-info">
                    <h3>Not Connected</h3>
                    <p>Set up GitHub to start syncing</p>
                </div>
                <button class="btn-configure" id="openOptions">Connect</button>
            `;
            document.getElementById('openOptions')?.addEventListener('click', openOptionsPage);
            openRepoLink.style.display = 'none';
        }

        if (enableToggle) {
            enableToggle.checked = config.enabled;
            updateStatusIndicator(config.enabled);
        }
    }

    async function renderStats() {
        const stats = await getStats();

        statTotal.textContent = stats.total || 0;
        statEasy.textContent = stats.easy || 0;
        statMedium.textContent = stats.medium || 0;
        statHard.textContent = stats.hard || 0;
    }

    async function renderAnalytics() {
        // Dynamic import to avoid issues if utils/storage.js isn't fully updated in cache
        const { getAnalytics } = await import('./utils/storage.js');
        const analytics = await getAnalytics();

        document.getElementById('statWeekly').textContent = analytics.weekly || 0;
        document.getElementById('statMonthly').textContent = analytics.monthly || 0;
        document.getElementById('statYearly').textContent = analytics.yearly || 0;
    }

    async function renderHistory() {
        const history = await getSyncHistory();

        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon"></span>
                    <p>No synced problems yet</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = history
            .map(
                (item) => `
            <div class="history-item">
                <div class="history-main">
                    <a href="${item.url}" target="_blank" class="history-title" title="${escapeHtml(item.title)}">
                        ${item.number ? item.number + '. ' : ''}${escapeHtml(item.title)}
                    </a>
                    <div class="history-meta">
                        <span class="difficulty ${getDifficultyClass(item.difficulty)}">${item.difficulty}</span>
                        <span class="language">${item.language || ''}</span>
                        ${item.runtime ? `<span class="runtime">Runtime: ${escapeHtml(item.runtime)}</span>` : ''}
                    </div>
                </div>
                <div class="history-time" title="${new Date(item.timestamp).toLocaleString()}">
                    ${formatTime(item.timestamp)}
                </div>
            </div>
        `
            )
            .join('');
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

    // Utility Functions
    function escapeHtml(text) {
        if (!text) return '';
        escapeElement.textContent = text;
        return escapeElement.innerHTML;
    }

    function getDifficultyClass(difficulty) {
        switch (difficulty?.toLowerCase()) {
            case 'easy':
                return 'easy';
            case 'medium':
                return 'medium';
            case 'hard':
                return 'hard';
            default:
                return '';
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
