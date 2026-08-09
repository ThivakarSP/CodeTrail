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

      this.shadowRoot = host.attachShadow({ mode: 'open' });

      const modalHtml = `
            <style>
                #codetrail-modal {
                    display: none;
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    background: #1a1a2e;
                    color: white;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    border: 1px solid #333;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    width: 300px;
                    box-sizing: border-box;
                    font-size: 14px;
                    line-height: 1.5;
                }
                #codetrail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    border-bottom: 1px solid #333;
                    padding-bottom: 10px;
                }
                h3 {
                    margin: 0;
                    font-size: 16px;
                    color: #ffa116;
                    font-weight: 600;
                }
                button#codetrail-close {
                    background: none;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    font-size: 20px;
                    line-height: 1;
                    padding: 0;
                    margin: 0;
                }
                button#codetrail-close:hover {
                    color: #fff;
                }
                #codetrail-loading {
                    text-align: center;
                    padding: 20px;
                }
                .spinner {
                    display: inline-block;
                    border: 3px solid rgba(255,255,255,0.3);
                    border-top-color: #ffa116;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .text-muted { color: #aaa; font-size: 12px; }
                #codetrail-title { margin: 0 0 10px 0; font-weight: bold; font-size: 14px; display: block; }
                .error-msg { color: #ff375f; padding: 10px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
            </style>
            <div id="codetrail-modal">
                <div id="codetrail-header">
                    <h3>CodeTrail Sync</h3>
                    <button id="codetrail-close">&times;</button>
                </div>
                <div id="codetrail-content">
                    <div id="codetrail-loading">
                        <div class="spinner"></div>
                        <p class="text-muted" style="margin-top:10px;">Fetching submission...</p>
                    </div>
                    <div id="codetrail-form" style="display:none;">
                        <p id="codetrail-title"></p>
                        <p class="text-muted" style="margin-bottom:5px;">Opening sync window...</p>
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
      // This fixes the TypeError when elements are missing after an error state
      if (
        contentEl &&
        (contentEl.querySelector('.error-msg') || !this.getElement('codetrail-loading'))
      ) {
        contentEl.innerHTML = `
            <div id="codetrail-loading">
                <div class="spinner"></div>
                <p class="text-muted" style="margin-top:10px;">Fetching submission...</p>
            </div>
            <div id="codetrail-form" style="display:none;">
                <p id="codetrail-title"></p>
                <p class="text-muted" style="margin-bottom:5px;">Opening sync window...</p>
            </div>`;
      }

      const form = this.getElement('codetrail-form');
      const loading = this.getElement('codetrail-loading');

      // Fix TypeError: check if elements exist before accessing style
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
      }, 100); // Small delay to show loading state implies activity
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
