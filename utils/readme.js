/**
 * Centralized README Generation Logic
 *Eliminates duplication between background.js, content.js, and github.js
 */

/**
 * Generate README content for a problem
 * @param {Object} data - Problem data
 * @returns {string} Markdown content
 */
export function generateReadme(data) {
  const {
    title,
    titleSlug,
    difficulty,
    tags,
    language,
    runtime,
    runtimePercentile,
    memory,
    memoryPercentile,
    timestamp,
    references,
    readmeDescription,
    description, // Fallback if readmeDescription not present
  } = data;

  const difficultyBadge = {
    Easy: '🟢 Easy',
    Medium: '🟡 Medium',
    Hard: '🔴 Hard',
  };

  // Handle tags: could be array of strings or array of objects {name, slug}
  let topicTags = '';
  if (tags && Array.isArray(tags)) {
    topicTags = tags
      .map((tag) => {
        const name = typeof tag === 'string' ? tag : tag.name;
        return `\`${name}\``;
      })
      .join(' ');
  }

  // Build LeetCode URL
  const leetcodeUrl = `https://leetcode.com/problems/${titleSlug}/`;

  // Clickable heading linking to LeetCode
  let readme = `# [${title}](${leetcodeUrl})\n\n`;
  readme += `**Difficulty**: ${difficultyBadge[difficulty] || difficulty || 'Unknown'}\n\n`;

  if (topicTags) {
    readme += `**Topics**: ${topicTags}\n\n`;
  }

  // Add approach if provided (from sync window)
  if (references && references.method) {
    readme += `**Approach**: ${references.method}\n\n`;
  } else if (references && references.approach) {
    // Handle key variation
    readme += `**Approach**: ${references.approach}\n\n`;
  }

  readme += `---\n\n`;
  readme += `## Problem\n\n`;

  // Use the pre-formatted description passed from content script, or fallback
  const desc = readmeDescription || description || '*Problem description not available*';
  readme += desc + '\n\n';

  readme += `---\n\n`;
  readme += `## Solution\n\n`;
  readme += `**Language**: ${language || 'Unknown'}\n\n`;

  if (runtime) {
    readme += `**Runtime**: \`${runtime}\``;
    if (runtimePercentile) {
      readme += ` (Beats ${typeof runtimePercentile === 'number' ? runtimePercentile.toFixed(2) : runtimePercentile}%)`;
    }
    readme += '\n\n';
  }

  if (memory) {
    readme += `**Memory**: \`${memory}\``;
    if (memoryPercentile) {
      readme += ` (Beats ${typeof memoryPercentile === 'number' ? memoryPercentile.toFixed(2) : memoryPercentile}%)`;
    }
    readme += '\n\n';
  }

  // Add references section if any provided
  const hasRefs =
    references && (references.youtube || references.notes || references.additionalRefs);
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
  const date = timestamp
    ? new Date(timestamp).toLocaleDateString()
    : new Date().toLocaleDateString();
  readme += `*Solved on: ${date}*\n`;
  readme += `\n*Auto-synced by [CodeTrail](https://github.com/ThivakarSP/CodeTrail)*`;

  return readme;
}

/**
 * Append a new version to an existing README
 * @param {string} existingContent - Current README content
 * @param {Object} submission - Submission data
 * @param {number} version - Version number
 * @returns {string} Updated README content
 */
export function appendVersionToReadme(existingContent, submission, version) {
  const date = new Date().toLocaleDateString();
  let versionSection = `\n---\n\n## Version ${version}\n\n**Language**: ${submission.language || 'Unknown'}\n\n`;

  if (submission.runtime) {
    versionSection += `**Runtime**: \`${submission.runtime}\``;
    if (submission.runtimePercentile) {
      versionSection += ` (${typeof submission.runtimePercentile === 'number' ? submission.runtimePercentile.toFixed(2) : submission.runtimePercentile}%)`;
    }
    versionSection += '\n\n';
  }

  if (submission.memory) {
    versionSection += `**Memory**: \`${submission.memory}\``;
    if (submission.memoryPercentile) {
      versionSection += ` (${typeof submission.memoryPercentile === 'number' ? submission.memoryPercentile.toFixed(2) : submission.memoryPercentile}%)`;
    }
    versionSection += '\n\n';
  }

  versionSection += `*Solved on: ${date}*\n`;

  const refs = submission.references || {};
  if (refs.youtube || refs.notes || refs.approach || refs.method || refs.additionalRefs) {
    versionSection += `\n### References (v${version})\n\n`;

    const method = refs.method || refs.approach;
    if (method) versionSection += `**Approach**: ${method}\n\n`;

    if (refs.youtube) versionSection += `**Video**: [Watch on YouTube](${refs.youtube})\n\n`;
    if (refs.notes) versionSection += `**Notes**:\n${refs.notes}\n\n`;
    if (refs.additionalRefs) versionSection += `**Resources**: ${refs.additionalRefs}\n\n`;
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
