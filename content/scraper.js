(function (window) {
  window.CodeTrail = window.CodeTrail || {};

  const CodeTrail = window.CodeTrail;

  // Helper to find first matching element from array of selectors
  function queryFirst(selectors) {
    if (!selectors) return null;
    if (typeof selectors === 'string') return document.querySelector(selectors);
    if (Array.isArray(selectors)) {
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }
    }
    return null;
  }

  // Helper to find all matching elements from array of selectors
  function queryAll(selectors) {
    if (!selectors) return [];
    if (typeof selectors === 'string') return Array.from(document.querySelectorAll(selectors));
    if (Array.isArray(selectors)) {
      // Try strategy: return from first selector that matches anything
      for (const s of selectors) {
        const els = document.querySelectorAll(s);
        if (els.length > 0) return Array.from(els);
      }
    }
    return [];
  }

  const scraper = {
    /**
     * Detect if the submission was accepted
     * @param {Object} selectors - SELECTORS object
     * @returns {boolean}
     */
    detectAcceptedStatus(selectors) {
      const resultSelectors = selectors.SUBMISSION_RESULT || [];

      // Strategy 1: Find result container and check text
      const resultContainer = queryFirst(resultSelectors);
      if (resultContainer) {
        const text = resultContainer.innerText || '';
        if (text.includes('Accepted') || text.includes('Success')) return true;
      }

      // Check URL for direct submission page
      if (window.location.href.includes('/submissions/')) {
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Status: Accepted') || bodyText.includes('Accepted')) {
          // Be careful with false positives on submissions list page
          if (document.querySelector('.text-green-500, .text-success')) {
            return true;
          }
        }
      }

      return false;
    },

    /**
     * Extract all problem data from the page
     */
    extractProblemData(selectors, languages) {
      // Don't cache body text globally to avoid memory leaks
      const bodyText = document.body.innerText;

      const titleElement = document.querySelector(selectors.TITLE_LINK); // Use TITLE_LINK
      const title = titleElement
        ? titleElement.innerText.split('.').pop().trim()
        : 'Unknown Problem';
      const number = titleElement ? titleElement.innerText.split('.')[0].trim() : '';

      const titleSlug = this.getProblemSlug();

      // Difficulty
      let difficulty = 'Unknown';
      if (selectors.DIFFICULTY) {
        if (queryFirst(selectors.DIFFICULTY.EASY)) difficulty = 'Easy';
        else if (queryFirst(selectors.DIFFICULTY.MEDIUM)) difficulty = 'Medium';
        else if (queryFirst(selectors.DIFFICULTY.HARD)) difficulty = 'Hard';
      }

      // Tags
      const tags = this.extractTags(selectors);

      // Code
      const { code, language } = this.extractCode(selectors, languages);

      // Description
      const { description, readmeDescription } = this.extractProblemDescription(selectors);

      // Stats
      // Pass bodyText explicitly to avoid global cache
      const runtime = this.extractStat(bodyText, /Runtime\s*:\s*([\d.]+\s*ms)/i);
      const runtimePercentile = this.extractStat(bodyText, /Beats\s*([\d.]+)\s*%/i, true);
      const memory = this.extractStat(bodyText, /Memory\s*:\s*([\d.]+\s*MB)/i);
      const memoryPercentile = this.extractStat(bodyText, /Beats\s*([\d.]+)\s*%/i, true, true);

      return {
        title,
        number,
        titleSlug,
        folderName: number ? `${number.padStart(4, '0')}-${titleSlug}` : titleSlug,
        difficulty,
        tags,
        code,
        language,
        description,
        readmeDescription,
        runtime,
        runtimePercentile,
        memory,
        memoryPercentile,
      };
    },

    getProblemSlug() {
      const match = window.location.pathname.match(/\/problems\/([^/]+)/);
      return match ? match[1] : 'unknown-problem';
    },

    extractTags(selectors) {
      // selectors.TAGS is array
      const tagElements = queryAll(selectors.TAGS);
      if (tagElements.length === 0) {
        // Fallback checks
        const fallback = document.querySelectorAll('a[href^="/tag/"]');
        if (fallback.length) return Array.from(fallback).map((el) => el.innerText.trim());
      }
      return tagElements.map((el) => el.innerText.trim());
    },

    extractCode(selectors, languages) {
      let code = '';
      let language = 'Unknown';

      // Code containers
      const codeLines = document.querySelectorAll('.view-lines .view-line');
      if (codeLines.length > 0) {
        code = Array.from(codeLines)
          .map((line) => line.innerText)
          .join('\n');
      } else {
        const codeContainer = document.querySelector('code');
        if (codeContainer) code = codeContainer.innerText;
      }

      // Language detection
      const langEl = queryFirst(selectors.LANG_SELECT); // Use LANG_SELECT array
      if (langEl && langEl.innerText) {
        language = langEl.innerText;
      }

      // Fallback to LeetCode's localStorage
      if (!language || language === 'Unknown') {
        try {
          language = window.localStorage.getItem('global_lang') || 'Unknown';
        } catch {
          language = 'Unknown';
        }
      }

      const normLang = this.normalizeLang(language, languages);
      return { code, language: normLang };
    },

    normalizeLang(lang, languages) {
      if (!lang || lang === 'Unknown') return 'Unknown';
      const cleanLang = lang.trim().toLowerCase();

      for (const [name, ext] of Object.entries(languages)) {
        if (name.toLowerCase() === cleanLang || ext.replace('.', '') === cleanLang) {
          return name;
        }
      }

      return lang.trim();
    },

    extractProblemDescription(selectors) {
      // selectors.DESCRIPTION is array
      const descContainer = queryFirst(selectors.DESCRIPTION);
      if (!descContainer) return { description: '', readmeDescription: '' };

      const clone = descContainer.cloneNode(true);
      const readmeDescription = this.formatProblemContent(clone.innerHTML);

      return {
        description: clone.innerText,
        readmeDescription,
      };
    },

    extractStat(text, regex, isNumber = false, skipFirst = false) {
      if (!text) return null;

      const matches = text.match(new RegExp(regex, 'g'));
      if (matches) {
        const match = skipFirst && matches[1] ? matches[1] : matches[0];
        const valMatch = match.match(regex);
        if (valMatch && valMatch[1]) {
          return isNumber ? parseFloat(valMatch[1]) : valMatch[1];
        }
      }
      return null;
    },

    formatProblemContent(html) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(html, 'text/html');
      let text = doc.body.innerHTML;

      // Clean up LeetCode's messy CSS classes and styles but KEEP the HTML structure
      text = text.replace(/ (class|id|style)="[^"]*"/g, '');
      text = text.replace(/ data-[a-zA-Z0-9-]+="[^"]*"/g, '');

      return text.trim();
    },

    extractSubmissionIdFromUrl(url) {
      const match = url.match(/\/submissions\/(\d+)/);
      return match ? match[1] : null;
    },
  };

  window.CodeTrail.scraper = scraper;
})(window);
