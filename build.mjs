// ============================================================
// BBN Static Site Generator (SSG) — build.mjs
// Fetches articles from Supabase and generates static HTML
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { toSlug, extractTitle, extractBody, contentToHTML, esc } from './shared.mjs';

// ── Configuration ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'dist');

const CONFIG = {
  baseUrl: process.env.BBN_BASE_URL || 'https://bbnews.cc',
  defaultOgImage: '/assets/og-default.png',
  homepageRetentionHours: 48, // 2 days — homepage feed display limit
  supabaseUrl: process.env.SUPABASE_URL || 'https://thyibhsuhpxqexjvprct.supabase.co',
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  supabaseTable: 'articles',
  supabaseLimit: 500
};
const VERSION = Date.now().toString();

// ── Fetch articles from Supabase ──────────────────────────
async function fetchFromSupabase() {
  const { supabaseUrl, supabaseKey, supabaseTable, supabaseLimit } = CONFIG;

  if (!supabaseKey) {
    throw new Error('SUPABASE_ANON_KEY not set in environment variables.');
  }

  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  // [M-04] Colunas explícitas em vez de select=* para evitar exposição de campos internos futuros
  const cols = 'id,headline,content,article_lead,summary,hook,created_at,link';

  // Paginate to get all articles
  while (true) {
    const url = `${supabaseUrl}/rest/v1/${supabaseTable}?order=created_at.desc&limit=${pageSize}&offset=${from}&select=${cols}`;
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase fetch failed (${res.status}): ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    allRows = allRows.concat(rows);
    if (rows.length < pageSize || allRows.length >= supabaseLimit) break;
    from += pageSize;
  }

  if (allRows.length === 0) {
    throw new Error('No articles found in Supabase.');
  }

  // Map Supabase columns to BBN article format
  const list = allRows.map(row => {
    const title = (row.headline || 'Untitled').replace(/\*\*/g, '').trim();
    const content = row.content || row.article_lead || '';
    const summary = row.summary || (content ? content.substring(0, 160).replace(/\n/g, ' ').trim() : '');
    const hook = row.hook || '';
    const score = 7; // column removed from Supabase; defaulting to 7
    const time = row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date().toISOString();

    // Extract tags from content or headline using keywords
    const tags = extractTagsFromContent(title, content);

    return {
      id: String(row.id),
      link: '',
      time,
      score: isNaN(score) ? 7 : score,
      headline: title,
      title: title,
      hook: hook,
      summary: summary,
      tags: tags,
      conteudo_blog: content
    };
  });

  return list;
}

// ── Auto-tag articles based on keywords ──────────────────────
function extractTagsFromContent(title, content) {
  const text = `${title} ${content}`.toLowerCase();
  const tagMap = [
    ['bitcoin', ['bitcoin', 'btc', 'satoshi', 'lightning', 'taproot']],
    ['crypto', ['crypto', 'cryptocurrency', 'blockchain', 'defi', 'web3', 'nft', 'altcoin', 'ethereum', 'eth']],
    ['geopolitics', ['war', 'conflict', 'military', 'sanction', 'treaty', 'nato', 'invasion', 'missile', 'nuclear']],
    ['economy', ['economy', 'gdp', 'inflation', 'recession', 'fed', 'federal reserve', 'interest rate', 'central bank', 'selic', 'ipca']],
    ['markets', ['stock', 'market', 's&p', 'nasdaq', 'dow', 'etf', 'trading', 'commodity', 'gold', 'oil']],
    ['regulation', ['regulation', 'sec', 'law', 'ban', 'policy', 'compliance', 'court', 'legal', 'ruling']],
    ['brazil', ['brazil', 'brasil', 'lula', 'stf', 'banco central', 'haddad', 'brasília', 'selic']],
    ['energy', ['energy', 'oil', 'gas', 'opec', 'petroleum', 'pipeline', 'renewables', 'nuclear']]
  ];

  const matched = [];
  for (const [tag, keywords] of tagMap) {
    if (keywords.some(kw => text.includes(kw))) {
      matched.push(tag);
    }
    if (matched.length >= 4) break;
  }

  return matched.length > 0 ? matched : ['news'];
}

// ── Process articles into slugMap ──────────────────────────
function processArticles(articles) {
  const slugMap = {};
  const processed = [];

  articles.forEach(row => {
    const content = row.conteudo_blog || row.headline;
    const title = row.headline && row.headline !== 'Untitled'
      ? row.headline
      : extractTitle(content);
    const body = extractBody(content, title);
    let slug = toSlug(title);
    if (slugMap[slug]) slug = `${slug}-${row.id}`;

    const post = {
      id: row.id,
      title,
      body,
      slug,
      link: row.link ?? '',
      summary: row.summary || '',
      hook: row.hook || '',
      time: row.time,
      score: row.score,
      tags: row.tags || []
    };
    slugMap[slug] = post;
    processed.push(post);
  });

  return { slugMap, processed };
}

// Garante que URLs de links externos não usem esquemas perigosos (ex: javascript:)
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return '';
  return url.trim();
}

// ── Generate article HTML from template ────────────────────
function generateArticlePage(post, template) {
  const description = post.summary || post.body.replace(/\n/g, ' ').slice(0, 160).trim();
  const ogUrl = `${CONFIG.baseUrl}/news/${post.slug}`;
  const ogImage = CONFIG.baseUrl + CONFIG.defaultOgImage;
  const breadcrumb = esc(post.title.slice(0, 45)) + (post.title.length > 45 ? '…' : '');
  const articleBodyHtml = contentToHTML(post.body);
  const safeLink = sanitizeUrl(post.link);
  const sourceBtn = safeLink
    ? `<a class="article-source-btn" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">→ View original source</a>`
    : '';

  // Article category from first tag, fallback to "Notícias"
  const articleCategory = (post.tags && post.tags.length > 0)
    ? post.tags[0].charAt(0).toUpperCase() + post.tags[0].slice(1)
    : 'Notícias';

  // JSON-LD NewsArticle structured data
  const jsonLdArticle = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": post.title,
    "description": description,
    "datePublished": post.time,
    "dateModified": post.time,
    "image": ogImage,
    "url": ogUrl,
    "author": {
      "@type": "Organization",
      "name": "BBN – Bitcoin Brasil News"
    },
    "publisher": {
      "@type": "Organization",
      "name": "BBN – Bitcoin Brasil News",
      "logo": {
        "@type": "ImageObject",
        "url": `${CONFIG.baseUrl}/assets/logo.png`
      }
    },
    "isAccessibleForFree": true,
    "inLanguage": "pt-BR"
  }, null, 4);

  // [C-01] Config injetada no HTML para evitar hardcode no app.js
  const bbnConfigArticle = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{OG_TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{OG_DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{OG_URL\}\}/g, () => ogUrl);
  html = html.replace(/\{\{OG_IMAGE\}\}/g, () => ogImage);
  html = html.replace(/\{\{PUBLISHED_TIME\}\}/g, () => post.time);
  html = html.replace(/\{\{ARTICLE_CATEGORY\}\}/g, () => esc(articleCategory));
  html = html.replace(/\{\{JSON_LD_ARTICLE\}\}/g, () => jsonLdArticle);
  html = html.replace(/\{\{BREADCRUMB\}\}/g, () => breadcrumb);
  html = html.replace(/\{\{ARTICLE_TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{ARTICLE_BODY\}\}/g, () => articleBodyHtml);
  html = html.replace(/\{\{SOURCE_BUTTON\}\}/g, () => sourceBtn);
  html = html.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfigArticle);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
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

// ── Generate archive grid HTML for SEO ───────────────────────
function generateArchiveGrid(articles) {
  return articles.map(a => {
    const dt = new Date(a.time);
    const dataUS = dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const ageHours = (Date.now() - dt.getTime()) / (1000 * 60 * 60);
    const relativo = formatRelativeTime(ageHours);
    
    // Calculate decay score to determine impact badge
    let score = parseFloat(a.score) || 10;
    let cs = score;
    if (ageHours >= 3 && ageHours <= 12) {
      cs = Math.max(score - Math.floor((ageHours - 3) / 2) * 0.5, 6);
    } else if (ageHours > 12 && ageHours <= 24) {
      const score12h = Math.max(score - Math.floor((12 - 3) / 2) * 0.5, 6);
      cs = Math.max(score12h - ((ageHours - 12) / 12) * Math.max(score12h - 6, 0), 6);
    } else if (ageHours > 24) {
      cs = Math.min(score, 6);
    }

    let badge = 'NORMAL';
    let badgeClass = 'normal';
    if (cs >= 9) {
      badge = 'CRITICAL';
      badgeClass = 'critical';
    } else if (cs >= 8) {
      badge = 'HIGH IMPACT';
      badgeClass = 'high-impact';
    }

    const tagsAttr = a.tags && a.tags.length > 0 ? ` data-tags="${esc(a.tags.join(','))}"` : ' data-tags=""';

    return `
<a href="/news/${a.slug}" class="bbn-archive-row"${tagsAttr} data-time="${a.time}" data-title="${esc(a.title).toLowerCase()}">
  <div class="bbn-meta">
    <span class="bbn-badge-impact ${badgeClass}">${badge}</span>
    <span class="bbn-date">${dataUS}</span>
    <span class="bbn-relative-time">${relativo}</span>
  </div>
  <div class="bbn-title">
    <h3>${esc(a.title)}</h3>
  </div>
  <div class="bbn-action">Read <span>&rarr;</span></div>
</a>`;
  }).join('\n');
}

// ── Generate filters HTML ───────────────────────────────────
function generateFiltersHtml(articles) {
  const uniqueTags = new Set();
  articles.forEach(a => {
    if (a.tags) {
      a.tags.forEach(t => uniqueTags.add(t));
    }
  });
  const allTags = Array.from(uniqueTags).sort();
  
  let html = '      <span class="filter-label">FILTER:</span>\n';
  html += '      <button class="filter-btn active" data-tag-val="all">All News</button>\n';
  allTags.forEach(tag => {
    const capitalized = tag.charAt(0).toUpperCase() + tag.slice(1);
    html += `      <button class="filter-btn" data-tag-val="${esc(tag)}">${esc(capitalized)}</button>\n`;
  });
  return html;
}

// ── Generate homepage HTML from template ───────────────────
function generateHomePage(articles, template) {
  // Build SEO article index for noscript
  const articleIndex = articles
    .map(a => `          <li><a href="/news/${a.slug}">${esc(a.title)}</a></li>`)
    .join('\n');

  // [C-01] Config injetada no HTML para evitar hardcode no app.js (que fica no git)
  const bbnConfig = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  html = html.replace(/\{\{ARTICLE_INDEX\}\}/g, () => articleIndex);
  html = html.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfig);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
}

// ── Ensure directory exists ────────────────────────────────
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ── Main build ─────────────────────────────────────────────
async function build() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        BBN Static Site Generator         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Load existing database if available
  const DB_FILE = join(__dirname, 'articles-db.json');
  let dbArticles = [];
  if (existsSync(DB_FILE)) {
    try {
      dbArticles = JSON.parse(readFileSync(DB_FILE, 'utf-8'));
      console.log(`📦 Loaded ${dbArticles.length} articles from local database`);
    } catch (e) {
      console.warn(`⚠️ Failed to load local database: ${e.message}`);
    }
  }

  // 1. Fetch articles from Supabase
  console.log('⏳ Connecting to Supabase...');
  let fetchedArticles = [];
  try {
    fetchedArticles = await fetchFromSupabase();
    console.log(`✅ Fetched ${fetchedArticles.length} articles from Supabase`);
  } catch (err) {
    console.error(`❌ Failed to fetch articles from Supabase: ${err.message}`);
    process.exit(1);
  }

  // Merge articles: prioritize fetchedArticles but preserve all historical ones
  const articleMap = new Map();
  dbArticles.forEach(item => {
    if (item && item.id) articleMap.set(item.id, item);
  });
  fetchedArticles.forEach(item => {
    if (item && item.id) articleMap.set(item.id, item);
  });

  const mergedArticles = Array.from(articleMap.values());
  // Sort merged articles by time descending (newest first)
  mergedArticles.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Save updated database
  try {
    writeFileSync(DB_FILE, JSON.stringify(mergedArticles, null, 2), 'utf-8');
    console.log(`💾 Saved ${mergedArticles.length} articles back to local database`);
  } catch (e) {
    console.error(`❌ Failed to save local database: ${e.message}`);
  }

  // 2. Process ALL articles (permanent SEO pages)
  const { slugMap, processed } = processArticles(mergedArticles);
  console.log(`📝 Processed ${processed.length} articles into slug map`);

  // 3. Separate homepage articles (120h retention) from full archive
  const homepageArticles = processed.filter(post => {
    const ageHours = (Date.now() - new Date(post.time).getTime()) / (1000 * 60 * 60);
    return ageHours < CONFIG.homepageRetentionHours;
  });
  console.log(`🏠 ${homepageArticles.length} articles within ${CONFIG.homepageRetentionHours}h window for homepage`);

  // 4. Read templates
  const articleTemplate = readFileSync(join(__dirname, 'template-article.html'), 'utf-8');
  const homeTemplate = readFileSync(join(__dirname, 'template-home.html'), 'utf-8');

  // 5. Clean and create dist directory
  ensureDir(DIST_DIR);
  ensureDir(join(DIST_DIR, 'assets'));
  ensureDir(join(DIST_DIR, 'news'));

  // 6. Copy static assets
  const staticFiles = ['style.css', 'app.js'];
  for (const file of staticFiles) {
    const src = join(__dirname, file);
    const dest = join(DIST_DIR, file);
    if (existsSync(src)) {
      cpSync(src, dest, { force: true });
      console.log(`📦 Copied ${file}`);
    }
  }

  // Copy OG default image if it exists
  const ogSrc = join(__dirname, 'assets', 'og-default.png');
  const ogDest = join(DIST_DIR, 'assets', 'og-default.png');
  if (existsSync(ogSrc)) {
    cpSync(ogSrc, ogDest, { force: true });
    console.log('📦 Copied og-default.png');
  } else {
    console.log('⚠️  No og-default.png found in /assets — social previews will have no image');
  }

  // Copy favicon if it exists
  const favSrc = join(__dirname, 'public', 'favicon.ico');
  const favDest = join(DIST_DIR, 'favicon.ico');
  if (existsSync(favSrc)) {
    cpSync(favSrc, favDest, { force: true });
    console.log('📦 Copied favicon.ico');
  }

  // Copy robots.txt if it exists in public/
  const robotsSrc = join(__dirname, 'public', 'robots.txt');
  const robotsDest = join(DIST_DIR, 'robots.txt');
  if (existsSync(robotsSrc)) {
    cpSync(robotsSrc, robotsDest, { force: true });
    console.log('📦 Copied robots.txt');
  }

  // Copy manifest.json if it exists
  const manifestSrc = join(__dirname, 'manifest.json');
  const manifestDest = join(DIST_DIR, 'manifest.json');
  if (existsSync(manifestSrc)) {
    cpSync(manifestSrc, manifestDest, { force: true });
    console.log('📦 Copied manifest.json');
  }

  // Copy all files in assets/ directory to dist/assets/
  const assetsDir = join(__dirname, 'assets');
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, join(DIST_DIR, 'assets'), { recursive: true, force: true });
    console.log('📦 Copied all assets/');
  }

  // 7. Generate article pages for ALL articles (permanent SEO URLs)
  let articlesBuilt = 0;
  for (const post of processed) {
    let articleHtml = generateArticlePage(post, articleTemplate);

    const articleDir = join(DIST_DIR, 'news', post.slug);
    ensureDir(articleDir);
    writeFileSync(join(articleDir, 'index.html'), articleHtml, 'utf-8');
    articlesBuilt++;
  }
  console.log(`🏗️  Generated ${articlesBuilt} article pages (all-time archive)`);

  // 8. Generate homepage (uses only 48h-window articles for SEO index)
  const filtersHtml = generateFiltersHtml(homepageArticles);
  let homeHtml = generateHomePage(homepageArticles, homeTemplate);
  homeHtml = homeHtml.replace(/\{\{FILTERS\}\}/g, () => filtersHtml);
  writeFileSync(join(DIST_DIR, 'index.html'), homeHtml, 'utf-8');
  console.log(`🏠 Generated homepage (${homepageArticles.length} articles in SEO index)`);

  // Generate archive page (archive.html and archive/index.html for clean URLs)
  const archiveTemplate = readFileSync(join(__dirname, 'template-archive.html'), 'utf-8');
  const bbnConfig = JSON.stringify({ url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey });
  let archiveHtml = archiveTemplate;
  archiveHtml = archiveHtml.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  archiveHtml = archiveHtml.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfig);
  const archiveFiltersHtml = generateFiltersHtml(processed);
  archiveHtml = archiveHtml.replace(/\{\{FILTERS\}\}/g, () => archiveFiltersHtml);
  const archiveGridHtml = generateArchiveGrid(processed);
  archiveHtml = archiveHtml.replace(/\{\{ARCHIVE_GRID\}\}/g, () => archiveGridHtml);
  archiveHtml = archiveHtml.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);
  
  // Legacy support
  writeFileSync(join(DIST_DIR, 'archive.html'), archiveHtml, 'utf-8');
  
  // Clean URL support /archive
  const archiveDir = join(DIST_DIR, 'archive');
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }
  writeFileSync(join(archiveDir, 'index.html'), archiveHtml, 'utf-8');
  console.log(`📂 Generated archive pages (archive.html & archive/index.html)`);

  // Generate privacy policy page
  const privacyTemplate = readFileSync(join(__dirname, 'template-privacy.html'), 'utf-8');
  let privacyHtml = privacyTemplate;
  privacyHtml = privacyHtml.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  privacyHtml = privacyHtml.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  // Legacy support
  writeFileSync(join(DIST_DIR, 'privacy.html'), privacyHtml, 'utf-8');

  // Clean URL support /privacy
  const privacyDir = join(DIST_DIR, 'privacy');
  if (!existsSync(privacyDir)) {
    mkdirSync(privacyDir, { recursive: true });
  }
  writeFileSync(join(privacyDir, 'index.html'), privacyHtml, 'utf-8');
  console.log(`🔒 Generated privacy policy pages (privacy.html & privacy/index.html)`);

  // Export articles database for client consumption
  writeFileSync(join(DIST_DIR, 'articles.json'), JSON.stringify(mergedArticles), 'utf-8');
  console.log(`📂 Exported articles.json database`);

  // 9. Generate nginx config snippet for reference
  const nginxSnippet = `# BBN Nginx config snippet — place inside your server {} block
# Clean URLs: /news/slug serves /news/slug/index.html automatically
# Nginx does this by default with 'try_files', no special rewrite needed.
#
# server {
#     listen 80;
#     server_name www.bbnews.cc bbnews.cc;
#     root /var/www/bbn/dist;
#     index index.html;
#
#     location / {
#         try_files $uri $uri/ /index.html;
#     }
#
#     # Cache static assets
#     location ~* \\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
#         expires 7d;
#         add_header Cache-Control "public, immutable";
#     }
# }
`;
  writeFileSync(join(DIST_DIR, 'nginx.conf.example'), nginxSnippet, 'utf-8');

  // 10. Generate sitemap.xml (Google News + Image namespaces)
  const sitemapXml = generateSitemap(processed, CONFIG.baseUrl);
  writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`🗺️  Generated sitemap.xml (${processed.length + 3} URLs — news + image namespace)`);

  // 11. Generate RSS 2.0 feed (feed.xml)
  const rssFeed = generateRssFeed(processed, CONFIG.baseUrl);
  writeFileSync(join(DIST_DIR, 'feed.xml'), rssFeed, 'utf-8');
  console.log(`📡 Generated feed.xml (${processed.length} items — RFC 822 / WebSub-ready)`);

  // 12. Generate _redirects for Netlify / static hosts
  const redirectsContent = `# Netlify / static host redirects — auto-generated by build.mjs
# Static pages — serve their own index.html directly
/privacy        /privacy/index.html     200
/privacy/       /privacy/index.html     200
/archive        /archive/index.html     200
/archive/       /archive/index.html     200

# Article pages
/news/*         /news/:splat/index.html 200

# Legacy slug path
/noticia/*      /noticia/:splat/index.html  200

# SPA fallback — all other paths serve the root index.html
/*              /index.html             200
`;
  writeFileSync(join(DIST_DIR, '_redirects'), redirectsContent, 'utf-8');
  console.log('🔀 Generated _redirects (Netlify routing rules)');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`✨ Build complete in ${elapsed}s`);
  console.log(`📁 Output: ${DIST_DIR}`);
  console.log(`🔗 Articles: ${articlesBuilt}`);
  console.log('');

  // List generated articles
  console.log('Generated articles:');
  for (const post of processed) {
    console.log(`  /news/${post.slug}`);
  }
  console.log('');
}

// ── XML helpers ─────────────────────────────────────────────

/**
 * Escape all XML special characters. Also strips ASCII control chars
 * (U+0000–U+001F except tab, LF, CR) which are illegal in XML 1.0
 * and will cause Google Search Console to reject the file.
 */
function escXml(str) {
  return String(str ?? '')
    // Strip illegal XML 1.0 control characters (keep \t \n \r)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a Date object to a strict RFC 822 string.
 * Format: Ddd, DD Mon YYYY HH:MM:SS GMT
 * This is required by RSS 2.0 / <pubDate>.
 */
function toRfc822(date) {
  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

/**
 * Detect financial ticker symbols that are likely present in the article.
 * Returns a comma-separated string of relevant tickers, or empty string.
 */
function detectTickers(title, tags) {
  const text = `${title} ${(tags || []).join(' ')}`.toLowerCase();
  const tickers = [];

  // Crypto tickers
  if (/\bbitcoin\b|\bbtc\b/.test(text))     tickers.push('CRYPTO:BTC');
  if (/\bethereum\b|\beth\b/.test(text))    tickers.push('CRYPTO:ETH');
  if (/\bsolana\b|\bsol\b/.test(text))     tickers.push('CRYPTO:SOL');
  if (/\bripple\b|\bxrp\b/.test(text))     tickers.push('CRYPTO:XRP');
  if (/\bcardano\b|\bada\b/.test(text))    tickers.push('CRYPTO:ADA');
  if (/\bdogecoin\b|\bdoge\b/.test(text))  tickers.push('CRYPTO:DOGE');
  if (/\bbnb\b|\bbinance coin\b/.test(text)) tickers.push('CRYPTO:BNB');

  // Equity / ETF tickers
  if (/\bmicrostrategy\b|\bmstr\b/.test(text))  tickers.push('NASDAQ:MSTR');
  if (/\bcoinbase\b|\bcoin\b/.test(text))        tickers.push('NASDAQ:COIN');
  if (/\bapple\b|\baapl\b/.test(text))           tickers.push('NASDAQ:AAPL');
  if (/\btesla\b|\btsla\b/.test(text))           tickers.push('NASDAQ:TSLA');
  if (/\bspot bitcoin etf\b|\bbitcoin etf\b|\bibit\b/.test(text)) tickers.push('NASDAQ:IBIT');
  if (/\bs&p 500\b|\bsp500\b/.test(text))        tickers.push('INDEXSP:.INX');

  // Commodities
  if (/\bgold\b/.test(text))  tickers.push('COMMODITY:XAUUSD');
  if (/\bsilver\b/.test(text)) tickers.push('COMMODITY:XAGUSD');
  if (/\boil\b|\bopec\b|\bpetroleum\b/.test(text)) tickers.push('COMMODITY:USOIL');

  return tickers.join(',');
}

// ── Generate sitemap.xml ─────────────────────────────────────
/**
 * Generates a premium SEO sitemap conforming to:
 *   - https://www.sitemaps.org/schemas/sitemap/0.9
 *   - https://www.google.com/schemas/sitemap-news/0.9
 *   - https://www.google.com/schemas/sitemap-image/1.1
 *
 * Each article URL block contains:
 *   <image:image>  → cover image for Google Images
 *   <news:news>    → full Google News block with keywords & stock tickers
 */
function generateSitemap(articles, baseUrl) {
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const defaultImage = `${baseUrl}/assets/og-default.png`;

  // Static pages — standard sitemap entries (no news: block)
  const staticPages = [
    { loc: `${baseUrl}/`,        changefreq: 'always',  priority: '1.0', lastmod: now },
    { loc: `${baseUrl}/archive`, changefreq: 'daily',   priority: '0.8', lastmod: now },
    { loc: `${baseUrl}/privacy`, changefreq: 'yearly',  priority: '0.3', lastmod: now }
  ];

  const staticEntries = staticPages.map(p => `
  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  // Article pages — Google News + Image sitemap entries
  const newsEntries = articles.map(post => {
    const articleUrl  = `${baseUrl}/news/${post.slug}`;
    const pubDate     = post.time ? new Date(post.time).toISOString() : new Date().toISOString();
    const lastmod     = pubDate.split('T')[0];
    const title       = escXml(post.title);
    const imageUrl    = defaultImage; // All articles share the OG default; swap with per-article URL when available
    const imageTitle  = title;

    // keywords: up to 10 tags, comma-separated
    const keywords    = escXml((post.tags || []).slice(0, 10).join(', '));

    // stock tickers: auto-detected from title + tags
    const tickers     = detectTickers(post.title, post.tags);
    const tickerBlock = tickers
      ? `\n      <news:stock_tickers>${escXml(tickers)}</news:stock_tickers>`
      : '';

    return `
  <url>
    <loc>${articleUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <image:image>
      <image:loc>${imageUrl}</image:loc>
      <image:title>${imageTitle}</image:title>
    </image:image>
    <news:news>
      <news:publication>
        <news:name>Bitcoin Brasil News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
      <news:keywords>${keywords}</news:keywords>${tickerBlock}
    </news:news>
  </url>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${staticEntries}${newsEntries}
</urlset>`;
}

// ── Generate RSS 2.0 feed (feed.xml) ─────────────────────────
/**
 * Generates a valid RSS 2.0 feed for WebSub / Google Discover / aggregators.
 *
 * Spec references:
 *   - RSS 2.0: https://www.rssboard.org/rss-specification
 *   - RFC 822 dates: required for <pubDate>
 *   - <enclosure>: used for cover images (Google Discover picks these up)
 */
function generateRssFeed(articles, baseUrl) {
  const buildDate   = toRfc822(new Date());
  const defaultImage = `${baseUrl}/assets/og-default.png`;
  // Rough JPEG byte estimate for the default OG image; actual size TBD.
  // Set to 0 to let validators infer length from response headers.
  const DEFAULT_IMAGE_BYTES = 0;

  const items = articles.map(post => {
    const articleUrl = `${baseUrl}/news/${post.slug}`;
    const pubDate    = toRfc822(new Date(post.time || Date.now()));

    // Summary / description — strip any residual Markdown and XML-escape
    const rawDesc = post.summary || post.hook || post.body?.slice(0, 280) || post.title;
    const description = escXml(rawDesc.replace(/\*\*/g, '').replace(/\*/g, '').trim());

    // Cover image enclosure — all articles use the default OG image;
    // replace imageUrl with a per-article cover URL when your pipeline provides one.
    const imageUrl    = defaultImage;
    const enclosure   = `<enclosure url="${imageUrl}" length="${DEFAULT_IMAGE_BYTES}" type="image/jpeg" />`;

    // Categories from tags
    const categoryTags = (post.tags || []).map(t => `<category>${escXml(t)}</category>`).join('\n        ');

    return `
    <item>
      <title>${escXml(post.title)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      ${enclosure}
      ${categoryTags}
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Bitcoin Brasil News</title>
    <link>${baseUrl}</link>
    <description>Real-time Bitcoin, crypto, and global financial news curated for investors worldwide.</description>
    <language>en</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <ttl>15</ttl>
    <image>
      <url>${baseUrl}/assets/og-default.png</url>
      <title>Bitcoin Brasil News</title>
      <link>${baseUrl}</link>
    </image>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
