# Privacy Policy for CodeTrail

**Last Updated:** February 13, 2025

CodeTrail ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle your information when you use the CodeTrail browser extension.

## 1. Information We Collect

CodeTrail does **not** collect, store, or transmit any personal data to our own servers. All data processing happens locally on your device or directly between your browser and the third-party services you connect (GitHub and LeetCode).

### 1.1. Local Storage

We store the following information locally in your browser (`chrome.storage.local`):

- GitHub Personal Access Token (encrypted by Chrome's secure storage mechanisms where available).
- GitHub Repository details (name, owner).
- CodeTrail specific settings (e.g., sync preferences, problem themes).
- A cache of your solved problems and submission history for the purpose of syncing.

### 1.2. Third-Party Services

CodeTrail interacts with the following third-party services directly:

- **GitHub API:** To fetch repository information and push code submissions. Your GitHub Token is sent only to GitHub's official API endpoints (`api.github.com`).
- **LeetCode API:** To fetch your problem submissions and details.

## 2. How We Use Your Information

We use the stored information solely for the purpose of:

- Authenticating with GitHub to sync your submissions.
- syncing your LeetCode solutions to your specified GitHub repository.
- Displaying your sync statistics within the extension popup.

## 3. Data Sharing

We do **not** sell, trade, or otherwise transfer your information to outside parties. Your data never leaves your control and is only exchanged between your browser and the services you explicitly authorize (GitHub and LeetCode).

## 4. Security

Your GitHub Personal Access Token is sensitive information. CodeTrail stores it locally in your browser. We recommend following GitHub's best practices, such as setting an expiration date for your token and granting only the minimum necessary permissions (`repo` scope).

## 5. Changes to This Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## 6. Contact Us

If you have any questions about this Privacy Policy, please contact us at [Your Contact Information].
