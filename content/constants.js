/**
 * Shared Constants for CodeTrail (Content Script Version)
 * Attaches to window.CodeTrail.Constants
 */

(function (window) {
  window.CodeTrail = window.CodeTrail || {};

  window.CodeTrail.Constants = {
    LANGUAGES: {
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
      R: '.r',
      Bash: '.sh',
      Shell: '.sh',
    },
    SELECTORS: {
      SUBMISSION_RESULT: [
        '[data-e2e-locator="submission-result"]',
        '.submission-result',
        '#submission-panel'
      ],
      CHECK_SUCCESS_CLASSES: [
        '.text-green-500',
        '.text-success',
        '.text-olive',
        '.green-text',
        'span[class*="text-green"]',
      ],
      CODE_CONTAINERS: ['.view-line', '.monaco-editor .view-lines', 'pre', 'textarea[name="code"]'],
      TITLE_LINK: 'div.flex.items-center.gap-2 > a[href*="/problems/"]',
      LANG_SELECT: ['[data-cy="lang-select"] span', 'div.text-xs.font-medium.text-label-1'],
      DIFFICULTY: {
        EASY: ['.text-olive', '.text-green-500'],
        MEDIUM: ['.text-yellow', '.text-yellow-500'],
        HARD: ['.text-pink', '.text-red-500'],
      },
      DESCRIPTION: [
        '[data-track-load="description_content"]',
        '.elfjS[data-track-load="description_content"]',
        '.description__24sA',
        'div[class*="description"]',
        '.content__u3I1',
      ],
      TAGS: [
        'a[href^="/tag/"]',
        '.topic-tag__1jni',
        'div[class*="topic-tag"]',
        'a[class*="topic-tag"]',
      ],
    },
  };
})(window);
