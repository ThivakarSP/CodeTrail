import { test, expect } from '../fixtures.js';

test.describe('CodeTrail Background Worker (GitHub Push) Tests', () => {
  const mockProblemData = {
    number: '1',
    title: 'Two Sum',
    titleSlug: 'two-sum',
    folderName: '0001-two-sum',
    difficulty: 'Easy',
    language: '.js',
    code: 'function twoSum() { return [0, 1]; }',
    runtime: '50 ms',
    memory: '42 MB',
    tags: ['Array', 'Hash Table'],
    readmeDescription: 'Given an array of integers...',
    references: {
      method: 'Two Pointers',
      notes: 'O(n) time',
      youtube: ''
    }
  };

  test('Successfully pushes to GitHub using mocked API', async ({ page, context, extensionId, setStorage }) => {
    // 1. Inject a fake GitHub OAuth token and repo so the extension thinks it's authenticated
    await setStorage({
      codetrail_username: 'testuser',
      codetrail_repo: 'testrepo',
      codetrail_token: 'gho_fake_test_token_123456789'
    });

    // 2. Intercept all GitHub API requests to mock the batch commit process
    let interceptedRequestPayload = null;
    await context.route('https://api.github.com/repos/*/**', async (route) => {
      const request = route.request();
      const method = request.method();
      const url = request.url();
      
      if (method === 'GET') {
        if (url.includes('/contents/')) {
          // Mock version check (file doesn't exist)
          await route.fulfill({ status: 404 });
        } else if (url.includes('/git/ref/')) {
          // Mock get latest commit
          await route.fulfill({ status: 200, json: { object: { sha: 'mock_commit_sha' } } });
        } else if (url.includes('/git/commits/')) {
          // Mock get tree
          await route.fulfill({ status: 200, json: { tree: { sha: 'mock_tree_sha' } } });
        } else {
          // Mock default branch check
          await route.fulfill({ status: 200, json: { default_branch: 'main' } });
        }
      } else if (method === 'POST') {
        if (url.includes('/git/blobs')) {
          // Mock create blob
          await route.fulfill({ status: 201, json: { sha: 'mock_blob_sha' } });
        } else if (url.includes('/git/trees')) {
          // Mock create tree
          await route.fulfill({ status: 201, json: { sha: 'mock_new_tree_sha' } });
        } else if (url.includes('/git/commits')) {
          // Mock create commit
          interceptedRequestPayload = JSON.parse(request.postData());
          await route.fulfill({ status: 201, json: { sha: 'mock_new_commit_sha' } });
        }
      } else if (method === 'PATCH') {
        if (url.includes('/git/refs/')) {
          // Mock update ref
          await route.fulfill({ status: 200, json: { object: { sha: 'mock_new_commit_sha' } } });
        }
      } else {
        await route.continue();
      }
    });

    // 3. Navigate to an extension page to access chrome.runtime and send a message to trigger a sync
    await page.goto(`chrome-extension://${extensionId}/sync_window.html`);
    const syncStatus = await page.evaluate(async (data) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'CONFIRM_SYNC',
            data: data,
          },
          (response) => {
            resolve(response);
          }
        );
      });
    }, mockProblemData);

    // 4. Assert the background script returned a success message
    if (!syncStatus.success) {
      console.error('Sync failed with error:', syncStatus.error);
    }
    expect(syncStatus.error).toBeUndefined();
    expect(syncStatus.success).toBeTruthy();

    // 5. Assert the intercepted GitHub API payload was formatted correctly
    expect(interceptedRequestPayload).not.toBeNull();
    expect(interceptedRequestPayload.message).toContain('Two Sum [Easy]');
    expect(interceptedRequestPayload.tree).toBeDefined(); // Batch commits use 'tree' instead of 'content'
  });
});
