// CodeTrail Content Script (Orchestrator)
// Coordinates scraper, modal, and background communication
// v2.0 - Modular Architecture

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.codeTrailInjected) return;
  window.codeTrailInjected = true;

  console.log('CodeTrail: Content orchestrator loaded (v2.0)');

  const CT = window.CodeTrail;

  // Ensure modules are loaded
  if (!CT || !CT.scraper || !CT.modal || !CT.api) {
    console.error('CodeTrail: Modules not loaded. Check manifest order.');
    return;
  }

  // Constants (could be moved to shared file, but keeping simple for now)
  // Supported languages (synced with utils/constants.js)
  // Constants from shared utils/constants.js
  const { LANGUAGES, SELECTORS } = CT.Constants;

  let submissionInProgress = false;
  let lastProcessedKey = null;

  // Initialization
  function init() {
    // Track intentional submit actions (click or keyboard) to prevent false popups on old submissions
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (
        btn &&
        (btn.innerText.toLowerCase().includes('submit') ||
          btn.getAttribute('data-e2e-locator') === 'console-submit-button')
      ) {
        sessionStorage.setItem('ct_last_submit_time', Date.now());
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        sessionStorage.setItem('ct_last_submit_time', Date.now());
      }
    });

    // Initial check for result (in case of page reload on result)
    checkSubmission();

    // Observer for dynamic changes (SPA navigation)
    // We observe body for major changes, or specific container if possible
    // LeetCode changes a lot, so observing body is safest but expensive
    // Optimizing: only observe when URL looks like a problem page

    // Debounce observer
    let timeout;
    const observer = new MutationObserver((mutations) => {
      if (submissionInProgress) return;

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const url = window.location.href || '';
        if (!url.includes('/problems/') && !url.includes('/submissions/')) return;
        if (url.includes('/solutions/') || url.includes('/discuss/')) return;

        // Check if we are on a submission page or if a result appeared
        const isSubmission = url.includes('/submissions/');
        if (isSubmission || CT.scraper.detectAcceptedStatus(SELECTORS)) {
          checkSubmission();
        }
      }, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Listen format messages
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // Check if a submission has been made and accepted
  async function checkSubmission() {
    if (submissionInProgress) return;

    const isAccepted = CT.scraper.detectAcceptedStatus(SELECTORS);
    if (isAccepted) {
      submissionInProgress = true;
      console.log('CodeTrail: Detected accepted submission');

      // Wait a moment for DOM to settle
      setTimeout(processSubmission, 1000);
    }
  }

  async function processSubmission() {
    try {
      // 1. Scrape basic data
      let data = CT.scraper.extractProblemData(SELECTORS, LANGUAGES);

      // We will do duplicate check AFTER API enhancement to ensure we have the real code

      // 2. Enhance with API data if possible
      const submissionId = CT.scraper.extractSubmissionIdFromUrl(window.location.href);
      if (submissionId) {
        const apiData = await CT.api.fetchSubmissionDetails(submissionId);
        if (apiData) {
          // Merge API data
          data.code = apiData.code || data.code;
          data.runtime = apiData.runtimeDisplay || data.runtime;
          data.runtimePercentile = apiData.runtimePercentile || data.runtimePercentile;
          data.memory = apiData.memoryDisplay || data.memory;
          data.memoryPercentile = apiData.memoryPercentile || data.memoryPercentile;
          // Normalize timestamp safely (LeetCode uses seconds, JS uses ms)
          if (apiData.timestamp) {
            data.timestamp =
              apiData.timestamp < 10000000000 ? apiData.timestamp * 1000 : apiData.timestamp;
          } else {
            data.timestamp = Date.now();
          }

          // Merge Question Data (Title, Difficulty, etc. if scraper failed)
          if (apiData.question) {
            if (!data.title || data.title === 'Unknown Problem') {
              data.title = apiData.question.title;
            }
            if (!data.number) {
              data.number = apiData.question.questionId;
            }
            // Ensure slug is correct
            data.titleSlug = apiData.question.titleSlug || data.titleSlug;

            // Re-generate folder name with correct data
            if (data.titleSlug && data.number) {
              data.folderName = `${data.number.padStart(4, '0')}-${data.titleSlug}`;
            }

            if (!data.difficulty || data.difficulty === 'Unknown') {
              data.difficulty = apiData.question.difficulty;
            }

            // Merge tags if missing
            if ((!data.tags || data.tags.length === 0) && apiData.question.topicTags) {
              data.tags = apiData.question.topicTags.map((t) => t.name);
            }

            // Use API HTML content for perfectly formatted READMEs
            if (apiData.question.content) {
              data.readmeDescription = apiData.question.content;
            }
          }

          // Language normalizer
          if (apiData.lang) {
            const langName =
              typeof apiData.lang === 'object'
                ? apiData.lang.verboseName || apiData.lang.name
                : apiData.lang;
            data.language = CT.scraper.normalizeLang(langName, LANGUAGES);
          }
        }
      } else if (data.titleSlug && data.titleSlug !== 'unknown-problem') {
        // If we don't have a submissionId (e.g. submitting on the main problem page),
        // fetch the problem details via API to guarantee we get the title, tags, and formatted README
        const questionData = await CT.api.fetchProblemDetails(data.titleSlug);
        if (questionData) {
          data.title = questionData.title || data.title;
          data.number = questionData.questionId || data.number;
          if (data.titleSlug && data.number) {
            data.folderName = `${data.number.toString().padStart(4, '0')}-${data.titleSlug}`;
          }
          data.difficulty = questionData.difficulty || data.difficulty;
          if ((!data.tags || data.tags.length === 0) && questionData.topicTags) {
            data.tags = questionData.topicTags.map((t) => t.name);
          }
          if (questionData.content) {
            data.readmeDescription = questionData.content;
          }
        }
      }

      // ABSOLUTE FAILSAFE: Never show a popup if we couldn't find the real problem title
      if (!data.title || data.title === 'Unknown Problem') {
        console.log('CodeTrail: Problem title is unknown. Aborting auto-sync.');
        CT.modal.hideModal();
        submissionInProgress = false;
        return;
      }

      // 2.5 Prevent multiple popups for the exact same code on the exact same problem
      // Uses chrome.storage.local so the history survives page reloads
      const currentKey = `${data.titleSlug}|${data.code}`;

      const cacheObj = await new Promise((resolve) =>
        chrome.storage.local.get(['CT_SYNCED_CACHE'], resolve)
      );
      const cache = cacheObj.CT_SYNCED_CACHE || {};
      const cacheKey = submissionId ? `sub_${submissionId}` : currentKey;

      if (cache[cacheKey] && data.code !== '') {
        CT.modal.hideModal();
        submissionInProgress = false;
        return;
      }

      if (!data.code || data.code.trim() === '') {
        // Code hasn't loaded or isn't available, abort to prevent bad sync
        CT.modal.hideModal();
        submissionInProgress = false;
        return;
      }

      // 2.6 Prevent auto-popup when viewing old past submissions
      // If the API failed to return a timestamp, ageInMinutes will be NaN, which would bypass the check.
      // So we fallback to checking if they actually clicked the 'Submit' button in the last 2 minutes.
      let ageInMinutes = (Date.now() - data.timestamp) / (1000 * 60);

      if (isNaN(ageInMinutes)) {
        const lastSubmitTime = parseInt(sessionStorage.getItem('ct_last_submit_time') || '0', 10);
        const minsSinceSubmitClick = (Date.now() - lastSubmitTime) / 60000;
        ageInMinutes = minsSinceSubmitClick < 2 ? 0 : 999;
      }

      if (ageInMinutes > 10) {
        console.log(
          `CodeTrail: Submission is too old (${ageInMinutes.toFixed(1)} mins). Skipping auto-sync.`
        );
        CT.modal.hideModal();
        submissionInProgress = false;
        return;
      }

      cache[cacheKey] = true;
      // Keep cache small (max 20 items)
      if (Object.keys(cache).length > 20) {
        delete cache[Object.keys(cache)[0]];
      }
      chrome.storage.local.set({ CT_SYNCED_CACHE: cache });

      lastProcessedKey = currentKey;

      // Show processing modal now that we are sure it's a new submission
      CT.modal.showSyncModal({ title: 'Processing...' });

      // 3. Send to background to "start" sync flow (opens sync window)
      chrome.runtime.sendMessage(
        {
          type: 'OPEN_SYNC_WINDOW',
          data: data,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('CodeTrail: Runtime error sending message', chrome.runtime.lastError);
            CT.modal.showError('Extension context invalidated. Please reload the page.');
          } else {
            // Window opened, we can hide modal or show success
            CT.modal.hideModal();
          }
          submissionInProgress = false;
        }
      );
    } catch (e) {
      console.error('CodeTrail: Process error', e);
      CT.modal.showError('Processing failed: ' + e.message);
      submissionInProgress = false;
    }
  }

  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'CHECK_INJECTION') {
      sendResponse({ status: 'injected', version: '2.0' });
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
