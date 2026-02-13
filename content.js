// CodeTrail Content Script
// Detects accepted submissions and triggers background notification
// Enhanced with GraphQL API for accurate submission details

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.codeTrailInjected) return;
    window.codeTrailInjected = true;

    console.log('CodeTrail: Content script loaded (v7 - GraphQL Enhanced)');

    // ============================================================
    // CONSTANTS AND CONFIG
    // ============================================================

    // Dynamic Module Import for Content Scripts
    (async () => {
        try {
            const src = chrome.runtime.getURL('utils/constants.js');
            const { LANGUAGES, SELECTORS } = await import(src);

            // Proceed with initialization once modules are loaded
            init(LANGUAGES, SELECTORS);
        } catch (e) {
            console.error('LeetHub: Failed to load modules:', e);
        }
    })();

    // Helper to pass constants to remaining scope or attach to window
    // Ideally refactor init() to accept them

    // ============================================================
    // CONSTANTS AND CONFIG
    // ============================================================

    // We'll initialize these inside init() or pass them down

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

    // Module-scoped constants (populated by init)
    let LANGUAGES = {};
    let SELECTORS = {};

    // ============================================================
    // INITIALIZATION
    // ============================================================

    function init(languagesMap, selectorsMap) {
        // Prevent multiple injections
        LANGUAGES = languagesMap;
        SELECTORS = selectorsMap;

        console.log('CodeTrail: Content script loaded (v10 - Fixed)');

        observePageAttributes();
        injectModal();
        setupMessageListener();

        // Setup other observers
        setupCleanup();
        observeURLChanges();

        // Check for existing submission on load
        if (window.location.pathname.includes('/submissions/')) {
            setTimeout(checkForAcceptedStatus, 2000);
        }
    }

    // ============================================================
    // UI & NOTIFICATIONS
    // ============================================================

    function injectModal() {
        // Always remove old modal to ensure updates apply
        const oldModal = document.getElementById('codetrail-modal');
        if (oldModal) {
            oldModal.remove();
        }

        // Get saved position
        chrome.storage.local.get(['codetrail_modal_pos'], (result) => {
            const pos = result.codetrail_modal_pos;
            const modal = document.createElement('div');
            modal.id = 'codetrail-modal';

            // Default center styles
            let top = '50%';
            let left = '50%';
            let transform = 'translate(-50%, -50%)';

            // Override if saved position exists
            if (pos && pos.top && pos.left) {
                top = pos.top;
                left = pos.left;
                transform = 'none';
            }

            modal.style.cssText = `
                position: fixed;
                top: ${top};
                left: ${left};
                transform: ${transform};
                z-index: 2147483647;
                background: #1a1a2e;
                color: #fff;
                padding: 0;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                width: 400px;
                max-width: 90vw;
                border: 1px solid rgba(255,255,255,0.1);
                transition: opacity 0.3s ease;
                opacity: 0;
            `;

            modal.innerHTML = `
                <div id="codetrail-drag-handle" style="
                    padding: 12px;
                    cursor: move;
                    background: rgba(255,255,255,0.05);
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px 12px 0 0;
                    display: flex;
                    justify-content: flex-end;
                    align-items: center;
                ">
                    <span style="font-size: 12px; color: #666; margin-right: auto; padding-left: 8px;">::: Drag to move</span>
                    <button id="codetrail-maximize" style="background:none; border:none; color:#888; cursor:pointer; font-size:16px; padding:0 8px; margin-right: 4px;" title="Toggle Fullscreen">⛶</button>
                    <button id="codetrail-close" style="background:none; border:none; color:#888; cursor:pointer; font-size:16px; padding:0 4px;">&times;</button>
                </div>
                <div id="codetrail-main-body" style="padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; height: 100%; box-sizing: border-box;">
                    <div id="codetrail-icon-container" style="display: flex; justify-content: center; align-items: center; width: 40px; height: 40px; flex-shrink: 0;">
                        <div id="codetrail-spinner" style="
                            width: 24px; 
                            height: 24px; 
                            border: 3px solid rgba(255,255,255,0.3); 
                            border-top-color: #ffa116; 
                            border-radius: 50%; 
                            animation: spin 1s linear infinite;
                        "></div>
                        <div id="codetrail-success-icon" style="display: none; font-size: 32px;">✅</div>
                        <div id="codetrail-error-icon" style="display: none; font-size: 32px;">❌</div>
                    </div>
                    <div style="flex-shrink: 0;">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #ffa116;">CodeTrail</h3>
                        <p id="codetrail-status" style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9); line-height: 1.4;">Initializing...</p>
                    </div>
                    <div id="codetrail-content-area" style="width: 100%; text-align: left; display: none; flex: 1;"></div>
                </div>
                <style>
                    @keyframes spin { to { transform: rotate(360deg); } }
                </style>
            `;

            document.body.appendChild(modal);

            // Close handler
            document.getElementById('codetrail-close').onclick = () => {
                modal.style.display = 'none';
            };

            // Maximize Toggle
            const maximizeBtn = document.getElementById('codetrail-maximize');
            let isMaximized = false;
            let preMaxStyle = {};

            maximizeBtn.onclick = () => {
                isMaximized = !isMaximized;
                if (isMaximized) {
                    // Save current state
                    preMaxStyle = {
                        top: modal.style.top,
                        left: modal.style.left,
                        transform: modal.style.transform,
                        width: modal.style.width,
                        maxWidth: modal.style.maxWidth,
                        height: modal.style.height,
                        borderRadius: modal.style.borderRadius
                    };

                    // Apply fullscreen styles
                    modal.style.top = '50%';
                    modal.style.left = '50%';
                    modal.style.transform = 'translate(-50%, -50%)';
                    modal.style.width = '90vw';
                    modal.style.maxWidth = '1000px';
                    modal.style.height = '80vh';
                    modal.style.borderRadius = '8px';
                    maximizeBtn.innerHTML = '🗗'; // Minimize icon
                } else {
                    // Restore previous state
                    modal.style.top = preMaxStyle.top;
                    modal.style.left = preMaxStyle.left;
                    modal.style.transform = preMaxStyle.transform;
                    modal.style.width = preMaxStyle.width;
                    modal.style.maxWidth = preMaxStyle.maxWidth;
                    modal.style.height = 'auto'; // Reset height
                    modal.style.borderRadius = preMaxStyle.borderRadius;
                    maximizeBtn.innerHTML = '⛶'; // Maximize icon
                }
            };

            // Drag Logic
            const handle = document.getElementById('codetrail-drag-handle');
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            handle.onmousedown = (e) => {
                e.preventDefault();
                isDragging = true;

                startX = e.clientX;
                startY = e.clientY;

                const rect = modal.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                // Disable transition during drag
                modal.style.transition = 'none';
                modal.style.transform = 'none'; // Clear transform to switch to absolute positioning
            };

            document.onmousemove = (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                modal.style.left = `${initialLeft + dx}px`;
                modal.style.top = `${initialTop + dy}px`;
            };

            document.onmouseup = () => {
                if (!isDragging) return;
                isDragging = false;

                // Re-enable transition
                modal.style.transition = 'opacity 0.3s ease';

                // Save position
                chrome.storage.local.set({
                    codetrail_modal_pos: {
                        top: modal.style.top,
                        left: modal.style.left
                    }
                });
            };
        });
    }

    function showModal(status, message) {
        const modal = document.getElementById('codetrail-modal');
        if (!modal) return;

        const statusEl = document.getElementById('codetrail-status');
        const spinner = document.getElementById('codetrail-spinner');
        const successIcon = document.getElementById('codetrail-success-icon');
        const errorIcon = document.getElementById('codetrail-error-icon');

        statusEl.textContent = message;
        modal.style.display = 'block';

        // Force reflow
        void modal.offsetWidth;

        modal.style.opacity = '1';
        // Do NOT reset transform/top/left here to preserve user position

        // Reset icons
        spinner.style.display = 'none';
        successIcon.style.display = 'none';
        errorIcon.style.display = 'none';

        if (status === 'success') {
            successIcon.style.display = 'block';
            setTimeout(hideModal, 3000);
        } else if (status === 'error') {
            errorIcon.style.display = 'block';
            setTimeout(hideModal, 5000);
        } else {
            spinner.style.display = 'block';
            spinner.style.borderTopColor = '#ffa116'; // Orange (Syncing)
        }
    }

    function hideModal() {
        const modal = document.getElementById('codetrail-modal');
        if (!modal) return;

        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            // Reset state
            const spinner = document.getElementById('codetrail-spinner');
            const successIcon = document.getElementById('codetrail-success-icon');
            const errorIcon = document.getElementById('codetrail-error-icon');

            if (spinner) {
                spinner.style.display = 'block';
                spinner.style.borderTopColor = '#ffa116';
            }
            if (successIcon) successIcon.style.display = 'none';
            if (errorIcon) errorIcon.style.display = 'none';
        }, 300);
    }

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SYNC_STATUS') {
                showModal(message.status, message.message);
            }
        });
    }

    // ============================================================
    // MISSING HELPERS
    // ============================================================

    function showSyncModal(problemData) {
        return new Promise((resolve) => {
            const modal = document.getElementById('codetrail-modal');
            const spinner = document.getElementById('codetrail-spinner');
            const statusEl = document.getElementById('codetrail-status');
            const contentArea = document.getElementById('codetrail-content-area');

            if (!modal) {
                resolve(problemData);
                return;
            }

            // Hide spinner during input
            spinner.style.display = 'none';
            statusEl.textContent = 'Add Notes & References (Optional)';

            // Show content area
            contentArea.style.display = 'block';
            contentArea.innerHTML = `
                <div style="margin-top: 12px; display: flex; flex-direction: column; height: 100%;">
                    <div style="display: flex; gap: 12px;">
                        <div style="flex: 1;">
                             <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #aaa;">Method / Approach Name (Optional)</label>
                             <input id="codetrail-method" placeholder="e.g. Two Pointers, DFS, Brute Force" style="width: 100%; margin-bottom: 12px; padding: 10px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; font-size: 14px; box-sizing: border-box;">
                        </div>
                    </div>

                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #aaa;">Notes / Approach / Complexity</label>
                    <textarea id="codetrail-notes" placeholder="e.g. O(n) time using HashMap..." style="width: 100%; flex: 1; min-height: 60px; margin-bottom: 12px; padding: 10px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; font-size: 14px; box-sizing: border-box; resize: vertical;"></textarea>
                    
                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #aaa;">YouTube Link</label>
                    <input id="codetrail-youtube" placeholder="https://youtube.com/watch?v=..." style="width: 100%; margin-bottom: 16px; padding: 10px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; font-size: 14px; box-sizing: border-box;">
                    
                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: auto;">
                        <button id="codetrail-sync" style="padding: 8px 24px; border-radius: 6px; border: none; background: #ffa116; color: #000; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; width: 100%;">Sync to GitHub</button>
                    </div>
                </div>
            `;

            modal.style.display = 'block';
            modal.style.opacity = '1';
            // Do NOT reset transform/top/left here to preserve user position
            modal.style.pointerEvents = 'auto'; // Enable interaction

            const syncBtn = document.getElementById('codetrail-sync');
            const notesInput = document.getElementById('codetrail-notes');
            const methodInput = document.getElementById('codetrail-method');
            const youtubeInput = document.getElementById('codetrail-youtube');

            // Focus notes for convenience (or method if preferred, focusing notes for now)
            setTimeout(() => methodInput.focus(), 100);

            const finish = (references = {}) => {
                // Restore loading state
                contentArea.style.display = 'none';
                contentArea.innerHTML = '';
                spinner.style.display = 'block';
                statusEl.textContent = 'Syncing to GitHub...';
                modal.style.pointerEvents = 'none';
                resolve({
                    ...problemData,
                    references
                });
            };

            const cancel = () => {
                modal.style.opacity = '0';
                setTimeout(() => {
                    modal.style.display = 'none';
                    contentArea.style.display = 'none';
                    contentArea.innerHTML = '';
                }, 300);
                resolve(null); // Return null to abort sync
            };

            syncBtn.onclick = () => {
                const notes = notesInput.value.trim();
                const method = methodInput.value.trim();
                const youtube = youtubeInput.value.trim();

                const hasContent = notes || method || youtube;

                if (hasContent) {
                    finish({
                        notes,
                        method,
                        youtube
                    });
                } else {
                    finish({});
                }
            };

            // Close button now acts as the only "Cancel"
            const closeBtn = document.getElementById('codetrail-close');
            // We need to override the default close handler assigned in injectModal
            // to ensure it resolves the promise with null
            closeBtn.onclick = cancel;
        });
    }

    function setupCleanup() {
        // Cleanup if needed
    }

    function observeURLChanges() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if (url.includes('/submissions/')) {
                    setTimeout(checkForAcceptedStatus, 1000);
                }
            }
        }).observe(document, { subtree: true, childList: true });
    }

    function injectStyles() {
        // Styles injected via injectModal
    }

    /**
     * Observe submission result containers with optimized targeting
     */
    function observePageAttributes() {
        // Use the dynamically loaded selectors
        const targetSelectors = SELECTORS.SUBMISSION_RESULT;

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
            characterData: false,
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
                console.error('CodeTrail: GraphQL request failed:', response.status);
                return null;
            }

            const data = await response.json();

            if (data.errors) {
                console.error('CodeTrail: GraphQL errors:', data.errors);
                return null;
            }

            return data.data?.submissionDetails || null;
        } catch (error) {
            console.error('CodeTrail: Error fetching submission details:', error);
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
            console.log('CodeTrail: Accepted status detected. Preparing to notify...');

            const submissionId = extractSubmissionIdFromUrl(window.location.href);

            if (submissionId) {
                const details = await fetchSubmissionDetails(submissionId);
                if (details) {
                    await processAcceptedSubmission(details, submissionId);
                    return;
                }
            }
            const problemData = await extractProblemData();
            if (problemData) {
                await sendToBackground(problemData);
            }
        }

        const elapsed = performance.now() - startTime;
        if (elapsed > 100) {
            console.warn(`CodeTrail: Slow detection(${elapsed.toFixed(2)}ms)`);
        }
    }

    async function processAcceptedSubmission(details, submissionId) {
        const question = details.question;
        const problemSlug = question.titleSlug;
        const now = Date.now();

        // Check cooldown
        const lastSyncTime = syncedProblems.get(problemSlug);
        if (lastSyncTime && now - lastSyncTime < COOLDOWN_MS) {
            console.log('CodeTrail: Problem recently synced, skipping...');
            return;
        }

        syncedProblems.set(problemSlug, now);

        // Format folder name with leading zeros
        const number = question.questionId;
        const formattedNum = number.padStart(4, '0');
        const folderName = `${formattedNum}-${question.titleSlug}`;

        // Get language extension
        const langName = details.lang?.name || details.lang?.verboseName || 'Unknown';
        // Note: LANGUAGES loaded from module
        const langExt = LANGUAGES[langName] || `.${langName.toLowerCase()} `;

        // Build problem data
        const problemData = {
            title: question.title,
            number: number,
            difficulty: question.difficulty,
            tags: question.topicTags?.map((t) => t.name) || [],
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
            timestamp: details.timestamp,
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
            ? question.topicTags.map((tag) => `\`${tag.name}\``).join(' ')
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
     * Format problem content from HTML to proper markdown
     * Handles: code blocks, examples, images, and proper spacing
     */
    /**
     * Convert HTML to Markdown using DOMParser for robustness
     */
    function formatProblemContent(htmlContent) {
        if (!htmlContent) return '*Problem description not available*';

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // Remove unwanted elements
        doc.querySelectorAll('button, .topicTags, .seeMore').forEach(el => el.remove());

        function walk(node) {
            let result = '';

            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    result += child.textContent;
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const content = walk(child);
                    const tag = child.tagName.toLowerCase();

                    switch (tag) {
                        case 'strong':
                        case 'b':
                            result += `**${content}**`;
                            break;
                        case 'em':
                        case 'i':
                            result += `*${content}*`;
                            break;
                        case 'code':
                            result += `\`${content}\``;
                            break;
                        case 'pre':
                            result += `\n\`\`\`\n${child.textContent.trim()}\n\`\`\`\n`;
                            break;
                        case 'p':
                        case 'div':
                            result += `\n${content}\n`;
                            break;
                        case 'ul':
                        case 'ol':
                            result += `\n${content}\n`;
                            break;
                        case 'li':
                            result += `- ${content}\n`;
                            break;
                        case 'br':
                            result += '\n';
                            break;
                        case 'img':
                            const src = child.getAttribute('src');
                            if (src) result += `\n![Image](${src})\n`;
                            break;
                        case 'h1': result += `\n# ${content}\n`; break;
                        case 'h2': result += `\n## ${content}\n`; break;
                        case 'h3': result += `\n### ${content}\n`; break;
                        case 'h4': result += `\n#### ${content}\n`; break;
                        case 'h5': result += `\n##### ${content}\n`; break;
                        case 'h6': result += `\n###### ${content}\n`; break;
                        default:
                            result += content;
                    }
                }
            }
            return result;
        }

        let markdown = walk(doc.body);

        // Post-processing cleanup
        return markdown
            .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }

    /**
     * Generate README content with reference materials
     */
    function generateReadmeWithRefs(question, submission, references = {}) {
        const difficultyBadge = {
            Easy: 'Easy',
            Medium: 'Medium',
            Hard: 'Hard',
        };

        const topicTags = question.topicTags
            ? question.topicTags.map((tag) => `\`${tag.name}\``).join(' ')
            : '';

        // Build LeetCode URL
        const leetcodeUrl = `https://leetcode.com/problems/${question.titleSlug}/`;

        // Clickable heading linking to LeetCode
        let readme = `# [${question.title}](${leetcodeUrl})\n\n`;
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

        // Format content with proper markdown
        const formattedContent = formatProblemContent(question.content);
        readme += formattedContent + '\n\n';

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
                readme += `**Video Explanation**: [Watch on YouTube](${references.youtube})\n\n`;
            }

            if (references.notes) {
                readme += `**Notes**:\n${references.notes}\n\n`;
            }

            if (references.additionalRefs) {
                readme += `**Additional Resources**: ${references.additionalRefs}\n\n`;
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
                data: problemData,
            });
            console.log('CodeTrail: Notification request sent.');
        } catch (error) {
            console.error('CodeTrail: Failed to send message to background:', error);

            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn(
                    '⚠️ CodeTrail: Extension was reloaded. Please refresh this page (F5) to reconnect.'
                );
                const shouldReload = confirm(
                    '⚠️ CodeTrail Extension\n\n' +
                    'The extension was recently reloaded/updated.\n' +
                    'The connection needs to be refreshed.\n\n' +
                    'Click OK to reload this page now, or Cancel to reload manually later.\n\n' +
                    "(Your submission was detected but couldn't be synced yet.)"
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
        // Check by class names for color (common in LeetCode)
        const successElements = document.querySelectorAll(SELECTORS.CHECK_SUCCESS_CLASSES.join(', '));

        for (const el of successElements) {
            if (el.textContent.trim() === 'Accepted') return true;
        }

        // Check by specific data attributes
        const statusSelectors = SELECTORS.CHECK_SUCCESS_ATTRIBUTES;

        for (const sel of statusSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim() === 'Accepted') return true;
        }


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

        const formattedNum = number && /^\d+$/.test(number) ? number.padStart(4, '0') : null;
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
            description,
        };
    }

    function extractTitleAndNumber() {
        const titleLink = document.querySelector(SELECTORS.TITLE_LINK);
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
        const formatted = slug
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        return { number: null, title: formatted };
    }

    function extractCode() {
        // Try each container in order
        // SELECTORS.CODE_CONTAINERS: ['.view-line', '.monaco-editor .view-lines', 'pre', 'textarea[name="code"]']

        // 1. Monaco Editor (Lines)
        const lines = document.querySelectorAll(SELECTORS.CODE_CONTAINERS[0]);
        if (lines.length > 0) {
            const code = Array.from(lines)
                .map((l) => {
                    const text = l.innerText || l.textContent || '';
                    return text.replace(/\u00A0/g, ' ');
                })
                .join('\n');

            if (code.trim().length > 0) {
                console.log(`CodeTrail: Extracted ${code.split('\n').length} lines from Monaco editor`);
                return code;
            }
        }

        // 2. Monaco Editor (Container)
        const editorContainer = document.querySelector(SELECTORS.CODE_CONTAINERS[1]);
        if (editorContainer) {
            const code = editorContainer.innerText || editorContainer.textContent || '';
            if (code.trim().length > 0) {
                console.log('CodeTrail: Extracted code from editor container');
                return code.replace(/\u00A0/g, ' ');
            }
        }

        // 3. Pre tag
        const pre = document.querySelector(SELECTORS.CODE_CONTAINERS[2]);
        if (pre) {
            console.log('CodeTrail: Extracted code from pre tag');
            return pre.innerText || pre.textContent || '';
        }

        // 4. Textarea
        const ta = document.querySelector(SELECTORS.CODE_CONTAINERS[3]);
        if (ta && ta.value) {
            console.log('CodeTrail: Extracted code from textarea');
            return ta.value;
        }

        console.error('CodeTrail: Could not extract code from page');
        return null;
    }

    function extractLanguage() {
        const el = document.querySelector(SELECTORS.LANG_SELECT[0]);
        if (el) {
            return normalizeLang(el.innerText.trim());
        }

        const pill = document.querySelector(SELECTORS.LANG_SELECT[1]);
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
            java: 'Java',
            python: 'Python',
            python3: 'Python3',
            javascript: 'JavaScript',
            typescript: 'TypeScript',
            'c++': 'C++',
            cpp: 'C++',
            c: 'C',
            'c#': 'C#',
            csharp: 'C#',
            go: 'Go',
            golang: 'Go',
            ruby: 'Ruby',
            swift: 'Swift',
            kotlin: 'Kotlin',
            scala: 'Scala',
            rust: 'Rust',
            php: 'PHP',
            sql: 'SQL',
            mysql: 'MySQL',
            bash: 'Bash',
            shell: 'Shell',
        };

        return langMap[normalized] || lang;
    }

    function extractDifficulty() {
        for (const selector of SELECTORS.DIFFICULTY.EASY) {
            if (document.querySelector(selector)) return 'Easy';
        }
        for (const selector of SELECTORS.DIFFICULTY.MEDIUM) {
            if (document.querySelector(selector)) return 'Medium';
        }
        for (const selector of SELECTORS.DIFFICULTY.HARD) {
            if (document.querySelector(selector)) return 'Hard';
        }
        return 'Unknown';
    }

    function extractProblemDescription() {
        try {
            let descriptionElement = null;
            for (const selector of SELECTORS.DESCRIPTION) {
                descriptionElement = document.querySelector(selector);
                if (descriptionElement) break;
            }

            if (!descriptionElement) {
                return 'Problem description not available. Please view on LeetCode.';
            }

            return formatProblemContent(descriptionElement.innerHTML);
        } catch (error) {
            console.error('CodeTrail: Failed to extract problem description:', error);
            return 'Problem description not available. Please view on LeetCode.';
        }
    }

    function extractTags() {
        try {
            let tags = [];
            for (const selector of SELECTORS.TAGS) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    elements.forEach(el => {
                        const tag = el.innerText || el.textContent;
                        if (tag) tags.push(tag.trim());
                    });
                    break;
                }
            }

            // Remove duplicates
            return [...new Set(tags)];
        } catch (e) {
            console.error('CodeTrail: Error extracting tags', e);
            return [];
        }
    }

    function getProblemSlug() {
        const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
        return match ? match[1] : 'unknown';
    }

    function toFolderName(title) {
        if (!title) return 'unknown-problem';
        return title
            .trim()
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
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

    function extractSubmissionIdFromUrl(url) {
        const match = url.match(/\/submissions\/(\d+)/);
        return match ? match[1] : null;
    }

    // ============================================================
    // START
    // ============================================================

    // Initialization is handled by the async IIFE at the top
    // requiring dynamic imports. We do NOT need to call init() here manually
    // as it would miss the required constants.
})();
