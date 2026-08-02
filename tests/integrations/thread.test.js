// ========================================
// Feather MD -- Thread "Send To" Integration (AUTO-014)
// ========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendToThread } from '../../src/integrations/thread.js';

describe('Thread -- sendToThread', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws without attempting a network call when no URL is configured', async () => {
    await expect(sendToThread('', 'content')).rejects.toThrow(/no thread url/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws on a whitespace-only URL', async () => {
    await expect(sendToThread('   ', 'content')).rejects.toThrow(/no thread url/i);
  });

  it('POSTs to {baseUrl}/api/notes with raw_input as multipart form data', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created' });

    await sendToThread('https://thread.fmrdigital.dev', '# My note');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://thread.fmrdigital.dev/api/notes');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('raw_input')).toBe('# My note');
  });

  it('strips a trailing slash from the configured base URL', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created' });
    await sendToThread('https://thread.fmrdigital.dev/', 'content');
    expect(fetch.mock.calls[0][0]).toBe('https://thread.fmrdigital.dev/api/notes');
  });

  it('trims leading/trailing whitespace from the configured base URL', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created' });
    await sendToThread('  https://thread.fmrdigital.dev  ', 'content');
    expect(fetch.mock.calls[0][0]).toBe('https://thread.fmrdigital.dev/api/notes');
  });

  it('throws a clear error when Thread responds with a non-2xx status', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(sendToThread('https://thread.fmrdigital.dev', 'content')).rejects.toThrow(/500/);
  });

  it('sends an empty string body without throwing when content is empty', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created' });
    await expect(sendToThread('https://thread.fmrdigital.dev', '')).resolves.toBeUndefined();
  });
});
