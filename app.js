// --- BBN Configuration (injetada pelo build SSG via window.__BBN_CONFIG__) ---
const SUPABASE_URL = window.__BBN_CONFIG__?.url || 'https://thyibhsuhpxqexjvprct.supabase.co';
const SUPABASE_ANON_KEY = window.__BBN_CONFIG__?.key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoeWliaHN1aHB4cWV4anZwcmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTQ5MjAsImV4cCI6MjA5NjE3MDkyMH0._KQeNO86_wm4yzXEf_2T6GVNFazWdWl0n25Oq1jZtOI';

const ROWS_COUNT = 3;
let activeCard = null;
let slugMap = {};

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'pro', 'que', 'se', 'sem', 'sob', 'sobre', 'um', 'uma', 'umas', 'uns',
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'with'
]);

function toSlug(text, maxWords = 7) {
  if (!text || typeof text !== 'string') return '';
  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_\s]+/g, ' ')
    .trim();
  if (!clean) return '';
  const words = clean.split(' ').filter(Boolean);
  const meaningfulWords = words.filter(word => !STOP_WORDS.has(word));
  const selectedWords = (meaningfulWords.length > 0 ? meaningfulWords : words).slice(0, maxWords);
  return selectedWords.join('-').replace(/^-+|-+$/g, '');
}

function toTagSlug(tag) {
  if (!tag || typeof tag !== 'string') return '';
  let str = tag.trim().replace(/^#+/, '');
  if (!str) return '';
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseTags(input) {
  if (!input) return [];
  let rawTokens = [];
  if (Array.isArray(input)) {
    rawTokens = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    const segments = trimmed.includes(',') || trimmed.includes(';') || trimmed.includes('\n')
      ? trimmed.split(/[,;\n\r]+/)
      : [trimmed];
    for (const seg of segments) {
      const words = seg.trim().split(/\s+/).filter(Boolean);
      for (const w of words) {
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
    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      result.push({ label, slug });
    }
  }
  return result;
}

function formatTagPillsHtml(tags, lang = 'en') {
  if (!tags || tags.length === 0) return '';
  const parsed = Array.isArray(tags) && tags[0] && typeof tags[0] === 'object'
    ? tags
    : parseTags(tags);
  if (parsed.length === 0) return '';
  const pills = parsed.map(t =>
    `<a href="/${lang}/tag/${t.slug}" class="article-tag-pill" title="Archive for #${esc(t.label)}">#${esc(t.label)}</a>`
  ).join('');
  return `<div class="article-tags">${pills}</div>`;
}

const REGIONAL_TAXONOMY = {
  brasil: {
    id: 'brasil',
    keywords: [
      'brasil', 'brazil', 'stf', 'politica-br', 'pf', 'policia-federal', 'pgr',
      'fgts', 'tributario', 'brasilia', 'lula', 'andrei-rodrigues', 'crise-judicial',
      'governanca', 'democracia', '7de-setembro', 'privacidade-dados', 'caso-master',
      'conflito-constitucional', 'economia-brasil', 'crise-stf'
    ]
  },
  crypto: {
    id: 'crypto',
    keywords: [
      'bitcoin', 'btc', 'cripto', 'crypto', 'cryptocurrency', 'blockchain',
      'defi', 'ethereum', 'eth', 'liquid-network', 'zondacrypto', 'crime-cripto',
      'cripto-crime', 'roubo-bitcoin', 'hack', 'malone-lam', 'regulacao-cripto',
      'noticias-cripto', 'altcoin'
    ]
  },
  middleEast: {
    id: 'middleEast',
    keywords: [
      'oriente-medio', 'middle-east', 'israel', 'israel-libano', 'israel-palestina',
      'cisjordania', 'west-bank', 'ira', 'iran', 'sancoes-ira', 'sancoes-uk',
      'iaea', 'petroleo', 'petroleo-ira', 'oil', 'brent', 'mercado-petrolifero',
      'mercado-de-energia', 'precos-do-petroleo', 'shanghai-crude', 'estreito-de-hormuz',
      'estreito-hormuz', 'strait-of-hormuz', 'tensoes-oriente-medio', 'cessar-fogo-junho'
    ]
  },
  global: {
    id: 'global',
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

function getRegionForTag(tagSlug) {
  if (!tagSlug) return REGIONAL_TAXONOMY.global;
  const slug = String(tagSlug).toLowerCase();
  for (const region of Object.values(REGIONAL_TAXONOMY)) {
    if (region.keywords.some(k => slug.includes(k) || k.includes(slug))) {
      return region;
    }
  }
  return REGIONAL_TAXONOMY.global;
}

function getRegionForArticle(article) {
  if (!article) return REGIONAL_TAXONOMY.global;
  const tags = article.parsedTags || parseTags(article.tag || article.tags);
  for (const t of tags) {
    for (const region of Object.values(REGIONAL_TAXONOMY)) {
      if (region.keywords.some(k => t.slug.includes(k) || k.includes(t.slug))) {
        return region;
      }
    }
  }
  const text = `${article.title || ''} ${article.body || article.conteudo_blog || ''}`.toLowerCase();
  for (const region of Object.values(REGIONAL_TAXONOMY)) {
    if (region.keywords.some(k => text.includes(k))) {
      return region;
    }
  }
  return REGIONAL_TAXONOMY.global;
}

function extractTitle(content) {
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

function extractBody(content, title) {
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

function contentToHTML(text) {
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

function inlineFormat(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Garante que URLs de links externos não usem esquemas perigosos (ex: javascript:)
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return '';
  return url.trim();
}

function isValidSection(val) {
  if (val === null || val === undefined) return false;
  if (typeof val !== 'string') return Boolean(val);
  const trimmed = val.trim();
  if (trimmed === '') return false;

  const normalized = trimmed.toLowerCase();
  const exclusions = [
    'not applicable.', 'not applicable',
    'não se aplica.', 'não se aplica',
    'nao se aplica.', 'nao se aplica',
    'n/a', 'n/a.', 'none', 'none.'
  ];
  return !exclusions.includes(normalized);
}

function formatSectionText(text) {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p class="wire-paragraph">${inlineFormat(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase().split(/[?#]/)[0];
  if (/\.(jpe?g|png|webp|gif|svg|avif|bmp|ico|tiff)$/i.test(clean)) return true;
  if (url.includes('/fotografia/') || url.includes('/photos/') || url.includes('/uploads/images/')) return true;
  return false;
}

function sanitizeSourceUrl(url, useLinkFlag) {
  if (useLinkFlag === 'no' || useLinkFlag === false || useLinkFlag === 'false') return '';
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  if (isImageUrl(trimmed)) return '';
  return trimmed;
}

function renderArticleContent(row, lang) {
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

  // 1. Article Lead
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

  // Fallback: If no structured sections were present, render full markdown content/body
  if (sections.length === 0) {
    const rawContent = (row.body || row.content || row.conteudo_blog || '').trim();
    if (rawContent) {
      sections.push(contentToHTML(rawContent));
    }
  }

  // 7. Source Attribution (only if safe valid URL and not an image link)
  const safeSourceUrl = sanitizeSourceUrl(row.source_url || row.link, row.USE_LINK);
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

function renderArticle(post) {
  const container = document.getElementById('article-container');
  const safeLink = sanitizeSourceUrl(post.source_url || post.link, post.USE_LINK);
  const locale = getCurrentLocale();
  const sourceBtn = safeLink
    ? `<a class="article-source-btn" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">${locale === 'pt' ? '→ Ver fonte original' : '→ View original source'}</a>`
    : '';

  const hasStructured = Boolean(
    isValidSection(post.article_lead) || isValidSection(post.data_figures) || isValidSection(post.scenario) ||
    isValidSection(post.quote_text) || isValidSection(post.insight) || isValidSection(post.market_reaction)
  );
  const bodyHtml = hasStructured
    ? renderArticleContent(post, locale)
    : contentToHTML(post.body || post.conteudo_blog || '');

  const tagsHtml = formatTagPillsHtml(post.parsedTags || post.tag || post.tags, locale);

  container.innerHTML = `
    <div class="article-breadcrumb">
      <span class="breadcrumb-home" onclick="goHome()">BBN</span>
      <span>›</span>
      <span>${esc(post.title.slice(0, 45))}${post.title.length > 45 ? '…' : ''}</span>
    </div>
    <h1 class="article-title">${esc(post.title)}</h1>
    <hr class="article-divider">
    <div class="article-body">${bodyHtml}</div>
    ${tagsHtml}
    <div style="margin-top:2.5rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;">
      ${sourceBtn}
      <button class="article-back-btn" onclick="goHome()">${locale === 'pt' ? '← Voltar às notícias' : '← Back to news'}</button>
    </div>
  `;
}

function renderArticleNotFound(slug) {
  document.getElementById('article-container').innerHTML = `
    <div class="state-message">
      <div class="state-icon">404</div>
      <div class="state-title">News not found</div>
      <div class="state-sub">The article is no longer in recent records.</div>
      <button class="article-back-btn" onclick="goHome()" style="margin-top:0.5rem;">← Back to home</button>
    </div>`;
}

function showPage(pageId) {
  const pageHome = document.getElementById('page-home');
  const pageArticle = document.getElementById('page-article');
  const pageArchive = document.getElementById('page-archive');
  const pageTagArchive = document.getElementById('page-tag-archive');

  if (pageHome) pageHome.classList.remove('active');
  if (pageArticle) pageArticle.classList.remove('active');
  if (pageArchive) pageArchive.classList.remove('active');
  if (pageTagArchive) pageTagArchive.classList.remove('active');

  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
  } else {
    if (pageId === 'page-home') {
      window.location.href = '/';
    } else if (pageId === 'page-archive') {
      window.location.href = '/archive';
    }
  }

  // Update nav link active states
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    const isHome = href === '/' || href === '/en/' || href === '/pt/';
    const isArchive = href === '/archive' || href === '/en/archive' || href === '/pt/archive';
    if (pageId === 'page-home' && isHome) {
      link.classList.add('active');
    } else if (pageId === 'page-archive' && isArchive) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function getCurrentLocale() {
  const path = window.location.pathname;
  if (path.startsWith('/pt') || path.startsWith('/pt/')) return 'pt';
  if (path.startsWith('/en') || path.startsWith('/en/')) return 'en';
  if (document.documentElement.lang && document.documentElement.lang.startsWith('pt')) return 'pt';
  return 'en';
}

function goHome() {
  const locale = getCurrentLocale();
  const targetUrl = `/${locale}/`;
  if (!document.getElementById('page-home')) {
    const currentNorm = window.location.pathname.replace(/\/+$/, '');
    const targetNorm = targetUrl.replace(/\/+$/, '');
    if (currentNorm !== targetNorm) {
      window.location.href = targetUrl;
    }
    return;
  }
  try { history.pushState(null, '', targetUrl); } catch (e) { window.location.href = targetUrl; return; }
  showPage('page-home');
  document.title = locale === 'pt' ? 'BBN – Bitcoin Brasil News | Cripto, Mercado e Geopolítica' : 'BBN – Bitcoin Brasil News | Crypto, Markets & Geopolitics';
  closePanel();
}

function goArchive() {
  const locale = getCurrentLocale();
  const targetUrl = `/${locale}/archive`;
  if (!document.getElementById('page-archive')) {
    const currentNorm = window.location.pathname.replace(/\/+$/, '');
    const targetNorm = targetUrl.replace(/\/+$/, '');
    if (currentNorm !== targetNorm) {
      window.location.href = targetUrl;
    }
    return;
  }
  try { history.pushState(null, '', targetUrl); } catch (e) { window.location.href = targetUrl; return; }
  showPage('page-archive');
  document.title = locale === 'pt' ? 'Arquivo de Notícias | BBN – Bitcoin Brasil News' : 'News Archive | BBN – Bitcoin Brasil News';
  closePanel();
}

function findPostBySlug(slug) {
  if (!slug) return null;
  if (slugMap[slug]) return slugMap[slug];

  const posts = Object.values(slugMap);

  // 1. Direct match by numeric id
  const byId = posts.find(p => String(p.id) === String(slug));
  if (byId) return byId;

  // 2. Direct match by stored row.slug / _slug
  const byStored = posts.find(p => p.slug === slug || (p._slug && p._slug === slug) || (p.rawSlug && p.rawSlug === slug));
  if (byStored) return byStored;

  // 3. Normalized slug match (strips stop words from incoming slug and compares)
  const normalizedIncoming = toSlug(slug.replace(/-/g, ' '));
  if (normalizedIncoming) {
    if (slugMap[normalizedIncoming]) return slugMap[normalizedIncoming];
    const byNorm = posts.find(p => {
      const pNorm = toSlug(p.title || p.headline || '');
      return pNorm === normalizedIncoming || p.slug === normalizedIncoming;
    });
    if (byNorm) return byNorm;
  }

  // 4. Prefix match (handles truncated slugs e.g. at 80 characters or word breaks)
  const byPrefix = posts.find(p => {
    return (p.slug && (p.slug.startsWith(slug) || slug.startsWith(p.slug))) ||
           (normalizedIncoming && p.slug && (p.slug.startsWith(normalizedIncoming) || normalizedIncoming.startsWith(p.slug)));
  });
  if (byPrefix) return byPrefix;

  return null;
}

function goArticle(slug) {
  const locale = getCurrentLocale();
  const post = findPostBySlug(slug);

  if (!post) {
    const url = `/${locale}/news/${slug}`;
    try { history.pushState(null, '', url); } catch (e) { window.location.href = url; }
    showPage('page-article');
    renderArticleNotFound(slug);
    return;
  }

  // Canonicalize URL smoothly without reloading
  const canonicalSlug = post.slug || slug;
  const canonicalUrl = `/${locale}/news/${canonicalSlug}`;
  try {
    if (window.location.pathname !== canonicalUrl) {
      history.replaceState(null, '', canonicalUrl);
    }
  } catch (e) { /* ignore history error */ }

  document.title = `${post.title} — BBN`;
  showPage('page-article');
  renderArticle(post);
}

function routeFromURL() {
  const path = window.location.pathname;
  const locale = getCurrentLocale();

  // Static standalone pages — app.js is loaded but these pages render their
  // own content; returning early prevents the SPA router from redirecting.
  if (
    path === '/privacy' || path === '/privacy/' || path === '/privacy/index.html' || path === '/privacy.html' ||
    path === '/en/privacy' || path === '/en/privacy/' || path === '/en/privacy/index.html' || path === '/en/privacy.html' ||
    path === '/pt/privacy' || path === '/pt/privacy/' || path === '/pt/privacy/index.html' || path === '/pt/privacy.html'
  ) {
    return;
  }

  // Tag and Region archive pages are pre-rendered statically with their own grid and cloud
  if (
    path.includes('/tag/') ||
    path.includes('/regiao/') ||
    path.includes('/region/') ||
    document.getElementById('page-tag-archive')
  ) {
    return;
  }

  if (
    path === '/archive' || path === '/archive/' || path === '/archive/index.html' || path === '/archive.html' ||
    path === '/en/archive' || path === '/en/archive/' || path === '/en/archive/index.html' || path === '/en/archive.html' ||
    path === '/pt/archive' || path === '/pt/archive/' || path === '/pt/archive/index.html' || path === '/pt/archive.html' ||
    path === '/mais-noticias' || path === '/mais-noticias/'
  ) {
    goArchive();
    return;
  }

  // Localized and legacy article URLs
  const articleMatch = path.match(/^(?:\/(?:en|pt))?\/news\/(.+?)(?:\/|\.html)?$/);
  if (articleMatch) {
    goArticle(articleMatch[1]);
    return;
  }

  // Legacy hash routing support (redirect to localized clean URL)
  const hash = window.location.hash;
  const hashMatch = hash.match(/^#\/(?:(?:en|pt)\/)?news\/(.+)$/);
  if (hashMatch) {
    const slug = hashMatch[1];
    history.replaceState(null, '', `/${locale}/news/${slug}`);
    goArticle(slug);
    return;
  }

  showPage('page-home');
  document.title = locale === 'pt' ? 'BBN – Bitcoin Brasil News | Cripto, Mercado e Geopolítica' : 'BBN – Bitcoin Brasil News | Crypto, Markets & Geopolitics';
}
function clientExtractTags(title, content) {
  const text = `${title} ${content}`.toLowerCase();
  const tagMap = [
    ['bitcoin', ['bitcoin', 'btc', 'satoshi', 'lightning']],
    ['crypto', ['crypto', 'cryptocurrency', 'blockchain', 'defi', 'ethereum', 'altcoin']],
    ['geopolitics', ['war', 'conflict', 'military', 'sanction', 'nato', 'missile', 'nuclear']],
    ['economy', ['economy', 'gdp', 'inflation', 'recession', 'fed', 'federal reserve', 'interest rate', 'selic']],
    ['markets', ['stock', 'nasdaq', 'etf', 'trading', 'gold', 'oil', 's&p']],
    ['regulation', ['regulation', 'sec', 'ban', 'policy', 'compliance', 'ruling']],
    ['brazil', ['brazil', 'brasil', 'lula', 'stf', 'haddad', 'selic']],
    ['energy', ['energy', 'opec', 'petroleum', 'pipeline', 'nuclear']]
  ];
  const matched = [];
  for (const [tag, kws] of tagMap) {
    if (kws.some(kw => text.includes(kw))) matched.push(tag);
    if (matched.length >= 4) break;
  }
  return matched.length > 0 ? matched : ['news'];
}

function assembleFullArticleMarkdown(row, lang) {
  if (!row) return '';
  const isPt = String(lang || getCurrentLocale()).toLowerCase().startsWith('pt');
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

  // If no substantive content sections exist, do NOT return only a source link
  if (sections.length === 0) {
    return '';
  }

  const safeSource = sanitizeSourceUrl(row.source_url || row.link, row.USE_LINK);
  const sourceName = (row.source_name || safeSource).trim();
  if (safeSource) {
    sections.push(`**${isPt ? 'Fonte' : 'Source'}:** [${sourceName}](${safeSource})`);
  }

  return sections.join('\n\n');
}

function isValidClientArticle(item) {
  if (!item) return false;
  const content = (
    item.body ||
    item.content ||
    item.conteudo_blog ||
    item.article_lead ||
    ''
  ).trim();

  if (!content || content.length < 30) {
    return false;
  }

  const stripped = content
    .replace(/\*\*Source:\*\*[\s\S]*$/i, '')
    .replace(/\*\*Fonte:\*\*[\s\S]*$/i, '')
    .replace(/Source:[\s\S]*$/i, '')
    .replace(/Fonte:[\s\S]*$/i, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/[#*\[\]()_`>-]/g, '')
    .trim();

  if (!stripped || stripped.length < 25) {
    return false;
  }

  let rawTitle = (item.headline || item.title || '').replace(/\*\*/g, '').trim();
  if (!rawTitle && content) {
    rawTitle = extractTitle(content);
  }
  if (!rawTitle && (item.hook || item.summary)) {
    rawTitle = (item.hook || item.summary).trim();
  }

  const lowerTitle = rawTitle.toLowerCase();
  if (!rawTitle || lowerTitle === 'untitled' || lowerTitle === 'sem título' || lowerTitle === 'sem titulo') {
    return false;
  }

  return true;
}

function processArticleRows(rows) {
  (rows || []).filter(isValidClientArticle).forEach((row) => {
    const locale = getCurrentLocale();
    let rawTitle = (row.headline || row.title || '').trim();
    const explicitContent = (row.conteudo_blog || row.content || row.body || '').trim();
    if (!rawTitle && explicitContent) {
      rawTitle = extractTitle(explicitContent);
    }
    if (!rawTitle || rawTitle === 'Untitled') {
      const candidate = (row.hook || row.summary || '').trim();
      if (candidate) {
        const firstSentence = candidate.split(/[.!?]/)[0].trim();
        if (firstSentence.length <= 110) {
          rawTitle = firstSentence;
        } else {
          const words = firstSentence.slice(0, 95).split(' ');
          if (words.length > 1) words.pop();
          rawTitle = words.join(' ') + '…';
        }
      }
    }

    const title = (rawTitle || (locale === 'pt' ? 'Sem título' : 'Untitled')).replace(/\*\*/g, '').trim();
    let slug = row.slug || toSlug(title);
    if (slugMap[slug] && String(slugMap[slug].id) !== String(row.id)) slug = `${slug}-${row.id}`;
    
    const assembledBody = assembleFullArticleMarkdown(row, locale);
    const body = explicitContent || assembledBody || '';
    const safeLink = sanitizeSourceUrl(row.source_url || row.link, row.USE_LINK);

    const post = {
      ...row,
      id: String(row.id),
      title,
      headline: title,
      body,
      conteudo_blog: body,
      slug,
      rawSlug: row.slug || '',
      link: safeLink,
      source_name: row.source_name || '',
      source_url: safeLink,
      USE_LINK: row.USE_LINK,
      article_lead: row.article_lead || '',
      data_figures: row.data_figures || '',
      scenario: row.scenario || '',
      quote_text: row.quote_text || '',
      insight: row.insight || '',
      market_reaction: row.market_reaction || ''
    };
    slugMap[slug] = post;
    if (row.slug && row.slug !== slug) {
      slugMap[row.slug] = post;
    }
    row._slug = slug;
    row.title = title;
  });
}

async function fetchFromSupabase() {
  const locale = getCurrentLocale();
  const primaryTable = locale === 'pt' ? 'artigos' : 'articles';
  
  async function fetchTable(table) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?order=created_at.desc&limit=500&select=*`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : null;
  }

  let rows = await fetchTable(primaryTable);
  if (!rows && primaryTable === 'artigos') {
    // Graceful fallback to English articles if Portuguese table is still populating
    rows = await fetchTable('articles');
  }
  if (!rows || rows.length === 0) throw new Error('No articles in Supabase');

  // Map Supabase columns to BBN article format and filter out empty/untitled ones
  return rows.map(row => {
    let rawTitle = (row.headline || row.title || '').trim();
    const explicitContent = (row.content || row.conteudo_blog || '').trim();
    if (!rawTitle && explicitContent) {
      rawTitle = extractTitle(explicitContent);
    }
    if (!rawTitle || rawTitle === 'Untitled') {
      const candidate = (row.hook || row.summary || '').trim();
      if (candidate) {
        const firstSentence = candidate.split(/[.!?]/)[0].trim();
        if (firstSentence.length <= 110) {
          rawTitle = firstSentence;
        } else {
          const words = firstSentence.slice(0, 95).split(' ');
          if (words.length > 1) words.pop();
          rawTitle = words.join(' ') + '…';
        }
      }
    }
    const headlineClean = (rawTitle || (locale === 'pt' ? 'Sem título' : 'Untitled')).replace(/\*\*/g, '').trim();
    const assembledBody = assembleFullArticleMarkdown(row, locale);
    const content = explicitContent || assembledBody || row.article_lead || '';
    const safeLink = sanitizeSourceUrl(row.source_url || row.link, row.USE_LINK);

    return {
      id: String(row.id),
      headline: headlineClean,
      title: headlineClean,
      body: content,
      conteudo_blog: content,
      summary: row.summary || '',
      hook: row.hook || '',
      score: 7,
      time: row.created_at || new Date().toISOString(),
      link: safeLink,
      source_name: row.source_name || '',
      source_url: safeLink,
      USE_LINK: row.USE_LINK,
      article_lead: row.article_lead || '',
      data_figures: row.data_figures || '',
      scenario: row.scenario || '',
      quote_text: row.quote_text || '',
      insight: row.insight || '',
      market_reaction: row.market_reaction || '',
      tags: row.tag ? (Array.isArray(row.tag) ? row.tag : String(row.tag).split(/[,\s#]+/).filter(Boolean)) : clientExtractTags(headlineClean, content)
    };
  }).filter(isValidClientArticle);
}

async function loadArticles() {
  try {
    // Primary source: Supabase (always up to date)
    const rawArticles = await fetchFromSupabase();
    const articles = (rawArticles || []).filter(isValidClientArticle);
    processArticleRows(articles);
    console.log(`[BBN] Loaded ${articles.length} articles from Supabase`);
    return articles;
  } catch (supErr) {
    console.warn('[BBN] Supabase fetch failed, falling back to articles.json:', supErr.message);
    try {
      const res = await fetch('/articles.json');
      if (!res.ok) throw new Error('Failed to load articles.json');
      const rawArticles = await res.json();
      if (!Array.isArray(rawArticles) || rawArticles.length === 0) throw new Error('Empty articles.json');
      const articles = rawArticles.filter(isValidClientArticle);
      processArticleRows(articles);
      console.log(`[BBN] Loaded ${articles.length} articles from articles.json (fallback)`);
      return articles;
    } catch (fallbackErr) {
      console.error('[BBN] Both Supabase and articles.json failed:', fallbackErr);
      return [];
    }
  }
}
const esc = str =>
  String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
function getAgeInHours(isoTime) {
  const publishedMs = new Date(isoTime).getTime();
  const nowMs = Date.now();
  return (nowMs - publishedMs) / (1000 * 60 * 60);
}
function calcDecayScore(score, isoTime) {
  const age = getAgeInHours(isoTime);
  if (age < 3) {
    return score;
  }
  if (age <= 12) {
    const horasAlemDe3 = age - 3;
    const penalidade = Math.floor(horasAlemDe3 / 2) * 0.5;
    return Math.max(score - penalidade, 6);
  }
  if (age > 24) {
    return Math.min(score, 6);
  }
  const penalidade12h = Math.floor((12 - 3) / 2) * 0.5;
  const scoreApos12h = Math.max(score - penalidade12h, 6);
  const t = (age - 12) / 12;
  const interpolado = scoreApos12h - t * Math.max(scoreApos12h - 6, 0);
  return Math.max(interpolado, 6);
}
function formatRelativeTime(hours) {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return mins <= 1 ? 'Just now' : `${mins} min ago`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
function cardTemplate(item, votesMap) {
  const dataUS = new Date(item.time).toLocaleDateString('en-US');
  const ageHours = getAgeInHours(item.time);
  const relativo = formatRelativeTime(ageHours);
  return `
    <div class="card-headline">${esc(item.headline)}</div>
    <div class="card-time">${dataUS} <span style="opacity:0.6">• ${esc(relativo)}</span></div>
  `;
}
function panelTemplate(item) {
  const dt = new Date(item.time).toLocaleString('en-US', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const isMobile = window.innerWidth <= 600;
  const summaryText = isMobile && item.summary.length > 100
    ? item.summary.substring(0, 100).trim() + '…'
    : item.summary;
  return `
    <div class="panel-grid">
      <div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:0.52rem;color:#888;letter-spacing:0.1em;margin-bottom:0.15rem;">${dt}</div>
        <div class="panel-hook" style="font-family:'Sora',sans-serif;font-size:0.95rem;letter-spacing:normal;text-transform:none;line-height:1.3;">
          <strong style="color:#000;">${esc(item.headline)}</strong>
          <div style="font-weight:400;font-size:0.78rem;color:#555;margin-top:0.15rem;line-height:1.4;">${inlineFormat(summaryText)}</div>
        </div>
      </div>
      <div class="panel-actions" style="margin-top:0.3rem;">
        <a class="panel-btn btn-primary"
           href="/${getCurrentLocale()}/news/${item._slug}" onclick="event.preventDefault(); goArticle('${item._slug}')">${getCurrentLocale() === 'pt' ? '→ Ler artigo completo' : '→ Read full article'}</a>
        <button class="panel-btn btn-ghost" onclick="closePanel()">${getCurrentLocale() === 'pt' ? '✕ Fechar' : '✕ Close'}</button>
      </div>
    </div>
  `;
}
function makeCard(item, rowIdx, votesMap) {
  const card = document.createElement('div');
  card.className = 'news-card';
  card.dataset.newsId = item.id;
  const regId = (item.region ? (typeof item.region === 'object' ? item.region.id : item.region) : getRegionForArticle(item).id);
  card.dataset.region = regId;
  if (item.tags && item.tags.length > 0) {
    card.dataset.tags = item.tags.join(',');
  } else {
    card.dataset.tags = '';
  }
  const score = parseInt(item.score);
  if (item._badge === 'critico') {
    card.classList.add('breaking-news');
  } else if (item._badge === 'alto') {
    card.classList.add('alto-impacto');
  }
  card.innerHTML = cardTemplate(item, votesMap);
  card.addEventListener('click', () => {
    const panel = document.getElementById('panel-' + rowIdx);
    const row = document.getElementById('row-' + rowIdx);
    if (activeCard === card) {
      card.classList.remove('active');
      panel.classList.remove('open');
      panel.innerHTML = '';
      activeCard = null;
      if (row) row.classList.remove('is-paused');
      return;
    }
    document.querySelectorAll('.news-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.expanded-panel').forEach(p => { p.classList.remove('open'); p.innerHTML = ''; });
    document.querySelectorAll('.scroll-row').forEach(r => r.classList.remove('is-paused'));
    
    card.classList.add('active');
    activeCard = card;
    panel.innerHTML = panelTemplate(item);
    panel.classList.add('open');
    if (row) row.classList.add('is-paused');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  return card;
}
function closePanel() {
  document.querySelectorAll('.news-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.expanded-panel').forEach(p => { p.classList.remove('open'); p.innerHTML = ''; });
  document.querySelectorAll('.scroll-row').forEach(r => r.classList.remove('is-paused'));
  activeCard = null;
}
function populateRows(noticias) {
  noticias = (noticias || []).filter(isValidClientArticle);
  const votesMap = JSON.parse(localStorage.getItem('bbn_votes') || '{}');
  noticias.forEach(item => {
    const originalScore = parseFloat(item.score) || 6;
    item._currentScore = calcDecayScore(originalScore, item.time);
  });
  noticias.sort((a, b) => {
    if (b._currentScore !== a._currentScore) return b._currentScore - a._currentScore;
    return new Date(b.time) - new Date(a.time);
  });
  const chunkSize = Math.ceil(noticias.length / ROWS_COUNT);
  const TOP_CRITICO = 2;
  const TOP_ALTO = 5;
  let criticoCount = 0;
  noticias.forEach((item, idx) => {
    const cs = item._currentScore;
    if (cs >= 9 && criticoCount < TOP_CRITICO) {
      item._badge = 'critico';
      criticoCount++;
    } else if (cs >= 8 && idx < TOP_ALTO) {
      item._badge = 'alto';
    } else {
      item._badge = null;
    }
  });
  const isMobile = window.innerWidth <= 600;
  const PX_POR_SEGUNDO = isMobile ? 8.4 : 7;
  for (let ri = 0; ri < ROWS_COUNT; ri++) {
    const slice = noticias.slice(ri * chunkSize, (ri + 1) * chunkSize);
    if (slice.length === 0) continue;
    slice.forEach(item => { newsRowMap[item.id] = ri; });
    const track = document.getElementById(`tr${ri}`);
    if (!track) continue;
    track.innerHTML = '';

    const frag = document.createDocumentFragment();
    [0, 1, 2].forEach(() => {
      slice.forEach(item => frag.appendChild(makeCard(item, ri, votesMap)));
    });
    track.appendChild(frag);
    setTimeout(() => {
      let sw = track.scrollWidth;
      // Trata cenário onde width é 0 (ex: fontes lentas ou abriu direto num artigo e o bloco ficou display:none)
      if (sw === 0) sw = (slice.length * 228) * 3;

      if (isMobile) {
        const rowEl = document.getElementById(`row-${ri}`);
        const oneCopyWidth = sw / 3;
        const isRev = track.classList.contains('rev');
        
        let exactScroll = oneCopyWidth;
        rowEl.scrollLeft = exactScroll;
        let currentIntScroll = Math.floor(exactScroll);

        let lastTime = performance.now();
        let isTouching = false;

        rowEl.addEventListener('touchstart', () => { 
            isTouching = true; 
            track.style.transform = 'translate3d(0px, 0, 0)';
            exactScroll = rowEl.scrollLeft; 
            currentIntScroll = rowEl.scrollLeft;
        }, {passive: true});
        
        rowEl.addEventListener('touchend', () => { 
            isTouching = false; 
            exactScroll = rowEl.scrollLeft; 
            currentIntScroll = rowEl.scrollLeft;
        }, {passive: true});
        
        rowEl.addEventListener('scroll', () => {
          if (rowEl.scrollLeft < 10) {
            rowEl.scrollLeft += Math.round(oneCopyWidth);
            exactScroll = rowEl.scrollLeft;
            currentIntScroll = rowEl.scrollLeft;
          } else if (rowEl.scrollLeft > oneCopyWidth * 2 - 10) {
            rowEl.scrollLeft -= Math.round(oneCopyWidth);
            exactScroll = rowEl.scrollLeft;
            currentIntScroll = rowEl.scrollLeft;
          } else if (isTouching) {
            exactScroll = rowEl.scrollLeft;
            currentIntScroll = rowEl.scrollLeft;
          }
        }, {passive: true});

        const loop = (time) => {
          if (!rowEl.isConnected) return;
          const dt = (time - lastTime) / 1000;
          lastTime = time;

          if (!isTouching && !rowEl.classList.contains('is-paused')) {
             if (Math.abs(rowEl.scrollLeft - currentIntScroll) > 1.5) {
                 exactScroll = rowEl.scrollLeft;
                 currentIntScroll = rowEl.scrollLeft;
                 track.style.transform = 'translate3d(0px, 0, 0)';
             } else {
                 let speed = track.classList.contains('slow') ? PX_POR_SEGUNDO * 0.7 : PX_POR_SEGUNDO;
                 if (isRev) exactScroll -= speed * dt;
                 else exactScroll += speed * dt;
                 
                 const intScroll = Math.floor(exactScroll);
                 const subPixel = exactScroll - intScroll;
                 
                 if (intScroll !== currentIntScroll) {
                     rowEl.scrollLeft = intScroll;
                     currentIntScroll = intScroll;
                 }
                 track.style.transform = `translate3d(-${subPixel}px, 0, 0)`;
             }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } else {
        const pixelsPorVolta = sw / 3;
        const duracao = pixelsPorVolta / PX_POR_SEGUNDO;
        track.style.animationDuration = `${Math.max(duracao, 10).toFixed(1)}s`;
      }
    }, 150);
  }
  applyActiveFilter();
}
const newsRowMap = {};
function populateTicker(noticias) {
  const belt = document.getElementById('ticker-belt');
  if (!belt) return;

  const maisRecentes = [...noticias]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 6);

  if (maisRecentes.length === 0) {
    belt.innerHTML = '';
    return;
  }

  const makeItem = n => {
    const span = document.createElement('span');
    span.className = 'ticker-item';
    span.textContent = `₿ ${n.headline}`;
    span.addEventListener('click', () => tickerClickHandler(n));
    return span;
  };

  belt.innerHTML = '';
  [...maisRecentes, ...maisRecentes].forEach(n => belt.appendChild(makeItem(n)));
}
function tickerClickHandler(item) {
  // Se estiver lendo um artigo e clicar no ticker, abre a nova matéria direto sem ir na home
  if (document.getElementById('page-article').classList.contains('active')) {
    goArticle(item._slug);
    return;
  }

  const rowIdx = newsRowMap[item.id];
  if (rowIdx === undefined) return;
  const track = document.getElementById(`tr${rowIdx}`);
  if (!track) return;
  const cards = track.querySelectorAll('.news-card');
  let target = null;
  for (const c of cards) {
    const hl = c.querySelector('.card-headline');
    if (hl && hl.textContent.trim() === item.headline.trim()) {
      target = c;
      break;
    }
  }
  if (!target) return;

  const row = document.getElementById(`row-${rowIdx}`);
  row.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => target.click(), 400);
}

function showSkeletons() {
  if (!document.getElementById('shimmer-style')) {
    const st = document.createElement('style');
    st.id = 'shimmer-style';
    st.textContent = '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(st);
  }
  const shimmerStyle = 'opacity:.35;pointer-events:none;min-height:90px;background:linear-gradient(90deg,#e8e8e8 25%,#f2f2f2 50%,#e8e8e8 75%);background-size:200% 100%;animation:shimmer 1.4s infinite linear;';
  for (let ri = 0; ri < 3; ri++) {
    const track = document.getElementById(`tr${ri}`);
    if (!track) continue;
    track.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const sk = document.createElement('div');
      sk.className = 'news-card'; sk.style.cssText = shimmerStyle;
      track.appendChild(sk);
    }
  }
}

function showError(err) {
  console.error('[BBN] Error:', err);
  for (let ri = 0; ri < 3; ri++) {
    const track = document.getElementById(`tr${ri}`);
    if (track) {
      track.innerHTML = `<div style="padding:1.2rem;border:1.5px dashed #F7931A;color:#888;width:280px;font-size:0.7rem;"><strong style="color:#F7931A;display:block;">⚠ Connection Error</strong>Failed to load articles. Please try again later.</div>`;
    }
  }
}

async function fetchBtcPrice() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw = parseFloat(json?.price);
    if (isNaN(raw)) throw new Error('Invalid price');
    const formatted = raw.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const el = document.getElementById('btc-price');
    if (!el) return;
    if (el.textContent !== formatted) {
      el.textContent = formatted;
      el.classList.remove('price-update');
      void el.offsetWidth;
      el.classList.add('price-update');
    }
  } catch (err) {
    console.warn('[BBN BTC] Error fetching price:', err.message);
  }
}

function populateArchive(noticias) {
  const grid = document.getElementById('archive-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  noticias.forEach(item => {
    // Defensive: skip articles with missing critical fields or empty text
    if (!item || !isValidClientArticle(item)) return;

    const card = document.createElement('a');
    card.className = 'bbn-archive-row';
    card.href = `/${getCurrentLocale()}/news/${item._slug}`;
    
    // Set attributes for filtering
    card.dataset.time = item.time;
    card.dataset.title = (item.title || '').toLowerCase();
    const regId = (item.region ? (typeof item.region === 'object' ? item.region.id : item.region) : getRegionForArticle(item).id);
    card.dataset.region = regId;
    if (item.tags && item.tags.length > 0) {
      card.dataset.tags = item.tags.join(',');
    } else {
      card.dataset.tags = '';
    }

    const dt = new Date(item.time);
    const dataUS = dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const ageHours = getAgeInHours(item.time);
    const relativo = formatRelativeTime(ageHours);
    
    // Calculate badge
    const originalScore = parseFloat(item.score) || 6;
    const cs = calcDecayScore(originalScore, item.time);
    let badge = 'NORMAL';
    let badgeClass = 'normal';
    if (cs >= 9) {
      badge = 'CRITICAL';
      badgeClass = 'critical';
    } else if (cs >= 8) {
      badge = 'HIGH IMPACT';
      badgeClass = 'high-impact';
    }

    card.innerHTML = `
      <div class="bbn-meta">
        <span class="bbn-badge-impact ${badgeClass}">${badge}</span>
        <span class="bbn-date">${dataUS}</span>
        <span class="bbn-relative-time">${relativo}</span>
      </div>
      <div class="bbn-title">
        <h3>${esc(item.title)}</h3>
      </div>
      <div class="bbn-action">Read <span>&rarr;</span></div>
    `;
    
    card.addEventListener('click', (e) => {
      e.preventDefault();
      goArticle(item._slug);
    });
    
    frag.appendChild(card);
  });
  grid.appendChild(frag);
  
  // Apply filtering and setup controls
  setupArchiveControls();
}

let archivePage = 1;
const ARCHIVE_PAGE_SIZE = 50;
let controlsInitialized = false;

function updateArchiveGrid() {
  const grid = document.getElementById('archive-grid');
  if (!grid) return;
  
  const searchInput = document.getElementById('archive-search');
  const periodSelect = document.getElementById('archive-period');
  const activeBtn = document.querySelector('#filter-container .filter-btn.active');
  const activeRegionBtn = document.querySelector('.region-tab-btn.active');
  const regionId = activeRegionBtn ? (activeRegionBtn.getAttribute('data-region-id') || 'all') : 'all';
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const period = periodSelect ? periodSelect.value : 'all';
  const tagValue = activeBtn ? (activeBtn.getAttribute('data-tag-val') || 'all') : 'all';
  
  const rows = Array.from(grid.querySelectorAll('.bbn-archive-row'));
  const now = Date.now();
  
  const filteredRows = rows.filter(row => {
    // 0. Region filter
    const matchesRegion = (regionId === 'all' || row.dataset.region === regionId);

    // 1. Tag filter
    const rowTags = row.dataset.tags ? row.dataset.tags.split(',') : [];
    const matchesTag = (tagValue === 'all' || rowTags.includes(tagValue));
    
    // 2. Search query filter
    const rowTitle = row.dataset.title || '';
    const matchesSearch = (query === '' || rowTitle.includes(query));
    
    // 3. Period filter
    const rowTime = new Date(row.dataset.time).getTime();
    const ageHours = (now - rowTime) / (1000 * 60 * 60);
    let matchesPeriod = true;
    if (period === 'today') {
      matchesPeriod = (ageHours <= 24);
    } else if (period === 'week') {
      matchesPeriod = (ageHours <= 24 * 7);
    } else if (period === 'month') {
      matchesPeriod = (ageHours <= 24 * 30);
    }
    
    return matchesRegion && matchesTag && matchesSearch && matchesPeriod;
  });
  
  // Update total count
  const countNumEl = document.getElementById('archive-count-num');
  if (countNumEl) {
    countNumEl.textContent = filteredRows.length.toLocaleString('en-US');
  }
  
  // Paginate
  const totalPages = Math.max(Math.ceil(filteredRows.length / ARCHIVE_PAGE_SIZE), 1);
  if (archivePage > totalPages) {
    archivePage = totalPages;
  }
  if (archivePage < 1) {
    archivePage = 1;
  }
  
  const startIndex = (archivePage - 1) * ARCHIVE_PAGE_SIZE;
  const endIndex = startIndex + ARCHIVE_PAGE_SIZE;
  
  // Hide all rows first
  rows.forEach(r => r.style.display = 'none');
  
  // Show only filtered rows for the current page
  filteredRows.forEach((row, idx) => {
    if (idx >= startIndex && idx < endIndex) {
      row.style.display = '';
    }
  });
  
  // Render pagination controls
  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  let nav = document.getElementById('archive-pagination');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'archive-pagination';
    nav.className = 'archive-pagination';
    const grid = document.getElementById('archive-grid');
    if (grid) {
      grid.parentNode.insertBefore(nav, grid.nextSibling);
    }
  }
  
  if (totalPages <= 1) {
    nav.innerHTML = '';
    return;
  }
  
  let html = '';
  
  // Prev button
  html += `<button class="page-btn" ${archivePage === 1 ? 'disabled' : ''} onclick="changeArchivePage(${archivePage - 1})">&larr; Previous</button>`;
  
  // Page indicator
  html += `<span class="page-indicator">Page ${archivePage} of ${totalPages}</span>`;
  
  // Next button
  html += `<button class="page-btn" ${archivePage === totalPages ? 'disabled' : ''} onclick="changeArchivePage(${archivePage + 1})">Next &rarr;</button>`;
  
  nav.innerHTML = html;
}

window.changeArchivePage = function(page) {
  archivePage = page;
  updateArchiveGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function setupArchiveControls() {
  if (controlsInitialized) {
    updateArchiveGrid();
    return;
  }
  
  const searchInput = document.getElementById('archive-search');
  const periodSelect = document.getElementById('archive-period');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      archivePage = 1;
      updateArchiveGrid();
    });
  }
  
  if (periodSelect) {
    periodSelect.addEventListener('change', () => {
      archivePage = 1;
      updateArchiveGrid();
    });
  }
  
  controlsInitialized = true;
  updateArchiveGrid();
}

function applyActiveFilter() {
  const filterContainer = document.getElementById('filter-container');
  if (!filterContainer) return;
  const activeBtn = filterContainer.querySelector('.filter-btn.active');
  const tagValue = activeBtn ? (activeBtn.getAttribute('data-tag-val') || 'all') : 'all';
  
  // If we are on the archive page, let updateArchiveGrid handle search, period, category, and pagination
  if (document.getElementById('archive-grid')) {
    updateArchiveGrid();
    return;
  }
  
  const cards = document.querySelectorAll('.news-card, .bbn-archive-row');
  cards.forEach(c => {
    if (tagValue === 'all' || tagValue === 'all news') {
      c.style.display = '';
    } else {
      const cardTags = c.dataset.tags ? c.dataset.tags.split(',') : [];
      c.style.display = cardTags.includes(tagValue) ? '' : 'none';
    }
  });
}

function buildFilters(noticias) {
  const filterContainer = document.getElementById('filter-container');
  if (!filterContainer) return;
  
  // Retrieve the active tag before rebuilding to preserve state
  const activeBtn = filterContainer.querySelector('.filter-btn.active');
  const prevActiveTag = activeBtn ? (activeBtn.getAttribute('data-tag-val') || 'all') : 'all';
  
  const uniqueTags = new Set();
  noticias.forEach(item => {
    if (item.tags) {
      item.tags.forEach(t => uniqueTags.add(t));
    }
  });

  const allTags = Array.from(uniqueTags).sort();
  console.log('[BBN] Tags únicas encontradas:', allTags);

  // Check if the previously active tag still exists, otherwise fallback to 'all'
  const activeTag = (prevActiveTag === 'all' || allTags.includes(prevActiveTag)) ? prevActiveTag : 'all';

  let html = '      <span class="filter-label">FILTER:</span>\n';
  html += `      <button class="filter-btn${activeTag === 'all' ? ' active' : ''}" data-tag-val="all">All News</button>\n`;
  allTags.forEach(tag => {
    const capitalized = tag.charAt(0).toUpperCase() + tag.slice(1);
    const isActive = tag === activeTag;
    html += `      <button class="filter-btn${isActive ? ' active' : ''}" data-tag-val="${esc(tag)}">${esc(capitalized)}</button>\n`;
  });
  filterContainer.innerHTML = html;
  
  // Reapply the active filter tag after DOM updates
  applyActiveFilter();
}

async function init() {
  const now = new Date();
  const dateDisplay = document.getElementById('date-display');
  const locale = getCurrentLocale();
  if (dateDisplay) {
    dateDisplay.textContent = now.toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
  fetchBtcPrice();
  setInterval(fetchBtcPrice, 15000);

  const isPreRendered = (document.getElementById('article-container')
    && document.getElementById('article-container').children.length > 0
    && window.location.pathname.includes('/news/'))
    || Boolean(document.getElementById('page-tag-archive'));

  const isArticleUrl = window.location.pathname.includes('/news/');
  const isTagArchive = Boolean(document.getElementById('page-tag-archive'));

  if (isArticleUrl && !isPreRendered) {
    showPage('page-article');
    const container = document.getElementById('article-container');
    if (container && container.children.length === 0) {
      container.innerHTML = `
        <div class="state-message" style="padding: 4rem 1rem; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.75rem;">⏳</div>
          <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: #888;">Loading article...</div>
        </div>`;
    }
  } else if (!isPreRendered) {
    showSkeletons();
  }

  try {
    const noticias = await loadArticles();
    if (noticias.length > 0) {
      populateTicker(noticias);
      // Show the most recent 60 articles on the homepage regardless of age.
      // This prevents a blank homepage when the build pipeline hasn't run recently.
      const homepageNoticias = [...noticias]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 60);
      populateRows(homepageNoticias);

      // Always populate the archive grid with fresh Supabase data,
      // whether the user landed directly on /archive or navigated via JS.
      // NOTE: Do not overwrite pre-rendered tag archive grid!
      const archiveGrid = document.getElementById('archive-grid');
      if (archiveGrid) {
        if (!isTagArchive) {
          populateArchive(noticias);
          buildFilters(noticias);
        } else {
          setupArchiveControls();
        }
      }
    } else if (!isPreRendered) {
      showError(new Error('No articles available'));
    }

    if (!isPreRendered || !window.location.pathname.includes('/news/')) {
      if (!isTagArchive) {
        routeFromURL();
      }
    } else {
      showPage('page-article');
    }
  } catch (err) {
    if (!isPreRendered) {
      showError(err);
    } else {
      console.warn('[BBN] Failed to load articles on pre-rendered page — article still visible.', err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  window.addEventListener('popstate', routeFromURL);
  
  // Wire up 2-Tier Regional Navigation Tab switching
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.region-tab-btn');
    if (!tabBtn) return;

    e.preventDefault();
    const wrapper = tabBtn.closest('.regional-nav-wrapper');
    if (!wrapper) return;

    const regionId = tabBtn.getAttribute('data-region-id') || 'all';

    // Update active tab UI
    wrapper.querySelectorAll('.region-tab-btn').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');

    // If regionId is 'all', collapse sub-topics completely; otherwise expand
    if (regionId === 'all') {
      wrapper.classList.remove('has-region-active');
      wrapper.querySelectorAll('.region-subtags-panel').forEach(p => p.classList.remove('active'));
    } else {
      wrapper.classList.add('has-region-active');
      wrapper.querySelectorAll('.region-subtags-panel').forEach(p => {
        if (p.getAttribute('data-panel-region') === regionId) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    }

    // If on archive grid, update archive grid immediately
    if (document.getElementById('archive-grid')) {
      archivePage = 1;
      updateArchiveGrid();
      return;
    }

    // If on homepage feed, filter news cards
    const cards = document.querySelectorAll('.news-card');
    cards.forEach(c => {
      if (regionId === 'all') {
        c.style.display = '';
      } else {
        const cardReg = c.dataset.region || 'global';
        c.style.display = (cardReg === regionId) ? '' : 'none';
      }
    });
  });

  // Wire up delegated filter click listener
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#filter-container .filter-btn');
    if (!btn) return;
    
    const container = document.getElementById('filter-container');
    
    // Handle UI state
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Handle filtering using dynamic filter helper
    applyActiveFilter();
    
    // Close expanded panels if any
    if (typeof closePanel === 'function') {
      closePanel();
    }
  });
});

setInterval(async () => {
  console.log('[BBN] Refreshing articles...');
  try {
    const noticias = await loadArticles();
    if (noticias.length > 0) {
      populateTicker(noticias);
      const homepageNoticias = [...noticias]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 60);
      populateRows(homepageNoticias);
      // Never call populateArchive() on refresh — archive is a static page.
    }
  } catch (err) {
    console.warn('[BBN] Silent refresh failed:', err.message);
  }
}, 300000);
