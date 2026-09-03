import { EToolResources, mergeFileConfig } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { hasIncompleteFiles, normalizeExportFilename, getViableUploadOptions } from './files';

describe('hasIncompleteFiles', () => {
  const createFile = (file_id: string, progress: number): ExtendedFile => ({
    file_id,
    progress,
    size: 1,
  });

  it('returns true while any attachment is still uploading', () => {
    const files = new Map([
      ['complete', createFile('complete', 1)],
      ['uploading', createFile('uploading', 0.9)],
    ]);

    expect(hasIncompleteFiles(files)).toBe(true);
  });

  it('returns false as soon as every attachment is complete', () => {
    const files = new Map([
      ['first', createFile('first', 1)],
      ['second', createFile('second', 1)],
    ]);

    expect(hasIncompleteFiles(files)).toBe(false);
  });
});

describe('normalizeExportFilename', () => {
  it('replaces every whitespace run with a single underscore', () => {
    expect(normalizeExportFilename('Word1 Word2 Word3')).toBe('Word1_Word2_Word3');
  });

  it('collapses consecutive whitespace into one underscore', () => {
    expect(normalizeExportFilename('Word1  Word2\tWord3')).toBe('Word1_Word2_Word3');
  });

  it('leaves filenames without whitespace unchanged', () => {
    expect(normalizeExportFilename('single-word_name')).toBe('single-word_name');
  });

  it('handles an empty string', () => {
    expect(normalizeExportFilename('')).toBe('');
  });

  it('never leaves whitespace, so downstream whitespace-based formatters are no-ops', () => {
    const inputs = ['Word1 Word2 Word3', ' leading', 'trailing ', 'tab\there', 'a  b   c'];
    for (const input of inputs) {
      expect(normalizeExportFilename(input)).not.toMatch(/\s/);
    }
  });
});

describe('getViableUploadOptions — only images reach the provider', () => {
  const baseCtx = {
    provider: 'openAI',
    endpoint: 'openAI',
    endpointType: undefined,
    useResponsesApi: false,
    fileSearchEnabled: false,
    codeEnabled: false,
    contextEnabled: true,
    fileSearchAllowedByAgent: false,
    codeAllowedByAgent: false,
    endpointSupportedMimeTypes: undefined,
  };
  /** Policy ON. */
  const providerCtx = {
    ...baseCtx,
    fileConfig: mergeFileConfig({ imageOnlyProviderUploads: true }),
  };
  const file = (name: string, type: string) => new File(['x'], name, { type });

  test('an image still gets the provider destination', () => {
    const options = getViableUploadOptions([file('cat.png', 'image/png')], providerCtx);

    expect(options).toContain(undefined);
  });

  /**
   * The default must not change upstream behavior: with the policy off, a PDF is still
   * offered to a document-supporting provider exactly as before.
   */
  test('with the policy OFF a PDF is still offered to the provider (upstream default)', () => {
    const offCtx = { ...baseCtx, fileConfig: mergeFileConfig(undefined) };
    const options = getViableUploadOptions([file('report.pdf', 'application/pdf')], offCtx);

    expect(options).toContain(undefined);
  });

  /**
   * The provider path forwards the document verbatim; gateways refuse that with
   * HTTP 400 and the user sees a failed message with no explanation.
   */
  test('a PDF does not, even where the provider accepts documents', () => {
    const options = getViableUploadOptions([file('report.pdf', 'application/pdf')], providerCtx);

    expect(options).not.toContain(undefined);
  });

  test('a PDF is routed as text instead — exactly one destination, so no dialog', () => {
    const options = getViableUploadOptions([file('report.pdf', 'application/pdf')], providerCtx);

    expect(options).toEqual([EToolResources.context]);
  });

  test('holds for Google, which otherwise takes PDFs and media', () => {
    const ctx = { ...providerCtx, provider: 'google', endpoint: 'google' };

    expect(getViableUploadOptions([file('report.pdf', 'application/pdf')], ctx)).not.toContain(
      undefined,
    );
    expect(getViableUploadOptions([file('cat.png', 'image/png')], ctx)).toContain(undefined);
  });

  test('holds for Bedrock, which otherwise takes its own document types', () => {
    const ctx = { ...providerCtx, provider: 'bedrock', endpoint: 'bedrock' };

    expect(getViableUploadOptions([file('notes.txt', 'text/plain')], ctx)).not.toContain(undefined);
  });
});
