// ========================================
// Feather MD — Discord "Send To" Integration (AUTO-013)
// ========================================
// Posts the current document to a user-configured Discord webhook as a
// file attachment (never as message `content`), which sidesteps Discord's
// 2000-character content limit entirely regardless of document length.

/**
 * Send markdown content to a Discord webhook as a .md file attachment.
 * @param {string} webhookUrl - Discord webhook URL (bearer secret; anyone
 *   holding it can post to that channel — see AUTONOMOUS_STATE.md).
 * @param {string} content - Raw markdown to send.
 * @param {string} [filename] - Attachment filename; sanitized to a safe
 *   default if empty/untitled.
 * @throws {Error} If the webhook URL is missing or Discord returns a
 *   non-2xx response.
 */
export async function sendToDiscord(webhookUrl, content, filename) {
  if (!webhookUrl || !webhookUrl.trim()) {
    throw new Error('No Discord webhook URL configured. Set one in Send To Settings.');
  }

  const safeName = normalizeFilename(filename);
  const formData = new FormData();
  const blob = new Blob([content ?? ''], { type: 'text/markdown' });
  formData.append('files[0]', blob, safeName);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with ${response.status} ${response.statusText}`);
  }
}

/**
 * Derive a safe .md attachment filename from a file path (or default for
 * an untitled/in-memory document).
 */
export function normalizeFilename(pathOrName) {
  if (!pathOrName) return 'note.md';
  const base = pathOrName.replace(/\\/g, '/').split('/').pop();
  if (!base) return 'note.md';
  return /\.(md|markdown)$/i.test(base) ? base : `${base}.md`;
}
