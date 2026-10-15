// Plain-text-with-markdown-subset renderer for the newsletter (Prompt 70
// Part F, screen E5): blank-line paragraphs, autolinked URLs, **bold** —
// everything else is escaped first, so arbitrary HTML in the body (e.g. a
// <script> tag) can never reach the rendered email as markup.
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

export function renderNewsletterBody(raw) {
  const paragraphs = (raw ?? '').trim().split(/\n\s*\n/).filter(Boolean);
  return paragraphs.map(p => {
    const escaped = escapeHtml(p.trim());
    const withLinks = escaped.replace(URL_RE, url => `<a href="${url}" style="color:#C9A24A;text-decoration:underline;">${url}</a>`);
    const withBold = withLinks.replace(BOLD_RE, (_, inner) => `<strong>${inner}</strong>`);
    const withBreaks = withBold.replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#3a2e1a;line-height:1.6;">${withBreaks}</p>`;
  }).join('');
}
