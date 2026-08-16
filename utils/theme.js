/**
 * CodeTrail Theme Manager
 * Automatically applies saved theme before page renders to prevent FOUC.
 */

// Define standard SVG icons for the toggle button
const THEME_ICONS = {
  light: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  dark: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
};

// Immediately apply theme to avoid flash
const savedTheme = localStorage.getItem('ct_theme') || 'dark'; // default to dark
document.documentElement.setAttribute('data-theme', savedTheme);

// If running in an extension context, we sync with chrome.storage to ensure consistency across windows
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(['theme'], (result) => {
    if (result.theme && result.theme !== savedTheme) {
      document.documentElement.setAttribute('data-theme', result.theme);
      localStorage.setItem('ct_theme', result.theme);
    }
  });

  // Listen for theme changes from other windows
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.theme) {
      document.documentElement.setAttribute('data-theme', changes.theme.newValue);
      localStorage.setItem('ct_theme', changes.theme.newValue);
      updateThemeToggleUI(changes.theme.newValue);
    }
  });
}

function updateThemeToggleUI(theme) {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = theme === 'dark' ? THEME_ICONS.dark : THEME_ICONS.light;
    toggleBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
}

// Attach event listener once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  updateThemeToggleUI(currentTheme);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('ct_theme', newTheme);
      updateThemeToggleUI(newTheme);
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ theme: newTheme });
      }
    });
  }
});
