// GitHub API Utility Module
// Handles all GitHub operations using the Contents API

// Cache for branch detection and file SHAs
const branchCache = new Map(); // Map<"username/repo", branchName>
const shaCache = new Map(); // Map<path, {sha, timestamp}>
const SHA_CACHE_TTL = 300000; // 5 minute TTL for SHA cache (optimized)

// Operation locking to prevent race conditions
const activePushes = new Set();

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

/**
 * Test connection to GitHub with provided credentials
 * @param {Object} config - { username, repo, token }
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
export async function testConnection(config) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${config.username}/${config.repo}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetHub-Extension'
                }
            }
        );

        if (response.status === 401) {
            return { success: false, error: 'Invalid token. Please check your Personal Access Token.' };
        }

        if (response.status === 404) {
            return { success: false, error: `Repository "${config.username}/${config.repo}" not found.` };
        }

        if (!response.ok) {
            const data = await response.json();
            return { success: false, error: data.message || 'Unknown error' };
        }

        // Cache the default branch while we're here
        const repoData = await response.json();
        if (repoData.default_branch) {
            branchCache.set(`${config.username}/${config.repo}`, repoData.default_branch);
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: `Network error: ${error.message}` };
    }
}

/**
 * Check if a file/folder already exists in the repository
 * @param {Object} config - { username, repo, token }
 * @param {string} folderName - The folder name to check
 * @returns {Promise<boolean>}
 */
export async function checkFileExists(config, folderName) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${config.username}/${config.repo}/contents/${folderName}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetHub-Extension'
                }
            }
        );

        return response.status === 200;
    } catch (error) {
        return false;
    }
}

/**
 * Get existing solution files in a folder to determine next version number
 * @param {Object} config - { username, repo, token }
 * @param {string} folderPath - Folder path in repo
 * @param {string} extension - File extension
 * @returns {Promise<number>} - Next version number (1 if no existing files)
 */
async function getNextVersion(config, folderPath, extension) {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${config.username}/${config.repo}/contents/${folderPath}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetHub-Extension'
                }
            }
        );

        if (response.status !== 200) {
            return 1; // Folder doesn't exist, start at v1
        }

        const files = await response.json();
        if (!Array.isArray(files)) {
            return 1;
        }

        // Find all solution files matching pattern: name.ext or name-v{n}.ext
        const solutionPattern = new RegExp(`\\.(${extension})$`, 'i');
        const versionPattern = new RegExp(`-v(\\d+)\\.${extension}$`, 'i');

        let maxVersion = 0;
        let hasBaseFile = false;

        for (const file of files) {
            if (file.type === 'file' && solutionPattern.test(file.name) && file.name !== 'README.md') {
                const versionMatch = file.name.match(versionPattern);
                if (versionMatch) {
                    maxVersion = Math.max(maxVersion, parseInt(versionMatch[1], 10));
                } else if (solutionPattern.test(file.name)) {
                    // Base file without version exists
                    hasBaseFile = true;
                }
            }
        }

        if (maxVersion > 0) {
            return maxVersion + 1;
        } else if (hasBaseFile) {
            return 2; // Base file exists, next is v2
        }
        return 1; // First submission
    } catch (error) {
        console.error('Error getting version:', error);
        return 1;
    }
}

/**
 * Get file SHA (required for updates) with caching
 * @param {Object} config - { username, repo, token }
 * @param {string} path - File path in repo
 * @returns {Promise<string|null>}
 */
async function getFileSha(config, path) {
    // Check cache first
    const cached = shaCache.get(path);
    if (cached && (Date.now() - cached.timestamp < SHA_CACHE_TTL)) {
        return cached.sha;
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${config.username}/${config.repo}/contents/${path}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetHub-Extension'
                }
            }
        );

        if (response.ok) {
            const data = await response.json();
            // Cache the SHA
            shaCache.set(path, {
                sha: data.sha,
                timestamp: Date.now()
            });
            return data.sha;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get file content from repository
 * @param {Object} config - { username, repo, token }
 * @param {string} path - File path in repo
 * @returns {Promise<string>}
 */
async function getFileContent(config, path) {
    const { username, repo, token } = config;
    const branch = await getDefaultBranch(config);

    const response = await fetch(
        `https://api.github.com/repos/${username}/${repo}/contents/${path}?ref=${branch}`,
        {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );

    if (!response.ok) {
        throw new Error('File not found');
    }

    const data = await response.json();
    // Decode base64 content
    return atob(data.content.replace(/\n/g, ''));
}

/**
 * Get repository default branch with caching
 * @param {Object} config - { username, repo, token }
 * @returns {Promise<string>}
 */
async function getDefaultBranch(config) {
    const cacheKey = `${config.username}/${config.repo}`;

    // Check cache first
    if (branchCache.has(cacheKey)) {
        return branchCache.get(cacheKey);
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${config.username}/${config.repo}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetHub-Extension'
                }
            }
        );

        if (response.ok) {
            const data = await response.json();
            const branch = data.default_branch || 'main';
            branchCache.set(cacheKey, branch);
            return branch;
        }
    } catch (error) {
        console.error('Failed to detect default branch:', error);
    }

    // Fallback to 'main'
    return 'main';
}

/**
 * Create or update a file in the repository
 * @param {Object} config - { username, repo, token }
 * @param {string} path - File path
 * @param {string} content - File content
 * @param {string} message - Commit message
 * @returns {Promise<Object>}
 */
async function createOrUpdateFile(config, path, content, message) {
    // Get default branch
    const branch = await getDefaultBranch(config);

    // Check if file exists and get SHA
    const sha = await getFileSha(config, path);

    // Proper UTF-8 to Base64 encoding (handles emojis correctly)
    const utf8Bytes = new TextEncoder().encode(content);
    let binaryString = '';
    // Process in chunks to avoid stack overflow for large files
    const chunkSize = 8192;
    for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
        const chunk = utf8Bytes.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, chunk);
    }
    const base64Content = btoa(binaryString);

    const body = {
        message: message,
        content: base64Content,
        branch: branch
    };

    // Include SHA if updating existing file
    if (sha) {
        body.sha = sha;
    }

    // Try with exponential backoff
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${config.username}/${config.repo}/contents/${path}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${config.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'LeetHub-Extension'
                    },
                    body: JSON.stringify(body)
                }
            );

            if (response.status === 401) {
                throw new Error('GitHub authentication failed. Please check your token.');
            }

            if (response.status === 403) {
                const data = await response.json();
                if (data.message && data.message.includes('rate limit')) {
                    // Don't retry on rate limit
                    throw new Error('GitHub API rate limit exceeded. Please try again later.');
                }
                throw new Error('Access forbidden. Make sure your token has repo access.');
            }

            if (response.status === 404) {
                throw new Error('Repository not found. Please check your settings.');
            }

            if (response.ok) {
                // Invalidate SHA cache for this path
                shaCache.delete(path);
                return await response.json();
            }

            // For other errors, parse and maybe retry
            const data = await response.json();
            const errorMsg = data.message || 'Failed to push to repository';

            // Don't retry on 422 (Unprocessable Entity) - usually bad data
            if (response.status === 422) {
                throw new Error(errorMsg);
            }

            // Retry on server errors (5xx) or conflict (409)
            if (attempt < MAX_RETRIES - 1 && (response.status >= 500 || response.status === 409)) {
                const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
                console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            throw new Error(errorMsg);
        } catch (error) {
            if (attempt === MAX_RETRIES - 1) {
                throw error;
            }
            // Retry on network errors
            if (error.message.includes('fetch') || error.message.includes('network')) {
                const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
                console.log(`Network error, retrying after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Generate commit message with runtime and memory stats
 * @param {Object} submission 
 * @returns {string}
 */
function generateCommitMessage(submission) {
    const { runtime, runtimePercentile, memory, memoryPercentile } = submission;

    // Format: "Time: 2 ms (98.9%), Space: 45 MB (20.58%) - CodeTrail"
    let parts = [];

    if (runtime && runtimePercentile) {
        parts.push(`Time: ${runtime} (${runtimePercentile.toFixed(2)}%)`);
    } else if (runtime) {
        parts.push(`Time: ${runtime}`);
    }

    if (memory && memoryPercentile) {
        parts.push(`Space: ${memory} (${memoryPercentile.toFixed(2)}%)`);
    } else if (memory) {
        parts.push(`Space: ${memory}`);
    }

    if (parts.length > 0) {
        return `${parts.join(', ')} - CodeTrail`;
    }

    return 'Sync solution - CodeTrail';
}

/**
 * Push a LeetCode submission to GitHub
 * @param {Object} config - { username, repo, token }
 * @param {Object} submission - Problem data
 * @returns {Promise<void>}
 */
export async function pushToGitHub(config, submission) {
    const { title, number, difficulty, tags, code, language, url, folderName } = submission;

    // Operation locking to prevent race conditions
    const lockKey = `${config.username}/${config.repo}/${folderName}`;
    if (activePushes.has(lockKey)) {
        throw new Error('A push operation is already in progress for this problem. Please wait.');
    }

    activePushes.add(lockKey);

    try {
        // Determine file extension based on language
        const extension = getFileExtension(language);

        // Get next version number for this problem
        const version = await getNextVersion(config, folderName, extension);

        // Create solution filename:
        // v1: folderName.ext (e.g., 0001-two-sum.java)
        // v2+: folderName-v{n}.ext (e.g., 0001-two-sum-v2.java)
        let solutionFilename;
        if (version === 1) {
            solutionFilename = `${folderName}.${extension}`;
        } else {
            solutionFilename = `${folderName}-v${version}.${extension}`;
        }

        const solutionPath = `${folderName}/${solutionFilename}`;

        // Generate commit message with runtime/memory stats
        const commitMsg = generateCommitMessage(submission);

        await createOrUpdateFile(config, solutionPath, code, commitMsg);

        // Always update README file with version info and references
        const readmePath = `${folderName}/README.md`;
        let readmeContent;

        if (version === 1) {
            // First version: use full readme from content.js or generate one
            readmeContent = submission.readme || generateReadme(submission, folderName);
        } else {
            // Subsequent versions: fetch existing README and append new version info
            try {
                const existingContent = await getFileContent(config, readmePath);
                readmeContent = appendVersionToReadme(existingContent, submission, version);
            } catch (e) {
                // If README doesn't exist for some reason, create it
                readmeContent = submission.readme || generateReadme(submission, folderName);
            }
        }

        const readmeCommitMsg = version === 1
            ? `Create README - CodeTrail`
            : `Update README with v${version} - CodeTrail`;

        await createOrUpdateFile(config, readmePath, readmeContent, readmeCommitMsg);

        // Update main README with topic index
        await updateMainReadme(config, submission);
    } finally {
        // Always release the lock
        activePushes.delete(lockKey);
    }
}

/**
 * Get file extension for a programming language
 * @param {string} language 
 * @returns {string}
 */
function getFileExtension(language) {
    const extensions = {
        // Exact matches from normalizeLang
        'Java': 'java',
        'Python': 'py',
        'Python3': 'py',
        'JavaScript': 'js',
        'TypeScript': 'ts',
        'C++': 'cpp',
        'C': 'c',
        'C#': 'cs',
        'Go': 'go',
        'Ruby': 'rb',
        'Swift': 'swift',
        'Kotlin': 'kt',
        'Scala': 'scala',
        'Rust': 'rs',
        'PHP': 'php',
        'SQL': 'sql',
        'MySQL': 'sql',
        'Bash': 'sh',
        'Shell': 'sh',
        // Lowercase fallbacks
        'python': 'py',
        'python3': 'py',
        'java': 'java',
        'javascript': 'js',
        'typescript': 'ts',
        'c++': 'cpp',
        'cpp': 'cpp',
        'c': 'c',
        'c#': 'cs',
        'csharp': 'cs',
        'go': 'go',
        'golang': 'go',
        'ruby': 'rb',
        'swift': 'swift',
        'kotlin': 'kt',
        'scala': 'scala',
        'rust': 'rs',
        'php': 'php',
        'sql': 'sql',
        'mysql': 'sql',
        'postgresql': 'sql',
        'mssql': 'sql',
        'bash': 'sh',
        'shell': 'sh',
        'r': 'r',
        'dart': 'dart',
        'elixir': 'ex',
        'erlang': 'erl',
        'racket': 'rkt'
    };

    const langLower = (language || '').toLowerCase().trim();
    const ext = extensions[language] || extensions[langLower] || 'txt';

    console.log(`LeetHub: Language "${language}" -> Extension ".${ext}"`);
    return ext;
}

/**
 * Generate README.md content for a problem
 * @param {Object} submission 
 * @param {string} folderName - Folder name for file reference
 * @returns {string}
 */
function generateReadme(submission, folderName) {
    const { title, number, difficulty, url, description, runtime, runtimePercentile, memory, memoryPercentile, tags } = submission;

    // Create clickable title linking to LeetCode problem
    const displayTitle = number ? `${number}. ${title}` : title;
    const leetcodeUrl = url || `https://leetcode.com/problems/${folderName.replace(/^\d+-/, '')}/`;

    // Build stats section
    let stats = '';
    if (runtime && memory) {
        const runtimePct = runtimePercentile ? ` (${runtimePercentile.toFixed(2)}%)` : '';
        const memoryPct = memoryPercentile ? ` (${memoryPercentile.toFixed(2)}%)` : '';
        stats = `\n\n**Runtime:** ${runtime}${runtimePct} | **Memory:** ${memory}${memoryPct}`;
    }

    // Build tags section
    let tagsSection = '';
    if (tags && tags.length > 0) {
        const tagBadges = tags.map(tag => {
            const tagName = typeof tag === 'string' ? tag : tag.name;
            const tagSlug = typeof tag === 'string' ? tag.toLowerCase().replace(/\s+/g, '-') : tag.slug;
            return `![${tagName}](https://img.shields.io/badge/${encodeURIComponent(tagName)}-blue)`;
        }).join(' ');
        tagsSection = `\n\n${tagBadges}`;
    }

    return `# [${displayTitle}](${leetcodeUrl})

**${difficulty}**${stats}${tagsSection}

---

${description || ''}
`;
}

/**
 * Append new version info to existing README
 * Preserves existing references and adds new version's references
 * @param {string} existingContent - Current README content
 * @param {Object} submission - New submission data
 * @param {number} version - Version number
 * @returns {string}
 */
function appendVersionToReadme(existingContent, submission, version) {
    // Handle timestamp - detect if it's in seconds or milliseconds
    let date;
    if (submission.timestamp) {
        // If timestamp is less than 10 billion, it's in seconds; otherwise milliseconds
        const ts = submission.timestamp < 10000000000
            ? submission.timestamp * 1000
            : submission.timestamp;
        date = new Date(ts).toLocaleDateString();
    } else {
        date = new Date().toLocaleDateString();
    }

    // Build new version section
    let versionSection = `\n---\n\n## Version ${version}\n\n`;
    versionSection += `**Language**: ${submission.language || 'Unknown'}\n\n`;

    if (submission.runtimeDisplay) {
        versionSection += `**Runtime**: ${submission.runtimeDisplay}`;
        if (submission.runtimePercentile) {
            versionSection += ` (Beats ${submission.runtimePercentile.toFixed(2)}%)`;
        }
        versionSection += '\n\n';
    }

    if (submission.memoryDisplay) {
        versionSection += `**Memory**: ${submission.memoryDisplay}`;
        if (submission.memoryPercentile) {
            versionSection += ` (Beats ${submission.memoryPercentile.toFixed(2)}%)`;
        }
        versionSection += '\n\n';
    }

    versionSection += `*Solved on: ${date}*\n`;

    // Add new references if provided
    const refs = submission.references || {};
    const hasNewRefs = refs.youtube || refs.notes || refs.approach || refs.additionalRefs;

    if (hasNewRefs) {
        versionSection += `\n### References (v${version})\n\n`;

        if (refs.approach) {
            versionSection += `**Approach**: ${refs.approach}\n\n`;
        }
        if (refs.youtube) {
            versionSection += `📺 **Video**: [Watch on YouTube](${refs.youtube})\n\n`;
        }
        if (refs.notes) {
            versionSection += `📝 **Notes**:\n${refs.notes}\n\n`;
        }
        if (refs.additionalRefs) {
            versionSection += `🔗 **Resources**: ${refs.additionalRefs}\n\n`;
        }
    }

    // Find where to insert - before the footer line
    const footerMatch = existingContent.match(/\n\*Auto-synced by \[CodeTrail\]/);

    if (footerMatch) {
        const insertPos = footerMatch.index;
        return existingContent.slice(0, insertPos) + versionSection + existingContent.slice(insertPos);
    }

    // If no footer found, append at end
    return existingContent + versionSection + '\n*Auto-synced by [CodeTrail](https://github.com/ThivakarSP/CodeTrail)*';
}

// getDifficultyColor removed - was unused

/**
 * Get markdown badge for difficulty
 * @param {string} difficulty 
 * @returns {string}
 */
function getDifficultyBadge(difficulty) {
    const colors = {
        'easy': '00b8a3',
        'medium': 'ffc01e',
        'hard': 'ff375f'
    };

    const color = colors[(difficulty || '').toLowerCase()] || '808080';
    return `![Difficulty](https://img.shields.io/badge/${difficulty}-${color}?style=for-the-badge)`;
}

/**
 * Update the main README.md with problems organized by topic
 * @param {Object} config - { username, repo, token }
 * @param {Object} newSubmission - The newly synced submission
 */
async function updateMainReadme(config, newSubmission) {
    try {
        // Get existing problem index from storage
        const problemIndex = await getProblemIndex();

        // Add/update the new problem in index
        const { folderName, title, number, difficulty, tags, url } = newSubmission;
        problemIndex[folderName] = {
            folderName,
            title,
            number,
            difficulty,
            tags: (tags || []).map(t => typeof t === 'string' ? t : t.name),
            url
        };

        // Save updated index
        await saveProblemIndex(problemIndex);

        // Generate main README content
        const readmeContent = generateMainReadme(problemIndex, config.repo);

        // Update README.md in repo
        await createOrUpdateFile(config, 'README.md', readmeContent, 'Update README Topic Tags - CodeTrail');

        console.log('LeetHub: Main README updated successfully');
    } catch (error) {
        console.error('LeetHub: Failed to update main README:', error);
        // Don't throw - main README update is not critical
    }
}

/**
 * Get problem index from local storage
 */
async function getProblemIndex() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['leethub_problem_index'], (result) => {
            resolve(result.leethub_problem_index || {});
        });
    });
}

/**
 * Save problem index to local storage
 */
async function saveProblemIndex(index) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ leethub_problem_index: index }, resolve);
    });
}

/**
 * Generate main README.md content with topics
 * @param {Object} problemIndex - Map of folderName -> problem data
 * @param {string} repoName - Repository name for title
 * @returns {string}
 */
function generateMainReadme(problemIndex, repoName) {
    const problems = Object.values(problemIndex);

    // Group problems by topic
    const topicMap = new Map();

    for (const problem of problems) {
        const tags = problem.tags || [];
        if (tags.length === 0) {
            // Problems without tags go to "Other"
            if (!topicMap.has('Other')) {
                topicMap.set('Other', []);
            }
            topicMap.get('Other').push(problem);
        } else {
            // Add problem to each of its tags
            for (const tag of tags) {
                if (!topicMap.has(tag)) {
                    topicMap.set(tag, []);
                }
                topicMap.get(tag).push(problem);
            }
        }
    }

    // Sort topics alphabetically, but keep "Other" at the end
    const sortedTopics = Array.from(topicMap.keys()).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
    });

    // Build README content - simple format like user's example
    let content = `# ${repoName || 'Leetcode-Answers'}

A collection of LeetCode questions to ace the coding interview! - Synced using [CodeTrail](https://github.com/ThivakarSP/CodeTrail)

## LeetCode Topics

`;

    // Add each topic section with simple list
    for (const topic of sortedTopics) {
        const topicProblems = topicMap.get(topic);

        // Sort problems by folder name (which includes number)
        topicProblems.sort((a, b) => {
            return a.folderName.localeCompare(b.folderName);
        });

        content += `### ${topic}\n`;

        for (const problem of topicProblems) {
            content += `- [${problem.folderName}](./${problem.folderName})\n`;
        }

        content += `\n`;
    }

    return content;
}

