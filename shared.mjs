// ============================================================
// BBN Shared Utilities
// Used by both build.mjs (Node.js SSG) and app.js (browser)
// ============================================================

export const STOP_WORDS = new Set([
  // Portuguese stop words
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'pro', 'que', 'se', 'sem', 'sob', 'sobre', 'um', 'uma', 'umas', 'uns',
  // English stop words
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'with'
]);

/**
 * Convert a headline string to a clean, SEO-optimized, short URL slug.
 * - Lowercases & strips accents/diacritics
 * - Removes special characters and punctuation safely
 * - Filters out common Portuguese and English stop words
 * - Limits length to 6 to 8 meaningful words (default: 7)
 * - Guarantees no leading or trailing hyphens
 */
export function toSlug(text, maxWords = 7) {
  if (!text || typeof text !== 'string') return '';

  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/,/g, '')               // remove commas inside numbers (e.g. 100,000 -> 100000)
    .replace(/[^a-z0-9\s-]/g, ' ')  // replace non-alphanumeric chars with spaces to avoid word merging
    .replace(/[-_\s]+/g, ' ')       // collapse multiple spaces and hyphens
    .trim();

  if (!clean) return '';

  const words = clean.split(' ').filter(Boolean);
  const meaningfulWords = words.filter(word => !STOP_WORDS.has(word));

  // Fallback to original words if all words were stop words (prevents empty slugs)
  const selectedWords = (meaningfulWords.length > 0 ? meaningfulWords : words).slice(0, maxWords);

  return selectedWords.join('-').replace(/^-+|-+$/g, '');
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

/**
 * Convert a tag string into a clean, URL-friendly slug.
 * - Normalizes unicode & strips accents/diacritics (e.g. 'Sanções' -> 'Sancoes')
 * - Inserts hyphens at camelCase/PascalCase boundaries (e.g. 'PoliticaBR' -> 'politica-br', 'BrazilPolitics' -> 'brazil-politics')
 * - Lowercases the entire string
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens and trims leading/trailing hyphens
 */
export function toTagSlug(tag) {
  if (!tag || typeof tag !== 'string') return '';

  let str = tag.trim().replace(/^#+/, '');
  if (!str) return '';

  // 1. Remove accents & diacritics
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Handle camelCase and acronym boundaries:
  // e.g. "PoliticaBR" -> "Politica-BR", "BrazilPolitics" -> "Brazil-Politics", "USJustice" -> "US-Justice"
  str = str.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');

  // 3. Lowercase and sanitize to alphanumeric hyphens
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse raw tag input from database into structured tag objects.
 * Supports:
 * - Hashtag strings: "#Bitcoin #BrazilPolitics #Crypto" or "#PoliticaBR #Economia"
 * - Comma/space separated strings: "Bitcoin, BrazilPolitics, Crypto"
 * - Arrays of strings or existing tag objects
 *
 * @param {string | string[] | Array<{label: string, slug?: string}>} input
 * @returns {Array<{label: string, slug: string}>}
 */
export function parseTags(input) {
  if (!input) return [];

  let rawTokens = [];

  if (Array.isArray(input)) {
    rawTokens = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Split on commas, semicolons, or lines
    const segments = trimmed.includes(',') || trimmed.includes(';') || trimmed.includes('\n')
      ? trimmed.split(/[,;\n\r]+/)
      : [trimmed];

    for (const seg of segments) {
      // Within each segment, split by whitespace
      const words = seg.trim().split(/\s+/).filter(Boolean);
      for (const w of words) {
        // Handle #hashtag, multiple #, or glued hashtags like #Bitcoin#Crypto
        const parts = w.split(/#+/).filter(Boolean);
        for (const p of parts) {
          const clean = p.trim().replace(/^[^a-zA-Z0-9\u00C0-\u024F]+|[^a-zA-Z0-9\u00C0-\u024F]+$/g, '');
          if (clean) rawTokens.push(clean);
        }
      }
    }
  }

  const seenSlugs = new Set();
  const result = [];

  for (const item of rawTokens) {
    let label = '';
    let slug = '';

    if (typeof item === 'object' && item !== null) {
      label = String(item.label || item.name || item.tag || '').trim().replace(/^#+/, '');
      slug = item.slug ? toTagSlug(item.slug) : toTagSlug(label);
    } else if (typeof item === 'string') {
      label = item.trim().replace(/^#+/, '');
      slug = toTagSlug(label);
    }

    if (!slug || !label) continue;

    // Deduplicate by slug
    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      result.push({ label, slug });
    }
  }

  return result;
}

/**
 * Render semantic HTML for article tag pills.
 * @param {Array<{label: string, slug: string}>} tags
 * @param {'en' | 'pt'} [lang='en']
 * @returns {string} HTML string
 */
export function formatTagPillsHtml(tags, lang = 'en') {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  const safeLang = lang === 'pt' ? 'pt' : 'en';

  const pills = tags.map(tag => {
    const safeSlug = esc(tag.slug);
    const safeLabel = esc(tag.label);
    const titleText = safeLang === 'pt' ? `Ver arquivo de notícias sobre #${safeLabel}` : `View news archive for #${safeLabel}`;
    return `<a href="/${safeLang}/tag/${safeSlug}" class="article-tag-pill" data-tag-slug="${safeSlug}" title="${titleText}"><span class="tag-hash">#</span><span class="tag-label">${safeLabel}</span></a>`;
  }).join('\n');

  return `<div class="article-tags" aria-label="Tags">\n${pills}\n</div>`;
}

/**
 * Render semantic HTML for horizontal scrollable Tag Cloud Navigation bar.
 * @param {Array<{label: string, slug: string, count?: number}>} tagStats
 * @param {string} [activeSlug='all']
 * @param {'en' | 'pt'} [lang='en']
 * @returns {string} HTML string
 */
export function formatTagCloudHtml(tagStats, activeSlug = 'all', lang = 'en') {
  const safeLang = lang === 'pt' ? 'pt' : 'en';
  const allLabel = safeLang === 'pt' ? 'Todas as Notícias' : 'All News';
  const topicsLabel = safeLang === 'pt' ? 'TÓPICOS' : 'TOPICS';

  const isAllActive = !activeSlug || activeSlug === 'all';
  const allUrl = `/${safeLang}/`;

  let itemsHtml = `      <a href="${allUrl}" class="tag-nav-chip${isAllActive ? ' active' : ''}" data-tag-slug="all"><span class="tag-nav-text">${esc(allLabel)}</span></a>\n`;

  if (Array.isArray(tagStats)) {
    tagStats.forEach(tag => {
      const isActive = tag.slug === activeSlug;
      const countBadge = tag.count ? `<span class="tag-nav-count">${tag.count}</span>` : '';
      const tagUrl = `/${safeLang}/tag/${tag.slug}`;
      const titleAttr = `${esc(tag.label)}${tag.count ? ` (${tag.count})` : ''}`;
      itemsHtml += `      <a href="${tagUrl}" class="tag-nav-chip${isActive ? ' active' : ''}" data-tag-slug="${esc(tag.slug)}" title="${titleAttr}"><span class="tag-nav-hash">#</span><span class="tag-nav-text">${esc(tag.label)}</span>${countBadge}</a>\n`;
    });
  }

  return `
<div class="tag-nav-wrapper" id="tag-nav-wrapper">
  <div class="tag-nav-header">
    <span class="tag-nav-label"><span class="tag-nav-icon">◈</span> ${esc(topicsLabel)}</span>
  </div>
  <div class="tag-nav-scroll-container">
    <nav class="tag-nav-track" id="tag-nav-track" aria-label="${safeLang === 'pt' ? 'Navegação por tópicos' : 'Topic navigation'}">
${itemsHtml}    </nav>
  </div>
</div>`;
}

// ============================================================
// Regional Taxonomy & Hierarchical Topic System
// ============================================================

export const REGIONAL_TAXONOMY = {
  brasil: {
    id: 'brasil',
    slugPt: 'brasil',
    slugEn: 'brazil',
    labelPt: 'Brasil',
    labelEn: 'Brazil',
    keywords: [
      'brasil', 'brazil', 'stf', 'politica-br', 'pf', 'policia-federal', 'pgr',
      'fgts', 'tributario', 'brasilia', 'lula', 'andrei-rodrigues', 'crise-judicial',
      'governanca', 'democracia', '7de-setembro', 'privacidade-dados', 'caso-master',
      'conflito-constitucional', 'economia-brasil', 'crise-stf'
    ]
  },
  crypto: {
    id: 'crypto',
    slugPt: 'cripto-bitcoin',
    slugEn: 'crypto-bitcoin',
    labelPt: 'Cripto & Bitcoin',
    labelEn: 'Crypto & Bitcoin',
    keywords: [
      'bitcoin', 'btc', 'cripto', 'crypto', 'cryptocurrency', 'blockchain',
      'defi', 'ethereum', 'eth', 'liquid-network', 'zondacrypto', 'crime-cripto',
      'cripto-crime', 'roubo-bitcoin', 'hack', 'malone-lam', 'regulacao-cripto',
      'noticias-cripto', 'altcoin', 'satoshi', 'lightning', 'taproot', 'web3', 'nft'
    ]
  },
  middleEast: {
    id: 'middleEast',
    slugPt: 'oriente-medio-energia',
    slugEn: 'middle-east-energy',
    labelPt: 'Oriente Médio & Energia',
    labelEn: 'Middle East & Energy',
    keywords: [
      'oriente-medio', 'middle-east', 'israel', 'israel-libano', 'israel-palestina',
      'cisjordania', 'west-bank', 'ira', 'iran', 'sancoes-ira', 'sancoes-uk',
      'iaea', 'petroleo', 'petroleo-ira', 'oil', 'brent', 'mercado-petrolifero',
      'mercado-de-energia', 'precos-do-petroleo', 'shanghai-crude', 'estreito-de-hormuz',
      'estreito-hormuz', 'strait-of-hormuz', 'tensoes-oriente-medio', 'cessar-fogo-junho',
      'companhias-aereas-iranianas', 'gaza', 'yemen', 'opec'
    ]
  },
  global: {
    id: 'global',
    slugPt: 'global-geopolitica',
    slugEn: 'global-geopolitics',
    labelPt: 'Global & Geopolítica',
    labelEn: 'Global & Geopolitics',
    keywords: [
      'trump', 'us', 'eua', 'us-politics', 'politica-eua', 'sancoes-eua',
      'justica-eua', 'russia', 'ukraine', 'nato', 'china', 'demanda-china',
      'quenia', 'africa-oriental', 'polonia', 'singapura', 'bombardier',
      'goldman-sachs', 'guerra-comercial', 'comercio-eua-canada', 'geopolitica',
      'geopolitics', 'economy', 'economia', 'markets', 'mercados', 'regulation',
      'regulacao', 'news', 'sec', 'fed', 'federal-reserve'
    ]
  }
};

/**
 * Identify the parent region for a given tag slug.
 */
export function getRegionForTag(tagSlug) {
  if (!tagSlug) return REGIONAL_TAXONOMY.global;
  const slug = String(tagSlug).toLowerCase();

  for (const region of Object.values(REGIONAL_TAXONOMY)) {
    if (region.keywords.some(k => slug.includes(k) || k.includes(slug))) {
      return region;
    }
  }
  return REGIONAL_TAXONOMY.global;
}

/**
 * Identify the primary region for an article.
 */
export function getRegionForArticle(article) {
  if (!article) return REGIONAL_TAXONOMY.global;

  // 1. Check parsed tags
  const tags = article.parsedTags || parseTags(article.tag || article.tags);
  for (const t of tags) {
    for (const region of Object.values(REGIONAL_TAXONOMY)) {
      if (region.keywords.some(k => t.slug.includes(k) || k.includes(t.slug))) {
        return region;
      }
    }
  }

  // 2. Keyword fallback in title
  const text = `${article.title || ''} ${article.body || article.conteudo_blog || ''}`.toLowerCase();
  for (const region of Object.values(REGIONAL_TAXONOMY)) {
    if (region.keywords.some(k => text.includes(k))) {
      return region;
    }
  }

  return REGIONAL_TAXONOMY.global;
}

/**
 * Group a collection of tags into regions with frequencies.
 */
export function groupTagsByRegion(tagStats) {
  const result = {
    brasil: [],
    crypto: [],
    middleEast: [],
    global: []
  };

  if (!Array.isArray(tagStats)) return result;

  for (const tag of tagStats) {
    const reg = getRegionForTag(tag.slug);
    const key = reg.id === 'middleEast' ? 'middleEast' : reg.id;
    if (result[key]) {
      result[key].push(tag);
    } else {
      result.global.push(tag);
    }
  }

  // Sort each region by count descending
  for (const k of Object.keys(result)) {
    result[k].sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  return result;
}

/**
 * Format 2-Tier Regional Navigation Bar HTML.
 * Tier 1: Region Tabs (Todas, Brasil, Cripto & Bitcoin, etc.)
 * Tier 2: Sub-topic chip ribbons per region (displayed ONLY when a region is chosen)
 */
export function formatRegionalNavHtml({
  groupedTags,
  topTags = [],
  activeRegionId = 'all',
  activeTagSlug = null,
  lang = 'en'
}) {
  const isPt = lang === 'pt';
  const prefix = isPt ? 'regiao' : 'region';
  const allLabel = isPt ? 'Todas as Notícias' : 'All News';
  const viewAllInRegionLabel = isPt ? 'Ver tudo de' : 'View all in';

  const regionsList = [
    REGIONAL_TAXONOMY.brasil,
    REGIONAL_TAXONOMY.crypto,
    REGIONAL_TAXONOMY.middleEast,
    REGIONAL_TAXONOMY.global
  ];

  // Build Tier 1: Region Tabs (Clean terminal typography, no emojis)
  const isAllActive = !activeRegionId || activeRegionId === 'all';
  let tabsHtml = `    <button type="button" class="region-tab-btn${isAllActive ? ' active' : ''}" data-region-id="all">
      <span class="region-tab-text">${esc(allLabel)}</span>
    </button>\n`;

  let hasRegionActive = false;

  for (const reg of regionsList) {
    const regSlug = isPt ? reg.slugPt : reg.slugEn;
    const regLabel = isPt ? reg.labelPt : reg.labelEn;
    const isActive = activeRegionId === reg.id || activeRegionId === regSlug;
    if (isActive) hasRegionActive = true;
    const subCount = groupedTags && groupedTags[reg.id] ? groupedTags[reg.id].length : 0;
    const countBadge = subCount > 0 ? `<span class="region-tab-badge">${subCount}</span>` : '';

    tabsHtml += `    <button type="button" class="region-tab-btn${isActive ? ' active' : ''}" data-region-id="${esc(reg.id)}" data-region-slug="${esc(regSlug)}">
      <span class="region-tab-text">${esc(regLabel)}</span>
      ${countBadge}
    </button>\n`;
  }

  // Build Tier 2: Sub-topic Panels (Rendered per region, only visible when that region is selected)
  let panelsHtml = '';

  for (const reg of regionsList) {
    const regSlug = isPt ? reg.slugPt : reg.slugEn;
    const regLabel = isPt ? reg.labelPt : reg.labelEn;
    const isPanelActive = activeRegionId === reg.id || activeRegionId === regSlug;
    const tagsForReg = groupedTags && groupedTags[reg.id] ? groupedTags[reg.id] : [];

    // "View all in region" button
    const regUrl = `/${lang}/${prefix}/${regSlug}`;
    const allInRegionBtn = `<a href="${regUrl}" class="region-subtag-chip region-hub-chip" data-region-hub="${esc(regSlug)}"><span>${esc(viewAllInRegionLabel)} ${esc(regLabel)} →</span></a>`;

    const subChips = tagsForReg.slice(0, 20).map(t => {
      const isChipActive = t.slug === activeTagSlug;
      const countSpan = t.count ? `<span class="tag-nav-count">${t.count}</span>` : '';
      return `<a href="/${lang}/tag/${t.slug}" class="region-subtag-chip${isChipActive ? ' active' : ''}" data-tag-slug="${t.slug}" data-parent-region="${esc(reg.id)}"><span class="tag-hash">#</span>${esc(t.label)}${countSpan}</a>`;
    }).join('\n        ');

    panelsHtml += `    <div class="region-subtags-panel${isPanelActive ? ' active' : ''}" data-panel-region="${esc(reg.id)}">
      <span class="region-subtags-lead">${esc(regLabel)}:</span>
      <div class="region-subtags-scroll">
        ${allInRegionBtn}
        ${subChips}
      </div>
    </div>\n`;
  }

  const wrapperActiveAttr = hasRegionActive ? ' has-region-active' : '';

  return `
<div class="regional-nav-wrapper${wrapperActiveAttr}" id="regional-nav-wrapper" data-active-region="${esc(activeRegionId || 'all')}">
  <!-- Nível 1: Abas de Região / Macro-Categorias (Sem emojis) -->
  <div class="region-tabs-row" id="region-tabs-row" role="tablist">
${tabsHtml}  </div>
  <!-- Nível 2: Sub-tópicos por Região (Exibido SOMENTE ao escolher um tópico) -->
  <div class="region-subtags-container" id="region-subtags-container">
${panelsHtml}  </div>
</div>`;
}

/**
 * Validate that an article record has a legitimate title and actual article content.
 * Filters out ghost/placeholder articles (e.g. "Untitled", "Sem título", empty body, or sole image links).
 */
export function isValidArticleRecord(row) {
  if (!row) return false;

  // 1. Validate headline / title
  const rawTitle = (row.headline || row.title || row.title_en || row.title_pt || '').replace(/\*\*/g, '').trim();
  const lowerTitle = rawTitle.toLowerCase();
  if (!rawTitle || lowerTitle === 'untitled' || lowerTitle === 'sem título' || lowerTitle === 'sem titulo') {
    return false;
  }

  // 2. Validate article body / content
  const content = (
    row.body ||
    row.content ||
    row.conteudo_blog ||
    row.content_en ||
    row.content_pt ||
    row.article_lead ||
    ''
  ).trim();

  // Must have at least 30 characters of readable text
  if (!content || content.length < 30) {
    return false;
  }

  // Reject if the content is just a raw source/image link without actual news text
  const strippedContent = content
    .replace(/\*\*Source:\*\*.*$/i, '')
    .replace(/\*\*Fonte:\*\*.*$/i, '')
    .replace(/Source:.*$/i, '')
    .replace(/Fonte:.*$/i, '')
    .trim();
  if (!strippedContent && (content.includes('http://') || content.includes('https://'))) {
    return false;
  }

  return true;
}

