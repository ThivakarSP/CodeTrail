import { sanitizeYoutubeUrl, sanitizeMarkdown } from './utils/sanitize.js';
import { getConfig, saveConfig } from './utils/storage.js';

const FALLBACK_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'deepseek-r1-distill-llama-70b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];

async function fetchAvailableGroqModels(apiKey) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data || !Array.isArray(data.data)) return [];

    return data.data
      .filter((m) => {
        if (m.active === false) return false;
        const id = (m.id || '').toLowerCase();
        if (
          id.includes('whisper') ||
          id.includes('guard') ||
          id.includes('tts') ||
          id.includes('embed')
        ) {
          return false;
        }
        return true;
      })
      .map((m) => m.id);
  } catch (e) {
    console.warn('CodeTrail: Could not dynamically fetch Groq models', e);
    return [];
  }
}

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
    customMethodGroup: document.getElementById('customMethodGroup'),
    customMethod: document.getElementById('customMethod'),
    timeComplexity: document.getElementById('timeComplexity'),
    customTimeComplexityGroup: document.getElementById('customTimeComplexityGroup'),
    customTimeComplexity: document.getElementById('customTimeComplexity'),
    spaceComplexity: document.getElementById('spaceComplexity'),
    customSpaceComplexityGroup: document.getElementById('customSpaceComplexityGroup'),
    customSpaceComplexity: document.getElementById('customSpaceComplexity'),
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

  const urlParams = new URLSearchParams(window.location.search);
  const syncId = urlParams.get('id') || '';
  const pendingKey = syncId ? `pending_sync_data_${syncId}` : 'pending_sync_data';
  const draftKey = syncId ? `draft_sync_data_${syncId}` : 'draft_sync_data';

  // Load initial data
  try {
    const data = await chrome.storage.local.get([pendingKey]);
    if (data[pendingKey]) {
      currentProblemData = data[pendingKey];
      renderForm(currentProblemData);
    } else {
      showError('No problem data found. Please try submitting again.');
    }
  } catch (e) {
    showError('Failed to load problem data: ' + e.message);
  }

  // Event Listeners for Memory (Persistence)
  [
    'method',
    'customMethod',
    'timeComplexity',
    'customTimeComplexity',
    'spaceComplexity',
    'customSpaceComplexity',
    'notes',
    'youtube',
  ].forEach((id) => {
    elements[id]?.addEventListener('input', saveDraft);
  });

  // Toggle visibility of custom method input
  elements.method?.addEventListener('change', (e) => {
    elements.customMethodGroup.style.display =
      e.target.value === 'Others' ? 'block' : 'none';
    if (e.target.value === 'Others') {
      elements.customMethod.focus();
    }
    saveDraft();
  });

  // Toggle visibility of custom complexity inputs
  elements.timeComplexity.addEventListener('change', (e) => {
    elements.customTimeComplexityGroup.style.display =
      e.target.value === 'Others' ? 'block' : 'none';
  });
  elements.spaceComplexity.addEventListener('change', (e) => {
    elements.customSpaceComplexityGroup.style.display =
      e.target.value === 'Others' ? 'block' : 'none';
  });

  // Event Listeners for Actions
  elements.syncBtn.addEventListener('click', handleSync);
  elements.cancelBtn.addEventListener('click', () => window.close());
  elements.retryBtn.addEventListener('click', () => {
    switchView('form');
    elements.footer.style.display = 'flex';
    elements.syncBtn.textContent = 'Sync to GitHub';
    elements.syncBtn.disabled = false;
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
      customMethod: elements.customMethod.value,
      timeComplexity: elements.timeComplexity.value,
      customTimeComplexity: elements.customTimeComplexity.value,
      spaceComplexity: elements.spaceComplexity.value,
      customSpaceComplexity: elements.customSpaceComplexity.value,
      notes: elements.notes.value,
      youtube: elements.youtube.value,
    };
    await chrome.storage.local.set({ [draftKey]: draft });
  }

  async function restoreDraft() {
    const result = await chrome.storage.local.get([draftKey]);
    if (result[draftKey]) {
      const {
        method,
        customMethod,
        timeComplexity,
        customTimeComplexity,
        spaceComplexity,
        customSpaceComplexity,
        notes,
        youtube,
      } = result[draftKey];
      if (method) {
        elements.method.value = method;
        if (method === 'Others') {
          elements.customMethodGroup.style.display = 'block';
        }
      }
      if (customMethod) elements.customMethod.value = customMethod;

      if (timeComplexity) {
        elements.timeComplexity.value = timeComplexity;
        if (timeComplexity === 'Others') {
          elements.customTimeComplexityGroup.style.display = 'block';
        }
      }
      if (customTimeComplexity) elements.customTimeComplexity.value = customTimeComplexity;

      if (spaceComplexity) {
        elements.spaceComplexity.value = spaceComplexity;
        if (spaceComplexity === 'Others') {
          elements.customSpaceComplexityGroup.style.display = 'block';
        }
      }
      if (customSpaceComplexity) elements.customSpaceComplexity.value = customSpaceComplexity;

      if (notes) elements.notes.value = notes;
      if (youtube) elements.youtube.value = youtube;
    }
  }

  async function renderForm(data) {
    elements.title.textContent = `${data.number ? data.number + '. ' : ''}${data.title}`;

    // Dynamically insert custom headings from config if configured
    try {
      const config = await getConfig();
      if (config.customHeadings) {
        const headings = config.customHeadings
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean);
        if (headings.length > 0) {
          const methodSelect = elements.method;
          const existingValues = new Set(
            Array.from(methodSelect.options).map((opt) => opt.value.toLowerCase())
          );
          let customGroup = methodSelect.querySelector('optgroup[label="Custom Topics"]');
          if (!customGroup) {
            customGroup = document.createElement('optgroup');
            customGroup.label = 'Custom Topics';
            const otherOptgroup = methodSelect.querySelector('optgroup[label="Other Topics"]');
            if (otherOptgroup) {
              methodSelect.insertBefore(customGroup, otherOptgroup);
            } else {
              methodSelect.appendChild(customGroup);
            }
          }
          for (const heading of headings) {
            if (!existingValues.has(heading.toLowerCase())) {
              const opt = document.createElement('option');
              opt.value = heading;
              opt.textContent = heading;
              customGroup.appendChild(opt);
              existingValues.add(heading.toLowerCase());
            }
          }
        }
      }
    } catch (e) {
      console.warn('CodeTrail: Failed to load custom headings', e);
    }

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
    await restoreDraft();

    // If draft didn't set a method, auto-detect from problem language and tags
    if (!elements.method.value) {
      const lang = (data.language || '').toLowerCase();
      const tags = (data.tags || []).map((t) =>
        (typeof t === 'string' ? t : t.name || '').toLowerCase()
      );
      const isSql =
        lang.includes('sql') ||
        lang.includes('mysql') ||
        lang.includes('oracle') ||
        tags.includes('database');
      const isPandas =
        lang.includes('pandas') || lang.includes('pythondata') || tags.includes('pandas');
      const isShell = lang.includes('shell') || lang.includes('bash') || tags.includes('shell');
      const isConcurrency = tags.includes('concurrency');

      if (isSql) elements.method.value = 'SQL';
      else if (isPandas) elements.method.value = 'Pandas';
      else if (isShell) elements.method.value = 'Shell';
      else if (isConcurrency) elements.method.value = 'Concurrency';
    }

    // Auto-focus notes or method
    setTimeout(() => elements.notes.focus(), 100);
  }

  function handleSync() {
    if (!currentProblemData) return;

    const methodVal =
      elements.method.value === 'Others'
        ? elements.customMethod.value.trim()
        : elements.method.value.trim();
    const timeVal =
      elements.timeComplexity.value === 'Others'
        ? elements.customTimeComplexity.value.trim()
        : elements.timeComplexity.value.trim();
    const spaceVal =
      elements.spaceComplexity.value === 'Others'
        ? elements.customSpaceComplexity.value.trim()
        : elements.spaceComplexity.value.trim();

    const references = {
      method: sanitizeMarkdown(methodVal),
      timeComplexity: sanitizeMarkdown(timeVal),
      spaceComplexity: sanitizeMarkdown(spaceVal),
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
    elements.aiAnalyzeBtn.innerHTML =
      '<div class="spinner" style="width: 16px; height: 16px; margin: 0; border-width: 2px;"></div> Analyzing...';
    elements.aiStatus.textContent = '';

    try {
      let aiInstructions = [];
      let jsonKeys = ['"method"'];

      if (config.aiGenerateComplexity !== false) {
        aiInstructions.push(
          '2. The Time Complexity (e.g., O(1), O(log n), O(n), O(n log n), O(n^2), O(n^3), O(2^n), O(n!)).'
        );
        aiInstructions.push('3. The Space Complexity (using the same options as Time Complexity).');
        jsonKeys.push('"timeComplexity"', '"spaceComplexity"');
      }
      if (config.aiGenerateNotes !== false) {
        let noteInstruction = `${aiInstructions.length + 2}. A brief, 1-2 sentence explanation for the notes section.`;
        if (config.aiCustomInstructions) {
          noteInstruction = `${aiInstructions.length + 2}. Generate the notes section according to these custom instructions: "${config.aiCustomInstructions}"`;
        }
        aiInstructions.push(noteInstruction);
        jsonKeys.push('"notes"');
      }

      const prompt = `
You are an expert software engineer analyzing a LeetCode solution.
Analyze the following code for the problem "${currentProblemData.title}".

Code:
\`\`\`${currentProblemData.language}
${currentProblemData.code}
\`\`\`

Based on the code, determine:
1. The most appropriate "Method / Approach" or category (e.g., Array, String, Hash Table, Two Pointers, Sliding Window, Binary Search, Dynamic Programming, Backtracking, Recursion, Depth-First Search, Breadth-First Search, Graph, Tree, Trie, Heap, Stack, Queue, Linked List, Greedy, Divide and Conquer, Bit Manipulation, Math, SQL, Pandas, Database, Concurrency, Shell). If it is a specific technique (e.g., Window Function, CTE, Aggregation), provide a concise 1-3 word name.
${aiInstructions.join('\n')}

Respond strictly in valid JSON format with keys: ${jsonKeys.join(', ')}. Do not output markdown code blocks, just raw JSON.
`;

      const userModel = (config.groqModel || '').trim();
      const discoveredModels = await fetchAvailableGroqModels(config.groqApiKey);

      const candidateModels = [];
      if (userModel) candidateModels.push(userModel);
      discoveredModels.forEach((m) => {
        if (!candidateModels.includes(m)) candidateModels.push(m);
      });
      FALLBACK_GROQ_MODELS.forEach((m) => {
        if (!candidateModels.includes(m)) candidateModels.push(m);
      });

      let text = null;
      let successfulModel = null;
      let lastError = null;

      for (let i = 0; i < candidateModels.length; i++) {
        const modelToTry = candidateModels[i];
        elements.aiStatus.textContent = `Analyzing with ${modelToTry}...`;
        elements.aiStatus.style.color = 'var(--text-secondary)';

        try {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.groqApiKey}`,
            },
            body: JSON.stringify({
              model: modelToTry,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are an expert software engineer analyzing LeetCode solutions. You must respond strictly in JSON format.',
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errMsg = errorData.error?.message || `HTTP ${response.status}`;
            lastError = new Error(`Model ${modelToTry}: ${errMsg}`);
            console.warn(
              `CodeTrail: Model ${modelToTry} unavailable (${errMsg}). Trying next available model...`
            );
            continue;
          }

          const data = await response.json();
          if (data.choices && data.choices[0] && data.choices[0].message?.content) {
            text = data.choices[0].message.content;
            successfulModel = modelToTry;
            break;
          }
        } catch (fetchErr) {
          lastError = fetchErr;
          console.warn(`CodeTrail: Error trying model ${modelToTry}: ${fetchErr.message}`);
          continue;
        }
      }

      if (!successfulModel || !text) {
        throw (
          lastError ||
          new Error(
            'All tested Groq models failed. Please check your API key or configure a custom model in Settings.'
          )
        );
      }

      // If a fallback was used instead of user's model, auto-save the working model
      if (userModel !== successfulModel) {
        try {
          await saveConfig({ ...config, groqModel: successfulModel });
        } catch (e) {
          console.warn('CodeTrail: Could not auto-save working model', e);
        }
      }

      try {
        const result = JSON.parse(text);

        // Populate fields
        if (result.method) {
          const methodSelect = elements.method;
          let found = false;
          for (let i = 0; i < methodSelect.options.length; i++) {
            if (methodSelect.options[i].value.toLowerCase() === result.method.toLowerCase()) {
              methodSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            methodSelect.value = 'Others';
            elements.customMethodGroup.style.display = 'block';
            elements.customMethod.value = result.method;
          } else {
            elements.customMethodGroup.style.display = 'none';
            elements.customMethod.value = '';
          }
        }

        if (result.timeComplexity) {
          const tcSelect = elements.timeComplexity;
          let found = false;
          for (let i = 0; i < tcSelect.options.length; i++) {
            if (tcSelect.options[i].value === result.timeComplexity) {
              tcSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            tcSelect.value = 'Others';
            elements.customTimeComplexityGroup.style.display = 'block';
            elements.customTimeComplexity.value = result.timeComplexity;
          } else {
            elements.customTimeComplexityGroup.style.display = 'none';
            elements.customTimeComplexity.value = '';
          }
        }

        if (result.spaceComplexity) {
          const scSelect = elements.spaceComplexity;
          let found = false;
          for (let i = 0; i < scSelect.options.length; i++) {
            if (scSelect.options[i].value === result.spaceComplexity) {
              scSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            scSelect.value = 'Others';
            elements.customSpaceComplexityGroup.style.display = 'block';
            elements.customSpaceComplexity.value = result.spaceComplexity;
          } else {
            elements.customSpaceComplexityGroup.style.display = 'none';
            elements.customSpaceComplexity.value = '';
          }
        }

        if (result.notes) elements.notes.value = result.notes;

        elements.aiStatus.textContent = `Analysis complete (${successfulModel})!`;
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
    chrome.storage.local.remove([draftKey, pendingKey]);

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
