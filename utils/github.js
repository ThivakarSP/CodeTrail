// GitHub API Utility Module - Optimized with Git Data API
// Handles all GitHub operations using batch commits for performance

import { LANGUAGES } from './constants.js';
import { getProblemIndex, saveProblemIndex } from './storage.js';
import { appendVersionToReadme } from './readme.js';
import { githubFetch } from './api.js';

// ====================================================================================
// SESSION STORAGE HELPERS (MV3 Persistent State)
// ====================================================================================

/**
 * Get value from session storage
 * @param {string} key
 * @returns {Promise<any>}
 */
async function getSession(key) {
  try {
    const result = await chrome.storage.session.get([key]);
    return result[key];
  } catch (e) {
    console.warn('CodeTrail: Session storage access failed', e);
    return null;
  }
}

/**
 * Set value in session storage
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
async function setSession(key, value) {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch (e) {
    console.warn('CodeTrail: Session storage write failed', e);
  }
}

// ====================================================================================
// CORE GITHUB FUNCTIONS
// ====================================================================================

/**
 * Test connection to GitHub with provided credentials
 * @param {Object} config - { username, repo, token }
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
export async function testConnection(config) {
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${config.username}/${config.repo}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'CodeTrail-Extension',
        },
      }
    );

    if (response.status === 401) {
      return { success: false, error: 'Invalid token. Please check your Personal Access Token.' };
    }

    if (response.status === 404) {
      return { success: false, error: `Repository "${config.username}/${config.repo}" not found. If it's private, ensure your token has 'repo' scope.` };
    }

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || 'Unknown error' };
    }

    // Cache the default branch
    const repoData = await response.json();
    const branch = repoData.default_branch || 'main';
    await setSession(`branch_${config.username}_${config.repo}`, branch);

    return { success: true };
  } catch (error) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

/**
 * Check if a file/folder already exists in the repository
 */
export async function checkFileExists(config, folderName) {
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${config.username}/${config.repo}/contents/${folderName}`,
      {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Get repository default branch with caching
 */
async function getDefaultBranch(config) {
  const cacheKey = `branch_${config.username}_${config.repo}`;
  const cached = await getSession(cacheKey);
  if (cached) return cached;

  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${config.username}/${config.repo}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) return 'main'; // Fallback if repo not found or other error

    const data = await response.json();
    const branch = data.default_branch || 'main'; // GitHub usually returns this
    await setSession(cacheKey, branch);
    return branch;
  } catch (error) {
    console.error('CodeTrail: Failed to fetch default branch', error);
    return 'main';
  }
}

/**
 * Get file content from repository
 */
async function getFileContent(config, path) {
  const { username, repo, token } = config;
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}?t=${Date.now()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.content) return null;

    return atob(data.content.replace(/\n/g, ''));
  } catch (error) {
    return null;
  }
}

/**
 * Get next version number for a problem
 */
async function getNextVersion(config, folderName, extension) {
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${config.username}/${config.repo}/contents/${folderName}?t=${Date.now()}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status !== 200) return 1;

    const files = await response.json();
    if (!Array.isArray(files)) return 1;

    const versionPattern = new RegExp(`-v(\\d+)\\.${extension}$`, 'i');
    const solutionPattern = new RegExp(`\\.(${extension})$`, 'i');

    let maxVersion = 0;
    let hasBaseFile = false;

    for (const file of files) {
      if (file.type === 'file' && solutionPattern.test(file.name) && file.name !== 'README.md') {
        const match = file.name.match(versionPattern);
        if (match) {
          maxVersion = Math.max(maxVersion, parseInt(match[1], 10));
        } else {
          hasBaseFile = true;
        }
      }
    }

    if (maxVersion > 0) return maxVersion + 1;
    if (hasBaseFile) return 2;
    return 1;
  } catch (error) {
    return 1;
  }
}

// ====================================================================================
// GIT DATA API (BATCH COMMIT) LOGIC
// ====================================================================================

async function createBlob(config, content) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/blobs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
        encoding: 'utf-8',
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create blob: ${response.status}`);
  const data = await response.json();
  return data.sha;
}

async function getLatestCommitSha(config, branch) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/ref/heads/${branch}?t=${Date.now()}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
    }
  );

  if (!response.ok) throw new Error(`Failed to get ref: ${response.status}`);
  const data = await response.json();
  return data.object.sha;
}

async function getCommitTreeSha(config, commitSha) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/commits/${commitSha}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
    }
  );

  if (!response.ok) throw new Error(`Failed to get commit: ${response.status}`);
  const data = await response.json();
  return data.tree.sha;
}

async function createTree(config, baseTreeSha, files) {
  // Create blobs for all files in parallel
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blobSha = await createBlob(config, file.content);
      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      };
    })
  );

  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/trees`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_tree: baseTreeSha || undefined,
        tree: treeItems,
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create tree: ${response.status}`);
  const data = await response.json();
  return data.sha;
}

async function createCommit(config, message, treeSha, parents = []) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/commits`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        tree: treeSha,
        parents: parents,
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create commit: ${response.status}`);
  const data = await response.json();
  return data.sha;
}

async function updateRef(config, branch, newCommitSha) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sha: newCommitSha }),
    }
  );

  if (!response.ok) throw new Error(`Failed to update ref: ${response.status}`);
  return await response.json();
}

async function createRef(config, branch, sha) {
  const response = await githubFetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/refs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: sha
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create ref: ${response.status}`);
  return await response.json();
}

/**
 * Execute atomic batch commit
 */
async function commitBatch(config, files, message) {
  const branch = await getDefaultBranch(config);
  
  let latestCommitSha = null;
  let baseTreeSha = null;
  
  try {
    latestCommitSha = await getLatestCommitSha(config, branch);
    baseTreeSha = await getCommitTreeSha(config, latestCommitSha);
  } catch (error) {
    if (error.message.includes('404')) {
      console.log('CodeTrail: Branch not found. Assuming empty repository (initial commit).');
    } else {
      throw error;
    }
  }

  const newTreeSha = await createTree(config, baseTreeSha, files);
  
  const parents = latestCommitSha ? [latestCommitSha] : [];
  const newCommitSha = await createCommit(config, message, newTreeSha, parents);
  
  if (latestCommitSha) {
    await updateRef(config, branch, newCommitSha);
  } else {
    await createRef(config, branch, newCommitSha);
  }
  
  return newCommitSha;
}

// ====================================================================================
// MAIN SYNC LOGIC
// ====================================================================================

export async function pushToGitHub(config, submission) {
  const { title, number, difficulty, tags, code, language, folderName } = submission;

  if (!folderName) throw new Error('Missing folder name for sync');
  if (!code) throw new Error('No code to sync');

  const lockKey = `lock_${config.username}_${config.repo}_${folderName}`;
  const isLocked = await getSession(lockKey);
  if (isLocked) {
    throw new Error('Sync already in progress for this problem.');
  }

  // Acquire lock
  await setSession(lockKey, Date.now());

  try {
    const extension = getFileExtension(language);
    const version = await getNextVersion(config, folderName, extension);

    const filesToCommit = [];
    const commitSummary = [];

    // 1. Solution File
    const notesMethod = submission.references?.method
      ? submission.references.method.replace(/[^a-zA-Z0-9-_]/g, '')
      : null;

    let solutionFilename = `${folderName}.${extension}`;
    if (version > 1 || notesMethod) {
      if (notesMethod) {
        solutionFilename = `${folderName}-${notesMethod}-v${version}.${extension}`;
      } else {
        solutionFilename = `${folderName}-v${version}.${extension}`;
      }
    }

    filesToCommit.push({
      path: `${folderName}/${solutionFilename}`,
      content: code,
    });
    commitSummary.push('Solution');

    // 2. Problem README
    const readmePath = `${folderName}/README.md`;
    let readmeContent;

    if (version > 1) {
      const existing = await getFileContent(config, readmePath);
      if (existing) {
        readmeContent = appendVersionToReadme(existing, submission, version);
      } else {
        readmeContent = submission.readme; // Already generated by content script
      }
    } else {
      readmeContent = submission.readme;
    }

    filesToCommit.push({
      path: readmePath,
      content: readmeContent,
    });
    commitSummary.push('README');

    // 3. Main README
    const problemIndex = await getProblemIndex();

    // Update local index
    problemIndex[folderName] = {
      folderName,
      title,
      number,
      difficulty,
      tags: (tags || []).map((t) => (typeof t === 'string' ? t : t.name)).sort(),
      url: submission.url,
    };
    await saveProblemIndex(problemIndex);

    const mainReadmeContent = generateMainReadme(problemIndex, config.repo);
    filesToCommit.push({
      path: 'README.md',
      content: mainReadmeContent,
    });
    commitSummary.push('Main README');

    // Execute Batch Commit
    const commitMsg = generateCommitMessage(submission, version, commitSummary);
    await commitBatch(config, filesToCommit, commitMsg);

    console.log(`CodeTrail: Successfully synced ${folderName} (v${version})`);
  } finally {
    // Release lock
    await chrome.storage.session.remove([lockKey]);
  }
}

// ====================================================================================
// HELPERS
// ====================================================================================

function getFileExtension(language) {
  const langLower = (language || '').toLowerCase().trim().replace(/^\./, '');
  for (const [name, ext] of Object.entries(LANGUAGES)) {
    const cleanExt = ext.replace('.', '');
    if (name.toLowerCase() === langLower || cleanExt === langLower) {
      return cleanExt;
    }
  }
  return 'txt';
}

function generateCommitMessage(submission, version, components) {
  const { runtime, runtimePercentile, memory, memoryPercentile } = submission;
  let stats = [];

  if (runtime && runtimePercentile) {
    stats.push(
      `Time: ${runtime} (${typeof runtimePercentile === 'number' ? runtimePercentile.toFixed(2) : runtimePercentile}%)`
    );
  }
  if (memory && memoryPercentile) {
    stats.push(
      `Space: ${memory} (${typeof memoryPercentile === 'number' ? memoryPercentile.toFixed(2) : memoryPercentile}%)`
    );
  }

  const statsStr = stats.length > 0 ? stats.join(' | ') : 'Solved';
  const title = `${submission.title} [${submission.difficulty}]`;

  return `${statsStr} - ${title} - CodeTrail`;
}

function generateMainReadme(problemIndex, repoName) {
  const problems = Object.values(problemIndex);
  const topicMap = new Map();

  for (const problem of problems) {
    const tags = problem.tags || [];
    if (tags.length === 0) {
      if (!topicMap.has('Other')) topicMap.set('Other', []);
      topicMap.get('Other').push(problem);
    } else {
      for (const tag of tags) {
        if (!topicMap.has(tag)) topicMap.set(tag, []);
        topicMap.get(tag).push(problem);
      }
    }
  }

  const sortedTopics = Array.from(topicMap.keys()).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  let content = `# ${repoName || 'Leetcode-Answers'}\n\nA collection of LeetCode questions to ace the coding interview! - Synced using [CodeTrail](https://github.com/ThivakarSP/CodeTrail)\n\n## LeetCode Topics\n\n`;

  for (const topic of sortedTopics) {
    const topicProblems = topicMap.get(topic);
    topicProblems.sort((a, b) => a.folderName.localeCompare(b.folderName));

    content += `### ${topic}\n`;
    for (const problem of topicProblems) {
      content += `- [${problem.folderName}](./${problem.folderName})\n`;
    }
    content += `\n`;
  }
  return content;
}
