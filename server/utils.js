/**
 * Shared server utilities.
 */

/**
 * Escape a value for interpolation into HTML email bodies (or any HTML
 * context). Names and emails are user-controlled — without escaping, a name
 * like `<img src=x onerror=...>` becomes stored HTML injection in every
 * recipient's inbox.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
