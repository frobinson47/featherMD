// ========================================
// Feather MD -- Config: discordWebhookUrl / threadUrl (AUTO-013/014)
// ========================================
// Minimal coverage for the config fields/sanitization AUTO-013/014 added.
// No broader config.js test suite exists yet -- this establishes the
// pattern rather than attempting exhaustive coverage out of scope here.

import { describe, it, expect, beforeEach } from 'vitest';
import { config, loadConfig } from '../../src/core/config.js';

describe('Config -- discordWebhookUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    config.discordWebhookUrl = '';
  });

  it('defaults to an empty string', async () => {
    await loadConfig();
    expect(config.discordWebhookUrl).toBe('');
  });

  it('loads a previously saved value from localStorage', async () => {
    localStorage.setItem('feathermd-config', JSON.stringify({ discordWebhookUrl: 'https://discord.com/api/webhooks/1/x' }));
    await loadConfig();
    expect(config.discordWebhookUrl).toBe('https://discord.com/api/webhooks/1/x');
  });

  it('sanitizes a non-string value back to the empty-string default', async () => {
    localStorage.setItem('feathermd-config', JSON.stringify({ discordWebhookUrl: 12345 }));
    await loadConfig();
    expect(config.discordWebhookUrl).toBe('');
  });
});

describe('Config -- threadUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    config.threadUrl = 'https://thread.fmrdigital.dev';
  });

  it('defaults to the FMR Digital Thread instance URL', async () => {
    await loadConfig();
    expect(config.threadUrl).toBe('https://thread.fmrdigital.dev');
  });

  it('loads a previously saved (user-overridden) value from localStorage', async () => {
    localStorage.setItem('feathermd-config', JSON.stringify({ threadUrl: 'https://my-thread.example.com' }));
    await loadConfig();
    expect(config.threadUrl).toBe('https://my-thread.example.com');
  });

  it('sanitizes a non-string value back to the default', async () => {
    localStorage.setItem('feathermd-config', JSON.stringify({ threadUrl: 12345 }));
    await loadConfig();
    expect(config.threadUrl).toBe('https://thread.fmrdigital.dev');
  });
});
