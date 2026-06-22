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

  // Paginate to get all articles
  while (true) {
    const url = `${supabaseUrl}/rest/v1/${supabaseTable}?order=created_at.desc&limit=${pageSize}&offset=${from}&select=*`;
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
    const score = row.score ? parseInt(row.score) : 7;
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

// ── Generate article HTML from template ────────────────────
function generateArticlePage(post, template) {
  const description = post.summary || post.body.replace(/\n/g, ' ').slice(0, 160).trim();
  const ogUrl = `${CONFIG.baseUrl}/news/${post.slug}`;
  const ogImage = CONFIG.baseUrl + CONFIG.defaultOgImage;
  const breadcrumb = esc(post.title.slice(0, 45)) + (post.title.length > 45 ? '…' : '');
  const articleBodyHtml = contentToHTML(post.body);
  const sourceBtn = post.link
    ? `<a class="article-source-btn" href="${esc(post.link)}" target="_blank" rel="noopener noreferrer">→ View original source</a>`
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

  let html = template;
  html = html.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  html = html.replace(/\{\{ARTICLE_INDEX\}\}/g, () => articleIndex);

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
  let archiveHtml = archiveTemplate;
  archiveHtml = archiveHtml.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
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

  // 10. Generate sitemap.xml
  const sitemapXml = generateSitemap(processed, CONFIG.baseUrl);
  writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`🗺️  Generated sitemap.xml (${processed.length + 2} URLs)`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
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

// ── Generate sitemap.xml ────────────────────────────────
function escXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSitemap(articles, baseUrl) {
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Static pages — standard sitemap format
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

  // Article pages — Google News sitemap format
  const newsEntries = articles.map(post => {
    const articleUrl = `${baseUrl}/news/${post.slug}`;
    const pubDate = post.time || new Date().toISOString();
    const lastmod = post.time ? post.time.split('T')[0] : now;
    const title = escXml(post.title);

    return `
  <url>
    <loc>${articleUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <news:news>
      <news:publication>
        <news:name>Bitcoin Brasil News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
    </news:news>
  </url>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${staticEntries}${newsEntries}
</urlset>`;
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
