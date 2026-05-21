// Mock @huggingface/transformers so Jest (CommonJS transform) doesn't try to load the ESM package
jest.mock('@huggingface/transformers', () => ({
  pipeline: jest.fn(),
}));

import { describe, it, expect } from '@jest/globals';
import { queryRAG } from './rag-query';

describe('queryRAG', () => {
  it('throws with a helpful message when utilitool.db does not exist', async () => {
    await expect(
      queryRAG('How does billing work?', 5, '/nonexistent/path/utilitool.db')
    ).rejects.toThrow('Run: python index_claude_md.py');
  });
});
