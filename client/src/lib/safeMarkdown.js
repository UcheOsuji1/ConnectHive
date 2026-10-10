// Hive docs — markdown rendering (Prompt 63 Part 1).
//
// marked turns the author's markdown into HTML, which may include raw HTML
// the author typed directly (markdown's own spec allows that). DOMPurify is
// the actual security boundary: it strips everything but a plain-text-ish
// tag allowlist, forces every link to http/https/mailto, and forces every
// link to open safely in a new tab. Never render doc.body without going
// through this — and never add ADD_TAGS/ADD_ATTR to the config below.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

let hookInstalled = false;
function installLinkHook() {
  if (hookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  hookInstalled = true;
}

const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

// Only http(s) and mailto links survive — javascript:, data:, everything
// else is stripped to a bare "#" by DOMPurify.
const SAFE_URI_REGEXP = /^(?:https?|mailto):/i;

export function renderMarkdown(raw) {
  installLinkHook();
  const html = marked.parse(raw ?? '');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
  });
}
