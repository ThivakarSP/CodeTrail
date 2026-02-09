// LeetHub Content Script
// Detects accepted submissions and triggers background notification
// Enhanced with GraphQL API for accurate submission details

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.leetHubInjected) return;
    window.leetHubInjected = true;

    console.log('LeetHub: Content script loaded (v7 - GraphQL Enhanced)');

    // ============================================================
    // CONSTANTS AND CONFIG
    // ============================================================

    /** Enum for languages supported by LeetCode with file extensions */
    const languages = Object.freeze({
        C: '.c',
        'C++': '.cpp',
        'C#': '.cs',
        Dart: '.dart',
        Elixir: '.ex',
        Erlang: '.erl',
        Go: '.go',
        Java: '.java',
        JavaScript: '.js',
        Javascript: '.js',
        Kotlin: '.kt',
        MySQL: '.sql',
        'MS SQL Server': '.sql',
        Oracle: '.sql',
        Pandas: '.py',
        PHP: '.php',
        PostgreSQL: '.sql',
        Python: '.py',
        Python3: '.py',
        Racket: '.rkt',
        Ruby: '.rb',
        Rust: '.rs',
        Scala: '.scala',
        Swift: '.swift',
        TypeScript: '.ts',
        Typescript: '.ts',
    });

    /** GraphQL query for submission details */
    const SUBMISSION_DETAILS_QUERY = `
    query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
            runtime
            runtimeDisplay
            runtimePercentile
            memory
            memoryDisplay
            memoryPercentile
            code
            timestamp
            statusCode
            lang {
                name
                verboseName
            }
            question {
                questionId
                title
                titleSlug
                content
                difficulty
                topicTags {
                    name
                    slug
                }
            }
        }
    }`;

    // Per-problem cooldown tracking to prevent duplicate syncs
    const syncedProblems = new Map();
    const COOLDOWN_MS = 10000; // 10 seconds
    const PROBLEM_CACHE_CLEANUP_MS = 300000; // 5 minutes

    // Debounce state
    let checkTimer = null;
    let rafId = null;
    let observer = null;
    let spinnerElement = null;

    // ============================================================
    // INITIALIZATION
    // ============================================================

    function init() {
        observePageAttributes();
        setupCleanup();
        observeURLChanges();
        injectStyles();
    }

    /**
     * Inject CSS for spinner overlay
     */
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .leethub-spinner-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 99999;
            }
            .leethub-spinner {
                width: 60px;
                height: 60px;
                border: 5px solid rgba(255, 255, 255, 0.3);
                border-top: 5px solid #ffa116;
                border-radius: 50%;
                animation: leethub-spin 1s linear infinite;
            }
            .leethub-spinner-text {
                color: white;
                margin-top: 20px;
                font-size: 16px;
                text-align: center;
            }
            .leethub-spinner-container {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            @keyframes leethub-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .leethub-success-badge {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #2cbb5d;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                z-index: 99999;
                animation: leethub-fadeIn 0.3s ease-in-out;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            .leethub-error-badge {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #ef4743;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                z-index: 99999;
                animation: leethub-fadeIn 0.3s ease-in-out;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            @keyframes leethub-fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            /* Sync Modal Styles */
            .codetrail-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 99999;
                animation: leethub-fadeIn 0.2s ease-out;
            }
            .codetrail-modal {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 16px;
                padding: 24px;
                width: 480px;
                max-width: 90vw;
                max-height: 85vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .codetrail-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .codetrail-modal-title {
                color: #ffa116;
                font-size: 20px;
                font-weight: 700;
                margin: 0;
            }
            .codetrail-modal-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 24px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .codetrail-modal-close:hover {
                color: #ef4743;
                background: rgba(239, 71, 67, 0.1);
            }
            .codetrail-problem-info {
                background: rgba(255, 161, 22, 0.1);
                border: 1px solid rgba(255, 161, 22, 0.3);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 20px;
            }
            .codetrail-problem-title {
                color: #fff;
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 4px 0;
            }
            .codetrail-problem-meta {
                color: rgba(255, 255, 255, 0.6);
                font-size: 13px;
            }
            .codetrail-form-group {
                margin-bottom: 16px;
            }
            .codetrail-label {
                display: block;
                color: rgba(255, 255, 255, 0.9);
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 6px;
            }
            .codetrail-input {
                width: 100%;
                padding: 10px 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            .codetrail-input:focus {
                outline: none;
                border-color: #ffa116;
                background: rgba(255, 255, 255, 0.08);
            }
            .codetrail-input::placeholder {
                color: rgba(255, 255, 255, 0.4);
            }
            .codetrail-textarea {
                resize: vertical;
                min-height: 80px;
            }
            .codetrail-hint {
                color: rgba(255, 255, 255, 0.5);
                font-size: 11px;
                margin-top: 4px;
            }
            .codetrail-modal-actions {
                display: flex;
                gap: 12px;
                margin-top: 24px;
            }
            .codetrail-btn {
                flex: 1;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }
            .codetrail-btn-primary {
                background: linear-gradient(135deg, #ffa116 0%, #ff8c00 100%);
                color: #1a1a2e;
            }
            .codetrail-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(255, 161, 22, 0.4);
            }
            .codetrail-btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.8);
            }
            .codetrail-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show loading spinner overlay
     */
    function showSpinner(message = 'Syncing to GitHub...') {
        if (spinnerElement) return;

        spinnerElement = document.createElement('div');
        spinnerElement.className = 'leethub-spinner-overlay';
        spinnerElement.innerHTML = `
            <div class="leethub-spinner-container">
                <div class="leethub-spinner"></div>
                <div class="leethub-spinner-text">${message}</div>
            </div>
        `;
        document.body.appendChild(spinnerElement);
    }

    /**
     * Hide loading spinner overlay
     */
    function hideSpinner() {
        if (spinnerElement) {
            spinnerElement.remove();
            spinnerElement = null;
        }
    }

    /**
     * Show success badge
     */
    function showSuccessBadge(message = '✓ Synced to GitHub') {
        const badge = document.createElement('div');
        badge.className = 'leethub-success-badge';
        badge.textContent = message;
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 3000);
    }

    /**
     * Show error badge
     */
    function showErrorBadge(message = '✗ Sync failed') {
        const badge = document.createElement('div');
        badge.className = 'leethub-error-badge';
        badge.textContent = message;
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 5000);
    }

    /**
     * Show sync modal for adding reference materials
     * @param {Object} problemData - The problem data to sync
     * @returns {Promise<Object|null>} - Returns enriched data or null if cancelled
     */
    function showSyncModal(problemData) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'codetrail-modal-overlay';

            const difficultyColors = {
                'Easy': '#2cbb5d',
                'Medium': '#ffa116',
                'Hard': '#ef4743'
            };
            const diffColor = difficultyColors[problemData.difficulty] || '#888';

            overlay.innerHTML = `
                <div class="codetrail-modal">
                    <div class="codetrail-modal-header">
                        <h2 class="codetrail-modal-title">🚀 Sync to GitHub</h2>
                        <button class="codetrail-modal-close" id="codetrail-close">&times;</button>
                    </div>
                    
                    <div class="codetrail-problem-info">
                        <p class="codetrail-problem-title">${problemData.title || problemData.problemTitle}</p>
                        <p class="codetrail-problem-meta">
                            <span style="color: ${diffColor}; font-weight: 600;">${problemData.difficulty}</span>
                            &nbsp;•&nbsp; ${problemData.language || 'Unknown'}
                            &nbsp;•&nbsp; Runtime: ${problemData.runtime || 'N/A'}
                        </p>
                    </div>
                    
                    <div class="codetrail-form-group">
                        <label class="codetrail-label">📺 YouTube Video Link</label>
                        <input type="url" id="codetrail-youtube" class="codetrail-input" 
                            placeholder="https://youtube.com/watch?v=..." />
                        <p class="codetrail-hint">Tutorial or explanation video for this problem</p>
                    </div>
                    
                    <div class="codetrail-form-group">
                        <label class="codetrail-label">💡 Approach / Algorithm</label>
                        <input type="text" id="codetrail-approach" class="codetrail-input" 
                            placeholder="e.g., Two Pointers, Dynamic Programming, BFS..." />
                    </div>
                    
                    <div class="codetrail-form-group">
                        <label class="codetrail-label">📝 Notes</label>
                        <textarea id="codetrail-notes" class="codetrail-input codetrail-textarea" 
                            placeholder="Key insights, edge cases, time/space complexity notes..."></textarea>
                    </div>
                    
                    <div class="codetrail-form-group">
                        <label class="codetrail-label">🔗 Additional References</label>
                        <input type="text" id="codetrail-refs" class="codetrail-input" 
                            placeholder="LeetCode discussion link, article URL, etc." />
                    </div>
                    
                    <div class="codetrail-modal-actions">
                        <button class="codetrail-btn codetrail-btn-secondary" id="codetrail-skip">
                            Skip & Sync
                        </button>
                        <button class="codetrail-btn codetrail-btn-primary" id="codetrail-sync">
                            ✓ Sync with References
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Focus on first input
            setTimeout(() => {
                const youtubeInput = document.getElementById('codetrail-youtube');
                if (youtubeInput) youtubeInput.focus();
            }, 100);

            // Close handlers
            const closeModal = () => {
                overlay.remove();
                resolve(null);
            };

            // Skip handler (sync without references)
            const skipSync = () => {
                overlay.remove();
                resolve({ ...problemData, references: {} });
            };

            // Sync with references handler
            const syncWithRefs = () => {
                const references = {
                    youtube: document.getElementById('codetrail-youtube')?.value?.trim() || '',
                    approach: document.getElementById('codetrail-approach')?.value?.trim() || '',
                    notes: document.getElementById('codetrail-notes')?.value?.trim() || '',
                    additionalRefs: document.getElementById('codetrail-refs')?.value?.trim() || ''
                };
                overlay.remove();
                resolve({ ...problemData, references });
            };

            // Event listeners
            document.getElementById('codetrail-close').addEventListener('click', closeModal);
            document.getElementById('codetrail-skip').addEventListener('click', skipSync);
            document.getElementById('codetrail-sync').addEventListener('click', syncWithRefs);

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeModal();
            });

            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        });
    }

    // ============================================================
    // URL AND NAVIGATION OBSERVERS
    // ============================================================

    /**
     * Observe URL changes for submission detection
     */
    function observeURLChanges() {
        let lastUrl = location.href;

        // Observe pushState/replaceState
        const pushState = history.pushState;
        const replaceState = history.replaceState;

        history.pushState = function (...args) {
            pushState.apply(history, args);
            handleURLChange();
        };

        history.replaceState = function (...args) {
            replaceState.apply(history, args);
            handleURLChange();
        };

        // Observe popstate
        window.addEventListener('popstate', handleURLChange);

        function handleURLChange() {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                console.log('LeetHub: URL changed to', currentUrl);

                // Check if navigated to submission result page
                const submissionId = extractSubmissionIdFromUrl(currentUrl);
                if (submissionId) {
                    console.log('LeetHub: Detected submission ID from URL:', submissionId);
                    // Allow the page to load before checking
                    setTimeout(() => checkSubmissionFromId(submissionId), 1500);
                }
            }
        }
    }

    /**
     * Extract submission ID from URL
     */
    function extractSubmissionIdFromUrl(url) {
        const match = url.match(/\/submissions\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Check submission status using GraphQL when we have submission ID
     */
    async function checkSubmissionFromId(submissionId) {
        try {
            const details = await fetchSubmissionDetails(submissionId);

            if (details && details.statusCode === 10) { // 10 = Accepted
                console.log('LeetHub: GraphQL confirmed accepted submission');
                await processAcceptedSubmission(details, submissionId);
            }
        } catch (error) {
            console.error('LeetHub: Error checking submission from ID:', error);
        }
    }

    /**
     * Observe submission result containers with optimized targeting
     */
    function observePageAttributes() {
        const targetSelectors = [
            '[data-e2e-locator="submission-result"]',
            '.submission-result',
            '#submission-panel',
            '[class*="submission"]'
        ];

        const observeTarget = () => {
            for (const selector of targetSelectors) {
                const target = document.querySelector(selector);
                if (target) {
                    observeElement(target);
                    return;
                }
            }
            observeElement(document.body);
        };

        observeTarget();

        const navigationObserver = new MutationObserver(() => {
            if (window.location.pathname.includes('/submissions/')) {
                observeTarget();
            }
        });
        navigationObserver.observe(document.body, { childList: true, subtree: false });
    }

    /**
     * Observe a specific element with optimized configuration
     */
    function observeElement(target) {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            if (checkTimer) clearTimeout(checkTimer);
            if (rafId) cancelAnimationFrame(rafId);

            rafId = requestAnimationFrame(() => {
                checkTimer = setTimeout(checkForAcceptedStatus, 500);
            });
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }

    /**
     * Setup cleanup handlers
     */
    function setupCleanup() {
        window.addEventListener('beforeunload', () => {
            if (observer) observer.disconnect();
            if (checkTimer) clearTimeout(checkTimer);
            if (rafId) cancelAnimationFrame(rafId);
        });

        setInterval(() => {
            const now = Date.now();
            for (const [slug, timestamp] of syncedProblems.entries()) {
                if (now - timestamp > PROBLEM_CACHE_CLEANUP_MS) {
                    syncedProblems.delete(slug);
                }
            }
        }, PROBLEM_CACHE_CLEANUP_MS);
    }

    // ============================================================
    // GRAPHQL API
    // ============================================================

    /**
     * Fetch submission details from LeetCode GraphQL API
     */
    async function fetchSubmissionDetails(submissionId) {
        try {
            const response = await fetch('https://leetcode.com/graphql/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: SUBMISSION_DETAILS_QUERY,
                    variables: { submissionId: parseInt(submissionId, 10) },
                }),
                credentials: 'include',
            });

            if (!response.ok) {
                console.error('LeetHub: GraphQL request failed:', response.status);
                return null;
            }

            const data = await response.json();

            if (data.errors) {
                console.error('LeetHub: GraphQL errors:', data.errors);
                return null;
            }

            return data.data?.submissionDetails || null;
        } catch (error) {
            console.error('LeetHub: Error fetching submission details:', error);
            return null;
        }
    }

    // ============================================================
    // SUBMISSION DETECTION AND PROCESSING
    // ============================================================

    async function checkForAcceptedStatus() {
        const startTime = performance.now();
        const isAccepted = detectAcceptedStatus();

        if (isAccepted) {
            console.log('LeetHub: Accepted status detected. Preparing to notify...');

            // Try to get submission ID from URL first
            const submissionId = extractSubmissionIdFromUrl(window.location.href);

            if (submissionId) {
                // Use GraphQL API for accurate data
                const details = await fetchSubmissionDetails(submissionId);
                if (details) {
                    await processAcceptedSubmission(details, submissionId);
                    return;
                }
            }

            // Fallback to DOM extraction
            const problemData = await extractProblemData();
            if (problemData) {
                await sendToBackground(problemData);
            }
        }

        const elapsed = performance.now() - startTime;
        if (elapsed > 100) {
            console.warn(`LeetHub: Slow detection (${elapsed.toFixed(2)}ms)`);
        }
    }

    /**
     * Process accepted submission from GraphQL data
     */
    async function processAcceptedSubmission(details, submissionId) {
        const question = details.question;
        const problemSlug = question.titleSlug;
        const now = Date.now();

        // Check cooldown
        const lastSyncTime = syncedProblems.get(problemSlug);
        if (lastSyncTime && (now - lastSyncTime < COOLDOWN_MS)) {
            console.log('LeetHub: Problem recently synced, skipping...');
            return;
        }

        syncedProblems.set(problemSlug, now);

        // Format folder name with leading zeros
        const number = question.questionId;
        const formattedNum = number.padStart(4, '0');
        const folderName = `${formattedNum}-${question.titleSlug}`;

        // Get language extension
        const langName = details.lang?.name || details.lang?.verboseName || 'Unknown';
        const langExt = languages[langName] || `.${langName.toLowerCase()}`;

        // Build problem data
        const problemData = {
            title: question.title,
            number: number,
            difficulty: question.difficulty,
            tags: question.topicTags?.map(t => t.name) || [],
            code: details.code,
            language: langName,
            url: `https://leetcode.com/problems/${problemSlug}/`,
            problemSlug,
            folderName,
            description: question.content,
            submissionId,
            runtime: details.runtimeDisplay,
            runtimePercentile: details.runtimePercentile,
            memory: details.memoryDisplay,
            memoryPercentile: details.memoryPercentile,
            timestamp: details.timestamp
        };

        // Show modal for adding reference materials
        console.log('CodeTrail: Showing sync modal...');
        const enrichedData = await showSyncModal(problemData);

        if (!enrichedData) {
            console.log('CodeTrail: Sync cancelled by user');
            syncedProblems.delete(problemSlug);
            return;
        }

        // Generate README with references included
        enrichedData.readme = generateReadmeWithRefs(question, details, enrichedData.references);

        await sendToBackground(enrichedData);
    }

    /**
     * Generate README content for a problem
     */
    function generateReadme(question, submission) {
        const difficultyBadge = {
            Easy: '🟢 Easy',
            Medium: '🟡 Medium',
            Hard: '🔴 Hard',
        };

        const topicTags = question.topicTags
            ? question.topicTags.map(tag => `\`${tag.name}\``).join(' ')
            : '';

        let readme = `# ${question.title}\n\n`;
        readme += `**Difficulty**: ${difficultyBadge[question.difficulty] || question.difficulty}\n\n`;

        if (topicTags) {
            readme += `**Topics**: ${topicTags}\n\n`;
        }

        readme += `---\n\n`;
        readme += `## Problem\n\n`;

        // Clean HTML from content
        const cleanContent = question.content
            ? question.content
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim()
            : '*Problem description not available*';

        readme += cleanContent + '\n\n';

        readme += `---\n\n`;
        readme += `## Solution\n\n`;
        readme += `**Language**: ${submission.lang?.verboseName || submission.lang?.name || 'Unknown'}\n\n`;

        if (submission.runtimeDisplay) {
            readme += `**Runtime**: ${submission.runtimeDisplay}`;
            if (submission.runtimePercentile) {
                readme += ` (Beats ${submission.runtimePercentile.toFixed(2)}%)`;
            }
            readme += '\n\n';
        }

        if (submission.memoryDisplay) {
            readme += `**Memory**: ${submission.memoryDisplay}`;
            if (submission.memoryPercentile) {
                readme += ` (Beats ${submission.memoryPercentile.toFixed(2)}%)`;
            }
            readme += '\n\n';
        }

        readme += `---\n\n`;
        const date = submission.timestamp
            ? new Date(submission.timestamp * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();
        readme += `*Solved on: ${date}*\n`;
        readme += `\n*Auto-synced by [CodeTrail](https://github.com/ThivakarSP/CodeTrail)*`;

        return readme;
    }

    /**
     * Generate README content with reference materials
     */
    function generateReadmeWithRefs(question, submission, references = {}) {
        const difficultyBadge = {
            Easy: '🟢 Easy',
            Medium: '🟡 Medium',
            Hard: '🔴 Hard',
        };

        const topicTags = question.topicTags
            ? question.topicTags.map(tag => `\`${tag.name}\``).join(' ')
            : '';

        let readme = `# ${question.title}\n\n`;
        readme += `**Difficulty**: ${difficultyBadge[question.difficulty] || question.difficulty}\n\n`;

        if (topicTags) {
            readme += `**Topics**: ${topicTags}\n\n`;
        }

        // Add approach if provided
        if (references.approach) {
            readme += `**Approach**: ${references.approach}\n\n`;
        }

        readme += `---\n\n`;
        readme += `## Problem\n\n`;

        // Clean HTML from content
        const cleanContent = question.content
            ? question.content
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim()
            : '*Problem description not available*';

        readme += cleanContent + '\n\n';

        readme += `---\n\n`;
        readme += `## Solution\n\n`;
        readme += `**Language**: ${submission.lang?.verboseName || submission.lang?.name || 'Unknown'}\n\n`;

        if (submission.runtimeDisplay) {
            readme += `**Runtime**: ${submission.runtimeDisplay}`;
            if (submission.runtimePercentile) {
                readme += ` (Beats ${submission.runtimePercentile.toFixed(2)}%)`;
            }
            readme += '\n\n';
        }

        if (submission.memoryDisplay) {
            readme += `**Memory**: ${submission.memoryDisplay}`;
            if (submission.memoryPercentile) {
                readme += ` (Beats ${submission.memoryPercentile.toFixed(2)}%)`;
            }
            readme += '\n\n';
        }

        // Add references section if any provided
        const hasRefs = references.youtube || references.notes || references.additionalRefs;
        if (hasRefs) {
            readme += `---\n\n`;
            readme += `## References\n\n`;

            if (references.youtube) {
                readme += `📺 **Video Explanation**: [Watch on YouTube](${references.youtube})\n\n`;
            }

            if (references.notes) {
                readme += `📝 **Notes**:\n${references.notes}\n\n`;
            }

            if (references.additionalRefs) {
                readme += `🔗 **Additional Resources**: ${references.additionalRefs}\n\n`;
            }
        }

        readme += `---\n\n`;
        const date = submission.timestamp
            ? new Date(submission.timestamp * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();
        readme += `*Solved on: ${date}*\n`;
        readme += `\n*Auto-synced by [CodeTrail](https://github.com/ThivakarSP/CodeTrail)*`;

        return readme;
    }

    /**
     * Send problem data to background script
     */
    async function sendToBackground(problemData) {
        try {
            await chrome.runtime.sendMessage({
                type: 'SUBMISSION_DETECTED',
                data: problemData
            });
            console.log('LeetHub: Notification request sent.');
        } catch (error) {
            console.error('LeetHub: Failed to send message to background:', error);

            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('⚠️ LeetHub: Extension was reloaded. Please refresh this page (F5) to reconnect.');
                const shouldReload = confirm(
                    '⚠️ LeetHub Extension\n\n' +
                    'The extension was recently reloaded/updated.\n' +
                    'The connection needs to be refreshed.\n\n' +
                    'Click OK to reload this page now, or Cancel to reload manually later.\n\n' +
                    '(Your submission was detected but couldn\'t be synced yet.)'
                );
                if (shouldReload) {
                    window.location.reload();
                    return;
                }
            }

            syncedProblems.delete(problemData.problemSlug);
        }
    }

    function detectAcceptedStatus() {
        const successElements = document.querySelectorAll('.text-green-500, .text-success, .text-olive');
        for (const el of successElements) {
            if (el.textContent.trim() === 'Accepted') return true;
        }

        const statusText = document.querySelector('span[data-e2e-locator="submission-result"]');
        if (statusText && statusText.textContent.trim() === 'Accepted') return true;

        return false;
    }

    // ============================================================
    // FALLBACK DOM EXTRACTION (when GraphQL unavailable)
    // ============================================================

    async function extractProblemData() {
        const code = extractCode();
        if (!code) return null;

        const { title, number } = extractTitleAndNumber();
        if (!title) return null;

        const language = extractLanguage() || 'Unknown';
        const difficulty = extractDifficulty() || 'Unknown';
        const tags = extractTags() || [];
        const problemSlug = getProblemSlug();
        const description = extractProblemDescription();

        const formattedNum = number && /^\d+$/.test(number)
            ? number.padStart(4, '0')
            : null;
        const folderName = formattedNum
            ? `${formattedNum}-${toFolderName(title)}`
            : toFolderName(title);

        return {
            title,
            number,
            difficulty,
            tags,
            code,
            language,
            url: `https://leetcode.com/problems/${problemSlug}/`,
            problemSlug,
            folderName,
            description
        };
    }

    function extractTitleAndNumber() {
        const titleLink = document.querySelector('div.flex.items-center.gap-2 > a[href*="/problems/"]');
        if (titleLink) {
            const text = titleLink.innerText;
            const match = text.match(/^(\d+)\.\s*(.+)/);
            if (match) return { number: match[1], title: match[2] };
            return { number: null, title: text };
        }

        const docTitle = document.title;
        const docMatch = docTitle.match(/^(\d+)\.\s*(.+?) -/);
        if (docMatch) return { number: docMatch[1], title: docMatch[2] };

        const slug = getProblemSlug();
        const formatted = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return { number: null, title: formatted };
    }

    function extractCode() {
        const lines = document.querySelectorAll('.view-line');
        if (lines.length > 0) {
            const code = Array.from(lines).map(l => {
                const text = l.innerText || l.textContent || '';
                return text.replace(/\u00A0/g, ' ');
            }).join('\n');

            if (code.trim().length > 0) {
                console.log(`LeetHub: Extracted ${code.split('\n').length} lines from Monaco editor`);
                return code;
            }
        }

        const editorContainer = document.querySelector('.monaco-editor .view-lines');
        if (editorContainer) {
            const code = editorContainer.innerText || editorContainer.textContent || '';
            if (code.trim().length > 0) {
                console.log('LeetHub: Extracted code from editor container');
                return code.replace(/\u00A0/g, ' ');
            }
        }

        const pre = document.querySelector('pre');
        if (pre) {
            console.log('LeetHub: Extracted code from pre tag');
            return pre.innerText || pre.textContent || '';
        }

        const ta = document.querySelector('textarea[name="code"]');
        if (ta && ta.value) {
            console.log('LeetHub: Extracted code from textarea');
            return ta.value;
        }

        console.error('LeetHub: Could not extract code from page');
        return null;
    }

    function extractLanguage() {
        const el = document.querySelector('[data-cy="lang-select"] span');
        if (el) {
            return normalizeLang(el.innerText.trim());
        }

        const pill = document.querySelector('div.text-xs.font-medium.text-label-1');
        if (pill) {
            return normalizeLang(pill.innerText.trim());
        }

        const params = new URLSearchParams(window.location.search);
        const urlLang = params.get('lang');
        if (urlLang) {
            return normalizeLang(urlLang);
        }

        return 'Unknown';
    }

    function normalizeLang(lang) {
        if (!lang) return 'Unknown';
        lang = lang.trim().replace(/\s*\d+(\.\d+)*$/i, '');
        const normalized = lang.toLowerCase().replace(/\s+/g, '');

        const langMap = {
            'java': 'Java',
            'python': 'Python',
            'python3': 'Python3',
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'c++': 'C++',
            'cpp': 'C++',
            'c': 'C',
            'c#': 'C#',
            'csharp': 'C#',
            'go': 'Go',
            'golang': 'Go',
            'ruby': 'Ruby',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'scala': 'Scala',
            'rust': 'Rust',
            'php': 'PHP',
            'sql': 'SQL',
            'mysql': 'MySQL',
            'bash': 'Bash',
            'shell': 'Shell'
        };

        return langMap[normalized] || lang;
    }

    function extractDifficulty() {
        if (document.querySelector('.text-olive') || document.querySelector('.text-green-500')) return 'Easy';
        if (document.querySelector('.text-yellow') || document.querySelector('.text-yellow-500')) return 'Medium';
        if (document.querySelector('.text-pink') || document.querySelector('.text-red-500')) return 'Hard';
        return 'Unknown';
    }

    function extractProblemDescription() {
        try {
            const descriptionSelectors = [
                '[data-track-load="description_content"]',
                '.elfjS[data-track-load="description_content"]',
                '.description__24sA',
                'div[class*="description"]',
                '.content__u3I1'
            ];

            let descriptionElement = null;
            for (const selector of descriptionSelectors) {
                descriptionElement = document.querySelector(selector);
                if (descriptionElement) break;
            }

            if (!descriptionElement) {
                return 'Problem description not available. Please view on LeetCode.';
            }

            const clone = descriptionElement.cloneNode(true);
            clone.querySelectorAll('button, .topicTags, .seeMore').forEach(el => el.remove());

            let description = clone.innerHTML;

            description = description
                .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                .replace(/<i>(.*?)<\/i>/gi, '*$1*')
                .replace(/<code>(.*?)<\/code>/gi, '`$1`')
                .replace(/<pre>(.*?)<\/pre>/gis, '\n```\n$1\n```\n')
                .replace(/<p>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<ul>/gi, '\n')
                .replace(/<\/ul>/gi, '\n')
                .replace(/<ol>/gi, '\n')
                .replace(/<\/ol>/gi, '\n')
                .replace(/<li>/gi, '- ')
                .replace(/<\/li>/gi, '\n')
                .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
                .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
                .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\n\s*\n\s*\n/g, '\n\n')
                .trim();

            return description || 'Problem description not available.';
        } catch (error) {
            console.error('LeetHub: Failed to extract problem description:', error);
            return 'Problem description not available. Please view on LeetCode.';
        }
    }

    function extractTags() { return []; }

    function getProblemSlug() {
        const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
        return match ? match[1] : 'unknown';
    }

    function toFolderName(title) {
        return title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    }

    // ============================================================
    // LISTEN FOR BACKGROUND MESSAGES
    // ============================================================

    // Listen for sync status updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SYNC_STATUS') {
            if (message.status === 'syncing') {
                showSpinner(message.message || 'Syncing to GitHub...');
            } else if (message.status === 'success') {
                hideSpinner();
                showSuccessBadge(message.message || '✓ Synced to GitHub');
            } else if (message.status === 'error') {
                hideSpinner();
                showErrorBadge(message.message || '✗ Sync failed');
            }
        }
        return true;
    });

    // ============================================================
    // START
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
