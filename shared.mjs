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

/**
 * Validates if a structured article section should be rendered.
 * Excludes empty strings and explicit "Not applicable." / "N/A" values.
 */
export function isValidSection(val) {
  if (val === null || val === undefined) return false;
  if (typeof val !== 'string') return Boolean(val);
  const trimmed = val.trim();
  if (trimmed === '') return false;

  const normalized = trimmed.toLowerCase();
  const exclusions = [
    'not applicable.',
    'not applicable',
    'não se aplica.',
    'não se aplica',
    'nao se aplica.',
    'nao se aplica',
    'n/a',
    'n/a.',
    'none',
    'none.'
  ];
  return !exclusions.includes(normalized);
}

/**
 * Format section text into semantic paragraphs with markdown bolding (**text** -> <strong>).
 */
export function formatSectionText(text) {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p class="wire-paragraph">${inlineFormat(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Validates and sanitizes external URLs.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

/**
 * Renders a flat single-language article row into semantic financial wire HTML.
 * @param {Object} row - Flat row from either `articles` or `artigos`
 * @param {'en' | 'pt'} [lang='en'] - Target locale
 * @returns {string} Structured HTML string
 */
export function renderArticleContent(row, lang = 'en') {
  if (!row) return '';

  const isPt = String(lang).toLowerCase().startsWith('pt');

  const HEADINGS = {
    dataFigures: isPt ? 'DADOS & NÚMEROS' : 'DATA & FIGURES',
    scenario: isPt ? 'O CENÁRIO' : 'THE SCENARIO',
    quote: isPt ? 'CITAÇÃO DIRETA' : 'DIRECT QUOTE',
    insight: isPt ? 'ANÁLISE BBN' : 'BBN INSIGHT',
    marketReaction: isPt ? 'REAÇÃO DO MERCADO' : 'MARKET REACTION',
    source: isPt ? 'Fonte' : 'Source'
  };

  const sections = [];

  // 1. Article Lead (No section header needed)
  if (isValidSection(row.article_lead)) {
    sections.push(`
      <div class="wire-section wire-lead">
        ${formatSectionText(row.article_lead)}
      </div>
    `);
  }

  // 2. Data & Figures
  if (isValidSection(row.data_figures)) {
    sections.push(`
      <section class="wire-section wire-data-figures">
        <h3 class="wire-heading">${HEADINGS.dataFigures}</h3>
        <div class="wire-figures-content">
          ${formatSectionText(row.data_figures)}
        </div>
      </section>
    `);
  }

  // 3. The Scenario
  if (isValidSection(row.scenario)) {
    sections.push(`
      <section class="wire-section wire-scenario">
        <h3 class="wire-heading">${HEADINGS.scenario}</h3>
        <div class="wire-scenario-content">
          ${formatSectionText(row.scenario)}
        </div>
      </section>
    `);
  }

  // 4. Direct Quote (Semantic <blockquote>)
  if (isValidSection(row.quote_text)) {
    sections.push(`
      <section class="wire-section wire-quote">
        <h3 class="wire-heading">${HEADINGS.quote}</h3>
        <blockquote class="wire-blockquote">
          ${formatSectionText(row.quote_text)}
        </blockquote>
      </section>
    `);
  }

  // 5. BBN Insight
  if (isValidSection(row.insight)) {
    sections.push(`
      <section class="wire-section wire-insight">
        <h3 class="wire-heading">${HEADINGS.insight}</h3>
        <div class="wire-insight-card">
          ${formatSectionText(row.insight)}
        </div>
      </section>
    `);
  }

  // 6. Market Reaction
  if (isValidSection(row.market_reaction)) {
    sections.push(`
      <section class="wire-section wire-market-reaction">
        <h3 class="wire-heading">${HEADINGS.marketReaction}</h3>
        <div class="wire-reaction-content">
          ${formatSectionText(row.market_reaction)}
        </div>
      </section>
    `);
  }

  // 7. Source Attribution
  const safeSourceUrl = sanitizeUrl(row.source_url || row.link);
  if (safeSourceUrl) {
    const displayName = (row.source_name || safeSourceUrl).trim();
    sections.push(`
      <footer class="wire-source-attribution">
        <a href="${esc(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" class="wire-source-link">
          ${HEADINGS.source}: ${esc(displayName)}
        </a>
      </footer>
    `);
  }

  return sections.join('\n');
}

/**
 * Assembles the full article text in markdown from discrete sections
 * when the database doesn't supply a pre-compiled 'content' field.
 */
export function assembleFullArticleMarkdown(row, lang = 'en') {
  if (!row) return '';
  const isPt = String(lang).toLowerCase().startsWith('pt');
  const sections = [];

  if (isValidSection(row.article_lead)) {
    sections.push(row.article_lead.trim());
  }
  if (isValidSection(row.data_figures)) {
    sections.push(`### ${isPt ? 'DADOS & NÚMEROS' : 'DATA & FIGURES'}\n\n${row.data_figures.trim()}`);
  }
  if (isValidSection(row.scenario)) {
    sections.push(`### ${isPt ? 'O CENÁRIO' : 'THE SCENARIO'}\n\n${row.scenario.trim()}`);
  }
  if (isValidSection(row.quote_text)) {
    sections.push(`### ${isPt ? 'CITAÇÃO DIRETA' : 'DIRECT QUOTE'}\n\n> ${row.quote_text.trim()}`);
  }
  if (isValidSection(row.insight)) {
    sections.push(`### ${isPt ? 'ANÁLISE BBN' : 'BBN INSIGHT'}\n\n${row.insight.trim()}`);
  }
  if (isValidSection(row.market_reaction)) {
    sections.push(`### ${isPt ? 'REAÇÃO DO MERCADO' : 'MARKET REACTION'}\n\n${row.market_reaction.trim()}`);
  }
  const sourceUrl = (row.source_url || row.link || '').trim();
  const sourceName = (row.source_name || sourceUrl).trim();
  if (sourceUrl) {
    sections.push(`**${isPt ? 'Fonte' : 'Source'}:** [${sourceName}](${sourceUrl})`);
  }

  return sections.join('\n\n');
}


