import { test, expect } from '../fixtures.js';

test.describe('CodeTrail Sync Window UI Tests', () => {
  const mockProblemData = {
    number: '1',
    title: 'Two Sum',
    titleSlug: 'two-sum',
    difficulty: 'Easy',
    language: '.js',
    code: 'function twoSum() { return [0, 1]; }',
    runtime: '50 ms',
    memory: '42 MB',
    tags: ['Array', 'Hash Table']
  };

  test('Form renders problem data correctly', async ({ page, extensionId, setStorage }) => {
    // Inject mock data into extension storage before opening window
    await setStorage({ pending_sync_data: mockProblemData });

    // Open the sync window
    await page.goto(`chrome-extension://${extensionId}/sync_window.html`);

    // Wait for the form state to become visible (it starts as loading)
    const formState = page.locator('#form-state');
    await expect(formState).toBeVisible({ timeout: 5000 });

    // Assert title includes problem number and title
    const titleHeader = page.locator('#problem-title');
    await expect(titleHeader).toHaveText('1. Two Sum');

    // Assert tags are rendered
    const tagsContainer = page.locator('#problem-tags .tag');
    await expect(tagsContainer).toHaveCount(2);
    await expect(tagsContainer.nth(0)).toHaveText('Array');
    await expect(tagsContainer.nth(1)).toHaveText('Hash Table');
  });

  test('Draft inputs are persisted and restored', async ({ page, extensionId, setStorage }) => {
    await setStorage({ pending_sync_data: mockProblemData });

    await page.goto(`chrome-extension://${extensionId}/sync_window.html`);
    await expect(page.locator('#form-state')).toBeVisible();

    // Type notes
    await page.fill('#notes', 'O(N) time complexity using HashMap');
    await page.fill('#method', 'One-pass Hash Table');

    // Close the page and reopen it to verify drafts
    await page.close();

    // Need a new page to reopen it
    const newPage = await page.context().newPage();
    await newPage.goto(`chrome-extension://${extensionId}/sync_window.html`);
    
    await expect(newPage.locator('#form-state')).toBeVisible();

    // Assert drafts were restored
    await expect(newPage.locator('#notes')).toHaveValue('O(N) time complexity using HashMap');
    await expect(newPage.locator('#method')).toHaveValue('One-pass Hash Table');
  });

});
