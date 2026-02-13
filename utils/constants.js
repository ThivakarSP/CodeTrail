// Centralized Constants for CodeTrail
// Reduces duplication and improves maintainability

/** Supported languages and their file extensions */
export const LANGUAGES = Object.freeze({
  C: '.c',
  'C++': '.cpp',
  'C#': '.cs',
  Dart: '.dart',
  Elixir: '.ex',
  Erlang: '.erl',
  Go: '.go',
  Java: '.java',
  JavaScript: '.js',
  Javascript: '.js', // Handle casing variations
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
  Typescript: '.ts', // Handle casing variations
  R: '.r',
  Bash: '.sh',
  Shell: '.sh',
});

/** DOM Selectors for scraping (Fallbacks for when GraphQL isn't enough) */
export const SELECTORS = Object.freeze({
  SUBMISSION_RESULT: [
    '[data-e2e-locator="submission-result"]',
    '.submission-result',
    '#submission-panel',
    '[class*="submission"]',
  ],
  CHECK_SUCCESS_CLASSES: [
    '.text-green-500',
    '.text-success',
    '.text-olive',
    '.green-text',
    'span[class*="text-green"]'
  ],
  CHECK_SUCCESS_ATTRIBUTES: [
    'span[data-e2e-locator="submission-result"]',
    '[data-e2e-locator="submission-result"]',
    '.submission-result .status',
    '#submission-app .status'
  ],
  CODE_CONTAINERS: [
    '.view-line',
    '.monaco-editor .view-lines',
    'pre',
    'textarea[name="code"]'
  ],
  TITLE_LINK: 'div.flex.items-center.gap-2 > a[href*="/problems/"]',
  LANG_SELECT: [
    '[data-cy="lang-select"] span',
    'div.text-xs.font-medium.text-label-1'
  ],
  DIFFICULTY: {
    EASY: ['.text-olive', '.text-green-500'],
    MEDIUM: ['.text-yellow', '.text-yellow-500'],
    HARD: ['.text-pink', '.text-red-500']
  },
  DESCRIPTION: [
    '[data-track-load="description_content"]',
    '.elfjS[data-track-load="description_content"]',
    '.description__24sA',
    'div[class*="description"]',
    '.content__u3I1'
  ],
  TAGS: [
    'a[href^="/tag/"]',
    '.topic-tag__1jni',
    'div[class*="topic-tag"]',
    'a[class*="topic-tag"]'
  ]
});

/** Configuration Defaults */
export const DEFAULTS = Object.freeze({
  SYNC_DELAY: 1000, // Delay between syncs in ms
  CACHE_TTL: 300000, // 5 minutes
  MAX_RETRIES: 3,
  RETRY_DELAY: 500,
});
