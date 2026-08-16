(function (window) {
  window.CodeTrail = window.CodeTrail || {};

  const modal = {
    shadowRoot: null,

    injectModal() {
      if (document.getElementById('codetrail-modal-host')) {
        this.shadowRoot = document.getElementById('codetrail-modal-host').shadowRoot;
        return;
      }

      const host = document.createElement('div');
      host.id = 'codetrail-modal-host';
      host.style.all = 'initial'; // Reset inherited styles on host
      host.style.zIndex = '2147483647'; // Max z-index
      host.style.position = 'fixed';
      host.style.top = '0';
      host.style.right = '0';
      
      // Read initial theme and listen for changes
      chrome.storage.local.get(['theme'], (result) => {
        const theme = result.theme || 'dark';
        host.setAttribute('data-theme', theme);
      });
      
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.theme) {
          host.setAttribute('data-theme', changes.theme.newValue);
        }
      });

      this.shadowRoot = host.attachShadow({ mode: 'open' });

      const modalHtml = `
            <style>
                :host {
                  /* Light theme by default */
                  --bg-glass: rgba(255, 255, 255, 0.7);
                  --text-primary: #2d2a26;
                  --text-muted: #8c857b;
                  --border-glass: rgba(255, 255, 255, 0.5);
                  --border-solid: rgba(0, 0, 0, 0.08);
                  --accent-primary: #d4a373;
                  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.06);
                  --error: #d73a49;
                }
                :host([data-theme="dark"]) {
                  --bg-glass: rgba(30, 30, 35, 0.6);
                  --text-primary: #f4f4f5;
                  --text-muted: #71717a;
                  --border-glass: rgba(255, 255, 255, 0.08);
                  --border-solid: rgba(255, 255, 255, 0.08);
                  --accent-primary: #ffa116; /* LeetCode orange accent */
                  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.5);
                  --error: #ff375f;
                }
                
                #codetrail-modal {
                    display: none;
                    position: fixed;
                    top: 24px;
                    right: 24px;
                    z-index: 9999;
                    background: var(--bg-glass);
                    color: var(--text-primary);
                    padding: 16px;
                    border-radius: 12px;
                    box-shadow: var(--shadow-md);
                    border: 1px solid var(--border-glass);
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    width: 320px;
                    box-sizing: border-box;
                    font-size: 14px;
                    line-height: 1.5;
                    backdrop-filter: blur(12px);
                    transition: background 0.3s ease, color 0.3s ease;
                }
                #codetrail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    border-bottom: 1px solid var(--border-solid);
                    padding-bottom: 12px;
                }
                h3 {
                    margin: 0;
                    font-size: 16px;
                    color: var(--accent-primary);
                    font-weight: 600;
                }
                button#codetrail-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 20px;
                    line-height: 1;
                    padding: 0;
                    margin: 0;
                    transition: color 0.2s ease;
                }
                button#codetrail-close:hover {
                    color: var(--text-primary);
                }
                #codetrail-loading {
                    text-align: center;
                    padding: 20px;
                }
                .spinner {
                    display: inline-block;
                    border: 3px solid var(--border-solid);
                    border-top-color: var(--accent-primary);
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .text-muted { color: var(--text-muted); font-size: 13px; }
                #codetrail-title { margin: 0 0 10px 0; font-weight: 600; font-size: 14px; display: block; }
                .error-msg { color: var(--error); padding: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
            </style>
            <div id="codetrail-modal">
                <div id="codetrail-header">
                    <h3>CodeTrail Sync</h3>
                    <button id="codetrail-close">&times;</button>
                </div>
                <div id="codetrail-content">
                    <div id="codetrail-loading">
                        <div class="spinner"></div>
                        <p class="text-muted" style="margin-top:12px;">Fetching submission...</p>
                    </div>
                    <div id="codetrail-form" style="display:none;">
                        <p id="codetrail-title"></p>
                        <p class="text-muted" style="margin-bottom:4px;">Opening sync window...</p>
                    </div>
                </div>
            </div>
            `;

      this.shadowRoot.innerHTML = modalHtml;
      document.body.appendChild(host);

      this.shadowRoot.getElementById('codetrail-close').addEventListener('click', () => {
        this.hideModal();
      });
    },

    getElement(id) {
      if (!this.shadowRoot) this.injectModal();
      return this.shadowRoot.getElementById(id);
    },

    showModal() {
      const el = this.getElement('codetrail-modal');
      if (el) el.style.display = 'block';
    },

    hideModal() {
      const el = this.getElement('codetrail-modal');
      if (el) el.style.display = 'none';
    },

    showSyncModal(problemData) {
      this.injectModal();
      this.showModal();

      const contentEl = this.getElement('codetrail-content');

      // Check if we need to restore structure (if error msg is present or elements missing)
      if (
        contentEl &&
        (contentEl.querySelector('.error-msg') || !this.getElement('codetrail-loading'))
      ) {
        contentEl.innerHTML = `
            <div id="codetrail-loading">
                <div class="spinner"></div>
                <p class="text-muted" style="margin-top:12px;">Fetching submission...</p>
            </div>
            <div id="codetrail-form" style="display:none;">
                <p id="codetrail-title"></p>
                <p class="text-muted" style="margin-bottom:4px;">Opening sync window...</p>
            </div>`;
      }

      const form = this.getElement('codetrail-form');
      const loading = this.getElement('codetrail-loading');

      if (loading) loading.style.display = 'block';
      if (form) form.style.display = 'none';

      // Update UI
      setTimeout(() => {
        const loadingEl = this.getElement('codetrail-loading');
        const formEl = this.getElement('codetrail-form');
        const titleEl = this.getElement('codetrail-title');

        if (loadingEl) loadingEl.style.display = 'none';
        if (formEl) {
          formEl.style.display = 'block';
          if (titleEl) titleEl.innerText = problemData.title;
        }
      }, 100);
    },

    showError(msg) {
      this.injectModal();
      this.showModal();
      const content = this.getElement('codetrail-content');
      const escaped = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      content.innerHTML = `<div class="error-msg">❌ ${escaped}</div>`;
    },
  };

  window.CodeTrail.modal = modal;
})(window);
