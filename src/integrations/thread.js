// ========================================
// Feather MD — Thread "Send To" Integration (AUTO-014)
// ========================================
// Posts the current document to the user's Thread instance (a personal
// note-taking app: forgejo.familytechlab.com/frank/thread) as a new note.
// Thread's POST /api/notes accepts multipart form data with a `raw_input`
// text field (server/src/validation.js createNoteBodySchema) and — per that
// repo's own settings.js comment ("there's no auth layer") — requires no
// authentication today. This is a plain POST, not a bearer-secret webhook.

/**
 * Send markdown content to a Thread instance as a new note.
 * @param {string} baseUrl - Thread instance base URL, e.g. https://thread.fmrdigital.dev
 * @param {string} content - Raw markdown to send as the note's raw_input.
 * @throws {Error} If the base URL is missing or Thread returns a non-2xx response.
 */
export async function sendToThread(baseUrl, content) {
  if (!baseUrl || !baseUrl.trim()) {
    throw new Error('No Thread URL configured. Set one in Send To Settings.');
  }

  const url = `${baseUrl.trim().replace(/\/+$/, '')}/api/notes`;
  const formData = new FormData();
  formData.append('raw_input', content ?? '');

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Thread responded with ${response.status} ${response.statusText}`);
  }
}
