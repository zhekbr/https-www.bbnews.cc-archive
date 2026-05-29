// ============================================================
// BBN Shared Utilities
// Used by both build.mjs (Node.js SSG) and app.js (browser)
// ============================================================

/**
 * Convert a title string to a URL-safe slug.
 * Must produce identical output in build.mjs and app.js.
 */
export function toSlug(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

/**
 * Extract the title from Nostr event content (markdown).
 * Looks for the first non-empty line, strips heading markers and bold.
 */
export function extractTitle(content) {
  if (!content) return 'Untitled';
  const lines = content.trim().split('\n');
  for (const line of lines) {
    let clean = line.trim();
    if (!clean) continue;
    clean = clean.replace(/^#+\s*/, '');
    clean = clean.replace(/^\*\*(.+?)\*\*$/, '$1');
    clean = clean.replace(/\*\*/g, '');
    if (clean.length > 3) return clean;
  }
  return content.trim().slice(0, 60);
}

/**
 * Extract the body content, skipping the title line.
 */
export function extractBody(content, title) {
  if (!content) return '';
  const text = content.trim();
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) { startIdx = i + 1; break; }
  }
  let body = lines.slice(startIdx).join('\n').trim();
  return body;
}

/**
 * Escape HTML special characters.
 */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/**
 * Apply inline formatting (bold, italic, code, links).
 */
export function inlineFormat(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Convert markdown-like text to HTML.
 * Handles headings, blockquotes, lists, paragraphs, and horizontal rules.
 */
export function contentToHTML(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inPara = false;
  let inList = false;

  const closePara = () => { if (inPara) { html += '</p>'; inPara = false; } };
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { closePara(); closeList(); continue; }
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line)) {
      closePara(); closeList();
      html += '<hr style="border:none;border-top:1px solid #ddd;margin:2rem 0;">';
      continue;
    }
    if (line.startsWith('### ')) {
      closePara(); closeList(); html += `<h3>${inlineFormat(line.slice(4))}</h3>`; continue;
    }
    if (line.startsWith('## ')) {
      closePara(); closeList(); html += `<h2>${inlineFormat(line.slice(3))}</h2>`; continue;
    }
    if (line.startsWith('# ')) {
      closePara(); closeList(); html += `<h2>${inlineFormat(line.slice(2))}</h2>`; continue;
    }
    if (line.startsWith('> ')) {
      closePara(); closeList(); html += `<blockquote>${inlineFormat(line.slice(2))}</blockquote>`; continue;
    }
    if (/^[*\-]\s+/.test(line)) {
      closePara();
      if (!inList) { html += '<ul style="padding-left:1.4rem;margin-bottom:1rem;">'; inList = true; }
      html += `<li style="margin-bottom:.4rem;">${inlineFormat(line.replace(/^[*\-]\s+/, ''))}</li>`;
      continue;
    }
    closeList();
    if (!inPara) { html += '<p>'; inPara = true; } else html += ' ';
    html += inlineFormat(line);
  }
  closePara(); closeList();
  return html;
}
