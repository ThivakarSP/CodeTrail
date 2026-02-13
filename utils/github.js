// GitHub API Utility Module - Optimized with Git Data API
// Handles all GitHub operations using batch commits for performance

import { LANGUAGES } from './constants.js';
import { getProblemIndex, saveProblemIndex } from './storage.js';

// Cache for branch detection and file SHAs
const branchCache = new Map(); // Map<"username/repo", branchName>
const activePushes = new Set(); // Operation locking

/**
 * Test connection to GitHub with provided credentials
 * @param {Object} config - { username, repo, token }
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
export async function testConnection(config) {
  try {
    const response = await fetch(`https://api.github.com/repos/${config.username}/${config.repo}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CodeTrail-Extension',
      },
    });

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

    // Cache the default branch
    const repoData = await response.json();
    const branch = repoData.default_branch || 'main';
    branchCache.set(`${config.username}/${config.repo}`, branch);

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
    const response = await fetch(
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
  const cacheKey = `${config.username}/${config.repo}`;
  if (branchCache.has(cacheKey)) {
    return branchCache.get(cacheKey);
  }
  return 'main';
}

/**
 * Get file content from repository
 */
async function getFileContent(config, path) {
  const { username, repo, token } = config;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}?t=${Date.now()}`,
      {
        headers: {
          Authorization: `token ${token}`,
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
    const response = await fetch(
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
  const response = await fetch(
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
  const response = await fetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/ref/heads/${branch}?t=${Date.now()}`,
    {
      headers: { Authorization: `Bearer ${config.token}` }
    }
  );

  if (!response.ok) throw new Error(`Failed to get ref: ${response.status}`);
  const data = await response.json();
  return data.object.sha;
}

async function getCommitTreeSha(config, commitSha) {
  const response = await fetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/commits/${commitSha}`,
    {
      headers: { Authorization: `Bearer ${config.token}` }
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

  const response = await fetch(
    `https://api.github.com/repos/${config.username}/${config.repo}/git/trees`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create tree: ${response.status}`);
  const data = await response.json();
  return data.sha;
}

async function createCommit(config, message, treeSha, parentSha) {
  const response = await fetch(
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
        parents: [parentSha],
      }),
    }
  );

  if (!response.ok) throw new Error(`Failed to create commit: ${response.status}`);
  const data = await response.json();
  return data.sha;
}

async function updateRef(config, branch, newCommitSha) {
  const response = await fetch(
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

/**
 * Execute atomic batch commit
 */
async function commitBatch(config, files, message) {
  const branch = await getDefaultBranch(config);
  const latestCommitSha = await getLatestCommitSha(config, branch);
  const baseTreeSha = await getCommitTreeSha(config, latestCommitSha);
  const newTreeSha = await createTree(config, baseTreeSha, files);
  const newCommitSha = await createCommit(config, message, newTreeSha, latestCommitSha);
  await updateRef(config, branch, newCommitSha);
  return newCommitSha;
}

// ====================================================================================
// MAIN SYNC LOGIC
// ====================================================================================

export async function pushToGitHub(config, submission) {
  const { title, number, difficulty, tags, code, language, folderName } = submission;

  const lockKey = `${config.username}/${config.repo}/${folderName}`;
  if (activePushes.has(lockKey)) {
    throw new Error('Sync already in progress for this problem.');
  }
  activePushes.add(lockKey);

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
    activePushes.delete(lockKey);
  }
}

// ====================================================================================
// HELPERS
// ====================================================================================

function getFileExtension(language) {
  const langLower = (language || '').toLowerCase().trim();
  for (const [name, ext] of Object.entries(LANGUAGES)) {
    if (name.toLowerCase() === langLower) return ext.replace('.', '');
  }
  return 'txt';
}

function generateCommitMessage(submission, version, components) {
  const { runtime, runtimePercentile, memory, memoryPercentile } = submission;
  let stats = [];

  if (runtime && runtimePercentile) {
    stats.push(`Time: ${runtime} (${runtimePercentile.toFixed(2)}%)`);
  }
  if (memory && memoryPercentile) {
    stats.push(`Space: ${memory} (${memoryPercentile.toFixed(2)}%)`);
  }

  const statsStr = stats.length > 0 ? stats.join(' | ') : 'Solved';
  const title = `${submission.title} [${submission.difficulty}]`;

  return `${statsStr} - ${title} - CodeTrail`;
}

function appendVersionToReadme(existingContent, submission, version) {
  const date = new Date().toLocaleDateString();
  let versionSection = `\n---\n\n## Version ${version}\n\n**Language**: ${submission.language || 'Unknown'}\n\n`;

  if (submission.runtime) {
    versionSection += `**Runtime**: ${submission.runtime}`;
    if (submission.runtimePercentile) {
      versionSection += ` (${submission.runtimePercentile.toFixed(2)}%)`;
    }
    versionSection += '\n\n';
  }

  if (submission.memory) {
    versionSection += `**Memory**: ${submission.memory}`;
    if (submission.memoryPercentile) {
      versionSection += ` (${submission.memoryPercentile.toFixed(2)}%)`;
    }
    versionSection += '\n\n';
  }
  versionSection += `*Solved on: ${date}*\n`;

  const refs = submission.references || {};
  if (refs.youtube || refs.notes || refs.approach || refs.additionalRefs) {
    versionSection += `\n### References (v${version})\n\n`;
    if (refs.approach) versionSection += `**Approach**: ${refs.approach}\n\n`;
    if (refs.youtube) versionSection += `📺 **Video**: [Watch on YouTube](${refs.youtube})\n\n`;
    if (refs.notes) versionSection += `📝 **Notes**:\n${refs.notes}\n\n`;
    if (refs.additionalRefs) versionSection += `🔗 **Resources**: ${refs.additionalRefs}\n\n`;
  }

  const footerMatch = existingContent.match(/\n\*Auto-synced by \[CodeTrail\]/);
  if (footerMatch) {
    return (
      existingContent.slice(0, footerMatch.index) +
      versionSection +
      existingContent.slice(footerMatch.index)
    );
  }
  return (
    existingContent +
    versionSection +
    '\n*Auto-synced by [CodeTrail](https://github.com/ThivakarSP/CodeTrail)*'
  );
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
