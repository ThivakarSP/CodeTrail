# CodeTrail - Sync LeetCode to GitHub 🚀

[![CI/CD Pipeline](https://github.com/ThivakarSP/CodeTrail/actions/workflows/main.yml/badge.svg)](https://github.com/ThivakarSP/CodeTrail/actions/workflows/main.yml)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

**CodeTrail** is a powerful Chrome extension that automatically syncs your LeetCode submissions to a GitHub repository. Keep your portfolio up-to-date and track your coding journey effortlessly.

## ✨ Features

- **Automatic Sync**: Pushes accepted solutions to GitHub automatically.
- **Atomic Commits**: Uses GitHub's Git Data API for reliable, glitch-free syncing.
- **Performance Optimized**: Creating blobs and trees directly ensures >50% faster syncing than standard API calls.
- **Rich Metadata**: Captures runtime, memory usage, difficulty, and problem tags.
- **Smart READMEs**: Auto-generates solution READMEs with problem descriptions and stats.
- **Main README Index**: Maintains a categorized index of all solved problems.

## 🛠️ Installation

### From Source (Developer Mode)

1.  Clone the repository:

    ```bash
    git clone https://github.com/ThivakarSP/CodeTrail.git
    cd CodeTrail
    ```

2.  Install dependencies (for development):

    ```bash
    npm install
    ```

3.  Load in Chrome:
    - Open `chrome://extensions/`
    - Enable **Developer mode** (top right toggle).
    - Click **Load unpacked**.
    - Select the `CodeTrail` folder.

## ⚙️ Configuration

1.  Click the **CodeTrail** extension icon.
2.  Click **Connect** or **Settings**.
3.  Enter your GitHub **Username** and **Repository Name**.
4.  Generate a Personal Access Token (PAT) with `repo` scope and paste it.
5.  Click **Connect**.

## 🏗️ Architecture

CodeTrail is built with a modular architecture for reliability and performance:

- **`content.js`**: Injects into LeetCode, observes DOM for submissions, and detects success. Uses dynamic imports for modularity.
- **`background.js`**: Orchestrates the sync process, manages the submission queue, and handles notifications.
- **`utils/github.js`**: The core engine. Implements the Git Data API (Blobs, Trees, Commits) for atomic batch updates.
- **`utils/constants.js`**: Centralized configuration and DOM selectors.
- **`utils/storage.js`**: Promise-based wrapper for `chrome.storage.local`.

## 🧪 Development

### Running Tests

We use **Jest** for unit testing.

```bash
npm test
```

### Linting

We use **ESLint** and **Prettier** for code quality.

```bash
npm run lint
```

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📄 License

MIT License.
