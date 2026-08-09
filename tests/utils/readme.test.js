import { generateReadme, appendVersionToReadme } from '../../utils/readme.js';

describe('readme.js', () => {
  const mockData = {
    title: 'Two Sum',
    titleSlug: 'two-sum',
    number: '1',
    difficulty: 'Easy',
    tags: ['Array', 'Hash Table'],
    language: 'JavaScript',
    runtime: '50 ms',
    runtimePercentile: '90%',
    memory: '40 MB',
    memoryPercentile: '80%',
    timestamp: 1677654321000,
    descriptionHtml: '<p>Description</p>',
    folderName: '0001-two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    code: 'function twoSum() {}',
  };

  describe('generateReadme', () => {
    test('generates readme with all fields', () => {
      const readme = generateReadme(mockData);
      expect(readme).toContain('# [Two Sum](https://leetcode.com/problems/two-sum/)');
      expect(readme).toMatch(/Difficulty.*Easy/);
      expect(readme).toContain('Array');
      expect(readme).toContain('Hash Table');
      expect(readme).toContain('## Solution');
    });

    test('handles missing optional fields', () => {
      const minData = { ...mockData, tags: null, runtime: null, memory: null };
      const readme = generateReadme(minData);
      expect(readme).toContain('# [Two Sum]');
      expect(readme).not.toContain('Runtime:');
      expect(readme).not.toContain('Memory:');
    });
  });

  describe('appendVersionToReadme', () => {
    test('appends new solution to existing readme', () => {
      const originalReadme = generateReadme(mockData);
      const newData = {
        ...mockData,
        language: 'Python',
        code: 'def twoSum(): pass',
        runtime: '60 ms',
      };

      const updated = appendVersionToReadme(originalReadme, newData, 2);
      expect(updated).toContain('## Version 2');
      expect(updated).toMatch(/Language.*Python/);

      expect(updated).toMatch(/Runtime.*`60 ms`/);
    });
  });
});
