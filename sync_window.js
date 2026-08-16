import { sanitizeYoutubeUrl, sanitizeMarkdown } from './utils/sanitize.js';
import { getConfig } from './utils/storage.js';

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
    timeComplexity: document.getElementById('timeComplexity'),
    spaceComplexity: document.getElementById('spaceComplexity'),
    notes: document.getElementById('notes'),
    youtube: document.getElementById('youtube'),
    footer: document.getElementById('sync-footer'),
    syncBtn: document.getElementById('sync-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    retryBtn: document.getElementById('retry-btn'),
    errorMsg: document.getElementById('error-message'),
    aiAnalyzeBtn: document.getElementById('ai-analyze-btn'),
    aiStatus: document.getElementById('ai-status'),
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
  ['method', 'timeComplexity', 'spaceComplexity', 'notes', 'youtube'].forEach((id) => {
    elements[id].addEventListener('input', saveDraft);
  });

  // Event Listeners for Actions
  elements.syncBtn.addEventListener('click', handleSync);
  elements.cancelBtn.addEventListener('click', () => window.close());
  elements.retryBtn.addEventListener('click', () => {
    switchView('form');
    elements.footer.style.display = 'flex';
  });
  elements.aiAnalyzeBtn?.addEventListener('click', handleAiAnalyze);

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
      timeComplexity: elements.timeComplexity.value,
      spaceComplexity: elements.spaceComplexity.value,
      notes: elements.notes.value,
      youtube: elements.youtube.value,
    };
    await chrome.storage.local.set({ draft_sync_data: draft });
  }

  async function restoreDraft() {
    const result = await chrome.storage.local.get(['draft_sync_data']);
    if (result.draft_sync_data) {
      const { method, timeComplexity, spaceComplexity, notes, youtube } = result.draft_sync_data;
      if (method) elements.method.value = method;
      if (timeComplexity) elements.timeComplexity.value = timeComplexity;
      if (spaceComplexity) elements.spaceComplexity.value = spaceComplexity;
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
      timeComplexity: sanitizeMarkdown(elements.timeComplexity.value.trim()),
      spaceComplexity: sanitizeMarkdown(elements.spaceComplexity.value.trim()),
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

  async function handleAiAnalyze() {
    if (!currentProblemData || !currentProblemData.code) return;

    const config = await getConfig();
    if (!config.groqApiKey) {
      elements.aiStatus.textContent = 'Please configure your Groq API Key in Settings.';
      elements.aiStatus.style.color = 'var(--error)';
      return;
    }

    elements.aiAnalyzeBtn.disabled = true;
    const originalText = elements.aiAnalyzeBtn.innerHTML;
    elements.aiAnalyzeBtn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; margin: 0; border-width: 2px;"></div> Analyzing...';
    elements.aiStatus.textContent = '';

    try {
      const prompt = `
You are an expert software engineer analyzing a LeetCode solution.
Analyze the following code for the problem "${currentProblemData.title}".

Code:
\`\`\`${currentProblemData.language}
${currentProblemData.code}
\`\`\`

Based on the code, determine:
1. The most appropriate "Method / Approach". Pick the CLOSEST match from this exact list: [Array, String, Hash Table, Two Pointers, Sliding Window, Binary Search, Dynamic Programming, Backtracking, Recursion, Depth-First Search, Breadth-First Search, Graph, Tree, Trie, Heap, Stack, Queue, Linked List, Greedy, Divide and Conquer, Bit Manipulation, Math]. If none fit, use the closest one.
2. The Time Complexity (e.g., O(1), O(log n), O(n), O(n log n), O(n^2), O(n^3), O(2^n), O(n!)).
3. The Space Complexity (using the same options as Time Complexity).
4. A brief, 1-2 sentence explanation for the notes section.

Respond strictly in valid JSON format with keys: "method", "timeComplexity", "spaceComplexity", "notes". Do not output markdown code blocks, just raw JSON.
`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are an expert software engineer analyzing LeetCode solutions. You must respond strictly in JSON format.'
            },
            {
              role: 'user',
              content: prompt,
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content;
      
      try {
        const result = JSON.parse(text);
        
        // Populate fields
        if (result.method) {
          const methodSelect = elements.method;
          for (let i = 0; i < methodSelect.options.length; i++) {
            if (methodSelect.options[i].value.toLowerCase() === result.method.toLowerCase()) {
              methodSelect.selectedIndex = i;
              break;
            }
          }
        }

        if (result.timeComplexity) elements.timeComplexity.value = result.timeComplexity;
        if (result.spaceComplexity) elements.spaceComplexity.value = result.spaceComplexity;
        if (result.notes) elements.notes.value = result.notes;

        elements.aiStatus.textContent = 'Analysis complete!';
        elements.aiStatus.style.color = 'var(--success)';
        saveDraft(); // Save the new values
        
        // Clear success message after 3s
        setTimeout(() => {
          elements.aiStatus.textContent = '';
        }, 3000);

      } catch (parseError) {
        throw new Error('Failed to parse AI response');
      }

    } catch (error) {
      elements.aiStatus.textContent = error.message;
      elements.aiStatus.style.color = 'var(--error)';
    } finally {
      elements.aiAnalyzeBtn.disabled = false;
      elements.aiAnalyzeBtn.innerHTML = originalText;
    }
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
    
    let secondsLeft = 3;
    const successMsg = views.success.querySelector('p');
    if (successMsg) {
      successMsg.textContent = `Window will close in ${secondsLeft} seconds...`;
      const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          successMsg.textContent = `Window will close in ${secondsLeft} seconds...`;
        } else {
          clearInterval(interval);
          window.close();
        }
      }, 1000);
    } else {
      setTimeout(() => {
        window.close();
      }, 3000);
    }
  }

  function showError(msg) {
    elements.errorMsg.textContent = msg;
    switchView('error');
  }
});
