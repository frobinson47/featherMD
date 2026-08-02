// ========================================
// Feather MD -- Discord "Send To" Integration (AUTO-013)
// ========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendToDiscord, normalizeFilename } from '../../src/integrations/discord.js';

describe('Discord -- normalizeFilename', () => {
  it('defaults to note.md for an untitled/null path', () => {
    expect(normalizeFilename(null)).toBe('note.md');
    expect(normalizeFilename(undefined)).toBe('note.md');
    expect(normalizeFilename('')).toBe('note.md');
  });

  it('extracts the basename from a Windows path', () => {
    expect(normalizeFilename('C:\\notes\\my-doc.md')).toBe('my-doc.md');
  });

  it('extracts the basename from a POSIX path', () => {
    expect(normalizeFilename('/home/user/notes/my-doc.md')).toBe('my-doc.md');
  });

  it('appends .md when the source file has no markdown extension', () => {
    expect(normalizeFilename('C:\\notes\\readme.txt')).toBe('readme.txt.md');
  });

  it('preserves an existing .markdown extension as-is', () => {
    expect(normalizeFilename('doc.markdown')).toBe('doc.markdown');
  });
});

describe('Discord -- sendToDiscord', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws without attempting a network call when no webhook URL is configured', async () => {
    await expect(sendToDiscord('', 'content', 'a.md')).rejects.toThrow(/no discord webhook url/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws on a whitespace-only webhook URL', async () => {
    await expect(sendToDiscord('   ', 'content', 'a.md')).rejects.toThrow(/no discord webhook url/i);
  });

  it('POSTs the content as a file attachment (not message content)', async () => {
    fetch.mockResolvedValue({ ok: true, status: 204, statusText: 'No Content' });

    await sendToDiscord('https://discord.com/api/webhooks/123/abc', '# Hello', 'note.md');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);

    const file = options.body.get('files[0]');
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe('note.md');
    expect(file.type).toBe('text/markdown');
    // jsdom's Blob (as returned via FormData.get()) doesn't implement .text(),
    // so size is the well-supported way to confirm the right content was
    // attached rather than an empty/placeholder blob.
    expect(file.size).toBe(new Blob(['# Hello']).size);
  });

  it('throws a clear error when Discord responds with a non-2xx status', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(
      sendToDiscord('https://discord.com/api/webhooks/123/bad', 'content', 'a.md')
    ).rejects.toThrow(/401/);
  });

  it('sends an empty string body without throwing when content is empty', async () => {
    fetch.mockResolvedValue({ ok: true, status: 204, statusText: 'No Content' });
    await expect(sendToDiscord('https://discord.com/api/webhooks/1/x', '', 'empty.md')).resolves.toBeUndefined();
  });
});
