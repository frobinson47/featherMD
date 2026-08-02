// ========================================
// Feather MD -- Send To Settings Modal (AUTO-013/014)
// ========================================

import { describe, it, expect, beforeEach } from 'vitest';
import { config } from '../../src/core/config.js';
import { initSendToSettingsModal, openSendToSettingsModal } from '../../src/ui/dialogs.js';

function buildModalDOM() {
  document.body.innerHTML = `
    <div id="send-to-settings-modal" class="modal-overlay" hidden>
      <div class="modal-content">
        <div class="modal-body">
          <input type="url" id="discord-webhook-input" />
          <input type="url" id="thread-url-input" />
          <div class="modal-buttons">
            <button id="send-to-settings-btn-cancel">Cancel</button>
            <button id="send-to-settings-btn-save">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

describe('Send To Settings modal', () => {
  beforeEach(() => {
    buildModalDOM();
    config.discordWebhookUrl = '';
    config.threadUrl = '';
    initSendToSettingsModal();
  });

  it('does not throw when the modal markup is absent', () => {
    document.body.innerHTML = '';
    expect(() => initSendToSettingsModal()).not.toThrow();
    expect(() => openSendToSettingsModal()).not.toThrow();
  });

  it('pre-fills both inputs with the currently saved values on open', () => {
    config.discordWebhookUrl = 'https://discord.com/api/webhooks/1/existing';
    config.threadUrl = 'https://thread.fmrdigital.dev';
    openSendToSettingsModal();
    expect(document.getElementById('discord-webhook-input').value).toBe('https://discord.com/api/webhooks/1/existing');
    expect(document.getElementById('thread-url-input').value).toBe('https://thread.fmrdigital.dev');
    expect(document.getElementById('send-to-settings-modal').hidden).toBe(false);
  });

  it('Save persists both entered URLs to config and closes the modal', () => {
    openSendToSettingsModal();
    document.getElementById('discord-webhook-input').value = '  https://discord.com/api/webhooks/1/new  ';
    document.getElementById('thread-url-input').value = '  https://my-thread.example.com  ';

    document.getElementById('send-to-settings-btn-save').click();

    expect(config.discordWebhookUrl).toBe('https://discord.com/api/webhooks/1/new');
    expect(config.threadUrl).toBe('https://my-thread.example.com');
    expect(document.getElementById('send-to-settings-modal').hidden).toBe(true);
  });

  it('Cancel closes the modal without persisting changes to either field', () => {
    config.discordWebhookUrl = 'https://discord.com/api/webhooks/1/original';
    config.threadUrl = 'https://thread.fmrdigital.dev';
    openSendToSettingsModal();
    document.getElementById('discord-webhook-input').value = 'https://discord.com/api/webhooks/1/unsaved-change';
    document.getElementById('thread-url-input').value = 'https://unsaved.example.com';

    document.getElementById('send-to-settings-btn-cancel').click();

    expect(config.discordWebhookUrl).toBe('https://discord.com/api/webhooks/1/original');
    expect(config.threadUrl).toBe('https://thread.fmrdigital.dev');
    expect(document.getElementById('send-to-settings-modal').hidden).toBe(true);
  });
});
