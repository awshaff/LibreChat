import { FileSources } from 'librechat-data-provider';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import { buildProjectKnowledgeContext } from './knowledge';

/** One token per character — keeps budget math deterministic in tests. */
const charCountTokenizer = (text: string) => text.length;

const project = (overrides: Partial<IChatProject> = {}): IChatProject =>
  ({
    _id: 'project-1' as never,
    name: 'Test Project',
    description: '',
    instructions: '',
    knowledgeFileIds: [],
    user: 'user-1',
    conversationCount: 0,
    ...overrides,
  }) as IChatProject;

const textFile = (file_id: string, filename: string, text: string): IMongoFile =>
  ({ file_id, filename, text, source: FileSources.text }) as IMongoFile;

describe('buildProjectKnowledgeContext', () => {
  it('is a no-op when no chatProjectId is given', async () => {
    const getChatProject = jest.fn();
    const getFiles = jest.fn();
    const result = await buildProjectKnowledgeContext({
      chatProjectId: null,
      userId: 'user-1',
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result).toEqual({ text: undefined, wasTruncated: false });
    expect(getChatProject).not.toHaveBeenCalled();
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('is a no-op (fails open) when the project cannot be found', async () => {
    const getChatProject = jest.fn().mockResolvedValue(null);
    const getFiles = jest.fn();
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'missing',
      userId: 'user-1',
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result).toEqual({ text: undefined, wasTruncated: false });
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('formats instructions-only projects without fetching files', async () => {
    const getChatProject = jest
      .fn()
      .mockResolvedValue(
        project({ instructions: 'Always answer in French.', knowledgeFileIds: [] }),
      );
    const getFiles = jest.fn();
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100000,
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.wasTruncated).toBe(false);
    expect(result.text).toContain('# Project Instructions');
    expect(result.text).toContain('Always answer in French.');
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('formats files-only projects without an instructions header', async () => {
    const getChatProject = jest.fn().mockResolvedValue(project({ knowledgeFileIds: ['file-1'] }));
    const getFiles = jest
      .fn()
      .mockResolvedValue([textFile('file-1', 'notes.md', 'project knowledge content')]);
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100000,
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.wasTruncated).toBe(false);
    expect(result.text).not.toContain('# Project Instructions');
    expect(result.text).toContain('notes.md');
    expect(result.text).toContain('project knowledge content');
  });

  it('joins instructions and file context together', async () => {
    const getChatProject = jest
      .fn()
      .mockResolvedValue(project({ instructions: 'Be concise.', knowledgeFileIds: ['file-1'] }));
    const getFiles = jest.fn().mockResolvedValue([textFile('file-1', 'a.txt', 'file text')]);
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100000,
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.text).toContain('Be concise.');
    expect(result.text).toContain('file text');
    expect(result.text?.indexOf('Be concise.')).toBeLessThan(
      result.text?.indexOf('file text') ?? -1,
    );
  });

  it('never truncates instructions, even when they alone exceed the budget', async () => {
    const longInstructions = 'x'.repeat(1000);
    const getChatProject = jest
      .fn()
      .mockResolvedValue(project({ instructions: longInstructions, knowledgeFileIds: [] }));
    const getFiles = jest.fn();
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100, // budget share (25%) = 25 tokens, far below instructions length
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.text).toContain(longInstructions);
    expect(result.wasTruncated).toBe(false);
  });

  it('truncates knowledge files and reports it when the budget is exceeded', async () => {
    const getChatProject = jest.fn().mockResolvedValue(project({ knowledgeFileIds: ['file-1'] }));
    const getFiles = jest
      .fn()
      .mockResolvedValue([textFile('file-1', 'huge.txt', 'y'.repeat(10000))]);
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 400, // 25% share = 100 tokens for a 10000-char file
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.wasTruncated).toBe(true);
    expect(result.text?.length).toBeLessThan(1000);
  });

  it('reports truncation without calling extractFileContext when the remaining budget is zero', async () => {
    const longInstructions = 'x'.repeat(1000);
    const getChatProject = jest
      .fn()
      .mockResolvedValue(project({ instructions: longInstructions, knowledgeFileIds: ['file-1'] }));
    const getFiles = jest.fn().mockResolvedValue([textFile('file-1', 'a.txt', 'some content')]);
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100, // budget share (25 tokens) is entirely consumed by instructions
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.wasTruncated).toBe(true);
    expect(result.text).toContain(longInstructions);
    expect(result.text).not.toContain('some content');
  });

  it('falls back to the global file token limit when maxContextTokens is unresolved', async () => {
    const getChatProject = jest
      .fn()
      .mockResolvedValue(project({ instructions: 'short instructions', knowledgeFileIds: [] }));
    const getFiles = jest.fn();
    const result = await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: undefined,
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(result.wasTruncated).toBe(false);
    expect(result.text).toContain('short instructions');
  });

  it('scopes the file lookup to the project owner', async () => {
    const getChatProject = jest.fn().mockResolvedValue(project({ knowledgeFileIds: ['file-1'] }));
    const getFiles = jest.fn().mockResolvedValue([]);
    await buildProjectKnowledgeContext({
      chatProjectId: 'project-1',
      userId: 'user-1',
      maxContextTokens: 100000,
      tokenCountFn: charCountTokenizer,
      getChatProject,
      getFiles,
    });
    expect(getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user-1', file_id: { $in: ['file-1'] } }),
      null,
      expect.any(Object),
    );
  });
});
