import { sanitizeYoutubeUrl, sanitizeMarkdown } from './utils/sanitize.js';

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const views = {
    loading: document.getElementById('loading-state'),
    form: document.getElementById('form-state'),
    success: document.getElementById('success-state'),
    error: document.getElementById('error-state'),
  };

  const elements = {
    title: document.getElementById('problem-title'),
    tags: document.getElementById('problem-tags'),
    method: document.getElementById('method'),
    notes: document.getElementById('notes'),
    youtube: document.getElementById('youtube'),
    footer: document.getElementById('sync-footer'),
    syncBtn: document.getElementById('sync-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    retryBtn: document.getElementById('retry-btn'),
    errorMsg: document.getElementById('error-message'),
  };

  let currentProblemData = null;

  // Load initial data
  try {
    const data = await chrome.storage.local.get(['pending_sync_data']);
    if (data.pending_sync_data) {
      currentProblemData = data.pending_sync_data;
      renderForm(currentProblemData);
    } else {
      showError('No problem data found. Please try submitting again.');
    }
  } catch (e) {
    showError('Failed to load problem data: ' + e.message);
  }

  // Event Listeners for Memory (Persistence)
  ['method', 'notes', 'youtube'].forEach((id) => {
    elements[id].addEventListener('input', saveDraft);
  });

  // Event Listeners for Actions
  elements.syncBtn.addEventListener('click', handleSync);
  elements.cancelBtn.addEventListener('click', () => window.close());
  elements.retryBtn.addEventListener('click', () => {
    switchView('form');
    elements.footer.style.display = 'flex';
  });

  // Listen for background messages (success/error/progress)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SYNC_STATUS') {
      if (message.status === 'success') {
        showSuccess();
      } else if (message.status === 'error') {
        showError(message.message);
      } else if (message.status === 'syncing') {
        // Optional: show loading overlay or disable buttons
        elements.syncBtn.textContent = 'Syncing...';
        elements.syncBtn.disabled = true;
      }
    }
  });

  async function saveDraft() {
    const draft = {
      method: elements.method.value,
      notes: elements.notes.value,
      youtube: elements.youtube.value,
    };
    await chrome.storage.local.set({ draft_sync_data: draft });
  }

  async function restoreDraft() {
    const result = await chrome.storage.local.get(['draft_sync_data']);
    if (result.draft_sync_data) {
      const { method, notes, youtube } = result.draft_sync_data;
      if (method) elements.method.value = method;
      if (notes) elements.notes.value = notes;
      if (youtube) elements.youtube.value = youtube;
    }
  }

  function renderForm(data) {
    elements.title.textContent = `${data.number ? data.number + '. ' : ''}${data.title}`;

    // Clear tags
    elements.tags.innerHTML = '';
    if (data.tags && data.tags.length) {
      data.tags.forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        elements.tags.appendChild(span);
      });
    }

    switchView('form');
    elements.footer.style.display = 'flex';

    // Restore any saved draft data
    restoreDraft();

    // Auto-focus notes or method
    setTimeout(() => elements.notes.focus(), 100);
  }

  function handleSync() {
    if (!currentProblemData) return;

    const references = {
      method: sanitizeMarkdown(elements.method.value.trim()),
      notes: sanitizeMarkdown(elements.notes.value.trim()),
      youtube: sanitizeYoutubeUrl(elements.youtube.value.trim()) || '', // Only allows valid youtube URLs
    };

    // Enrich data
    const enrichedData = {
      ...currentProblemData,
      references,
    };

    // Send to background
    // Background handles README generation using shared utility

    chrome.runtime.sendMessage(
      {
        type: 'CONFIRM_SYNC',
        data: enrichedData,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          views.loading.style.display = 'none';
          views.form.style.display = 'none';
          views.error.style.display = 'block';
          document.getElementById('error-message').textContent = chrome.runtime.lastError.message;
          return;
        }
        if (response && !response.success) {
          views.loading.style.display = 'none';
          views.form.style.display = 'none';
          views.error.style.display = 'block';
          document.getElementById('error-message').textContent = response.error || 'Sync failed';
        } else if (response && response.success) {
          showSuccess();
        }
      }
    );

    // UI Feedback
    elements.syncBtn.textContent = 'Syncing...';
    elements.syncBtn.disabled = true;
  }

  function switchView(viewName) {
    Object.values(views).forEach((el) => (el.style.display = 'none'));
    views[viewName].style.display = 'flex';

    if (viewName !== 'form') {
      elements.footer.style.display = 'none';
    }
  }

  function showSuccess() {
    // Clear draft on success
    chrome.storage.local.remove(['draft_sync_data']);

    switchView('success');
    setTimeout(() => {
      window.close();
    }, 3000);
  }

  function showError(msg) {
    elements.errorMsg.textContent = msg;
    switchView('error');
  }
});
