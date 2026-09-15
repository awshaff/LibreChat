import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import { getAttachmentTitleText, extractFileContext } from './context';

const file = (filename?: string): TFile => ({ filename }) as TFile;

const textFile = (filename: string, text: string): IMongoFile =>
  ({ filename, text, source: FileSources.text }) as IMongoFile;

/** One token per character — keeps truncation math deterministic in tests. */
const charCountTokenizer = (text: string) => text.length;

describe('getAttachmentTitleText', () => {
  it('returns an empty string when there are no files', () => {
    expect(getAttachmentTitleText()).toBe('');
    expect(getAttachmentTitleText(null)).toBe('');
    expect(getAttachmentTitleText([])).toBe('');
  });

  it('lists a single filename', () => {
    expect(getAttachmentTitleText([file('report.pdf')])).toBe('Attached file(s): report.pdf');
  });

  it('lists every filename', () => {
    expect(getAttachmentTitleText([file('a.pdf'), file('b.csv')])).toBe(
      'Attached file(s): a.pdf, b.csv',
    );
  });

  it('skips files that carry no filename', () => {
    expect(getAttachmentTitleText([file(), file('kept.txt')])).toBe('Attached file(s): kept.txt');
  });

  it('returns an empty string when no file has a filename', () => {
    expect(getAttachmentTitleText([file(), file()])).toBe('');
  });
});

describe('extractFileContext', () => {
  it('returns undefined text and no truncation when there are no attachments', async () => {
    const result = await extractFileContext({ attachments: [], tokenCountFn: charCountTokenizer });
    expect(result).toEqual({ text: undefined, wasTruncated: false });
  });

  it('ignores attachments that are not text-sourced', async () => {
    const attachment = { filename: 'image.png', source: FileSources.local } as IMongoFile;
    const result = await extractFileContext({
      attachments: [attachment],
      tokenCountFn: charCountTokenizer,
    });
    expect(result).toEqual({ text: undefined, wasTruncated: false });
  });

  it('formats a single text attachment without truncation', async () => {
    const result = await extractFileContext({
      attachments: [textFile('notes.md', 'hello world')],
      tokenCountFn: charCountTokenizer,
      fileTokenLimit: 1000,
    });
    expect(result.wasTruncated).toBe(false);
    expect(result.text).toContain('# "notes.md"');
    expect(result.text).toContain('hello world');
  });

  it('truncates a file that exceeds the explicit fileTokenLimit override and reports it', async () => {
    const longText = 'a'.repeat(1000);
    const result = await extractFileContext({
      attachments: [textFile('big.txt', longText)],
      tokenCountFn: charCountTokenizer,
      fileTokenLimit: 100,
    });
    expect(result.wasTruncated).toBe(true);
    expect(result.text).toBeDefined();
    // Formatting adds a small, fixed amount of header/fence overhead, so the
    // embedded content being bounded by the token limit means the whole
    // formatted block stays well under the original 1000-char input.
    expect(result.text?.length).toBeLessThan(longText.length / 2);
  });

  it('the explicit fileTokenLimit takes precedence over req.body.fileTokenLimit', async () => {
    const longText = 'b'.repeat(500);
    const req = { body: { fileTokenLimit: 500 }, config: {} } as never;
    const result = await extractFileContext({
      attachments: [textFile('override.txt', longText)],
      req,
      tokenCountFn: charCountTokenizer,
      fileTokenLimit: 50,
    });
    expect(result.wasTruncated).toBe(true);
  });

  it('joins multiple text attachments into one block', async () => {
    const result = await extractFileContext({
      attachments: [textFile('a.txt', 'first'), textFile('b.txt', 'second')],
      tokenCountFn: charCountTokenizer,
      fileTokenLimit: 1000,
    });
    expect(result.text).toContain('# "a.txt"');
    expect(result.text).toContain('# "b.txt"');
    expect(result.wasTruncated).toBe(false);
  });
});
