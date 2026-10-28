import fs from 'fs/promises';
import path from 'path';

const SRC_DIR = '.';
const DIST_DIR = './dist';
const CHROME_DIR = path.join(DIST_DIR, 'chrome');
const FIREFOX_DIR = path.join(DIST_DIR, 'firefox');

// Files and folders to exclude from the build
const EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  '.github',
  'scripts',
  'tests',
  'coverage',
  'test-results',
  'test-results.json',
  'test-results-2.json',
  'package.json',
  'package-lock.json',
  'jest.config.js',
  'setupTests.js',
  'playwright.config.js',
  '.eslintrc.json',
  '.prettierrc',
  '.gitignore',
  '.gitattributes',
  '.vscode',
  'resize.ps1',
  'manifest.json', // We handle manifest.json manually
];

async function copyRecursive(src, dest) {
  const stats = await fs.stat(src);
  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);
    for (const file of files) {
      if (EXCLUDE.includes(file)) continue;
      await copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

async function build() {
  console.log('Building CodeTrail extensions...');

  // Clean dist directory
  await fs.rm(DIST_DIR, { recursive: true, force: true });

  // Create directories
  await fs.mkdir(CHROME_DIR, { recursive: true });
  await fs.mkdir(FIREFOX_DIR, { recursive: true });

  // Copy files
  console.log('Copying files to dist/chrome and dist/firefox...');
  await copyRecursive(SRC_DIR, CHROME_DIR);
  await copyRecursive(SRC_DIR, FIREFOX_DIR);

  // Read base manifest
  const manifestRaw = await fs.readFile('manifest.json', 'utf8');
  const baseManifest = JSON.parse(manifestRaw);

  // Build Chrome Manifest
  const chromeManifest = JSON.parse(JSON.stringify(baseManifest));
  delete chromeManifest.browser_specific_settings;
  // Chrome requires service_worker
  chromeManifest.background = {
    service_worker: 'background.js',
    type: 'module',
  };

  // Build Firefox Manifest
  const firefoxManifest = JSON.parse(JSON.stringify(baseManifest));
  // Firefox requires scripts array for MV3 compatibility on older versions.
  // We bundle the script so it runs synchronously and avoids ES module restrictions.
  firefoxManifest.background = {
    scripts: ['background.js'],
  };

  // Write manifests
  await fs.writeFile(
    path.join(CHROME_DIR, 'manifest.json'),
    JSON.stringify(chromeManifest, null, 2)
  );
  await fs.writeFile(
    path.join(FIREFOX_DIR, 'manifest.json'),
    JSON.stringify(firefoxManifest, null, 2)
  );

  console.log('Bundling background.js for Firefox...');
  const { execSync } = await import('child_process');
  try {
    // Run npx esbuild to bundle background.js for Firefox
    execSync(
      'npx --yes esbuild background.js --bundle --outfile=dist/firefox/background.js',
      {
        stdio: 'inherit',
      }
    );
  } catch (e) {
    console.error(
      'Failed to bundle background.js for Firefox. Please ensure you have an internet connection for npx to fetch esbuild.'
    );
    process.exit(1);
  }

  console.log('✅ Build successful!');
  console.log(`Chrome build: ${CHROME_DIR}`);
  console.log(`Firefox build: ${FIREFOX_DIR}`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
