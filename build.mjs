// ============================================================
// BBN Static Site Generator (SSG) — build.mjs
// Fetches articles from Nostr relays and generates static HTML
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { toSlug, extractTitle, extractBody, contentToHTML, esc } from './shared.mjs';

// ── Configuration ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'dist');

const CONFIG = {
  baseUrl: process.env.BBN_BASE_URL || 'https://www.bbnews.cc',
  defaultOgImage: '/assets/og-default.png',
  homepageRetentionHours: 48, // 2 days — homepage feed display limit
relays: [
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.snort.social'
  ],
  author: 'b5467ea20bac695e535859f72589c1429fabdff1518e939515314385ee6c1d50',
  timeoutMs: 8000
};
const VERSION = Date.now().toString();

// ── Fetch articles from Nostr relays ───────────────────────
function fetchFromNostr() {
  return new Promise((resolve, reject) => {
    const events = new Map();
    let relaysFinished = 0;
    let timeoutId;

    const finish = () => {
      clearTimeout(timeoutId);
      const list = Array.from(events.values()).map(event => {
        const getTag = (name) => {
          const t = event.tags.find(tag => tag[0] === name);
          return t ? t[1] : '';
        };
        const title = (getTag('title') || 'Untitled').replace(/\*\*/g, '');
        const hook = (getTag('hook') || '').replace(/\*\*/g, '');
        const summary = (getTag('summary') || getTag('description') || (
          event.content 
            ? event.content.substring(0, 120).replace(/^[#*\s]+/gm, '').replace(/\n/g, ' ').trim() + '...' 
            : ''
        )).replace(/\*\*/g, '');
        const id_noticia = getTag('id_noticia') || event.id;

        let articleData = {};
        try {
          articleData = JSON.parse(event.content);
        } catch(e) {}

        let tags = [];
        if (event.tags) {
          tags = event.tags
            .filter(t => t[0] === 't')
            .map(t => t[1].replace(/#/g, '').trim().toLowerCase())
            .filter(Boolean);
        }
        if (tags.length === 0 && articleData.tag) {
          tags = articleData.tag.split(/\s+/).map(t => t.replace(/#/g, '').trim().toLowerCase()).filter(Boolean);
        }

        return {
          id: id_noticia,
          link: '',
          time: new Date(event.created_at * 1000).toISOString(),
          score: 10,
          headline: title,
          title: title,
          hook: hook,
          summary: summary,
          tags: tags,
          conteudo_blog: event.content
        };
      });

      // No retention filter — generate permanent SEO pages for ALL articles.
      // Homepage feed filtering (120h) is applied separately in the build step.
      if (list.length === 0) {
        reject(new Error('No articles found from Nostr relays.'));
      } else {
        resolve(list);
      }
    };

    timeoutId = setTimeout(finish, CONFIG.timeoutMs);

    const filter = {
      authors: [CONFIG.author],
      kinds: [1, 30023], // <-- ATUALIZADO: Aceitando notas simples e artigos longos
      limit: 50
    };
    const subId = 'bbn_build_' + Math.random().toString(36).substring(2);
    const reqMessage = JSON.stringify(['REQ', subId, filter]);

    CONFIG.relays.forEach(url => {
      try {
        const ws = new WebSocket(url);
        ws.on('open', () => ws.send(reqMessage));
        ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed[0] === 'EVENT' && parsed[1] === subId) {
              const ev = parsed[2];
              if (!events.has(ev.id)) events.set(ev.id, ev);
            } else if (parsed[0] === 'EOSE' && parsed[1] === subId) {
              ws.close();
            }
          } catch (err) { /* ignore parse errors */ }
        });
        ws.on('close', () => {
          relaysFinished++;
          if (relaysFinished === CONFIG.relays.length) finish();
        });
        ws.on('error', () => ws.close());
      } catch (err) {
        relaysFinished++;
      }
    });
  });
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

  let html = template;
  html = html.replace(/\{\{TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{OG_TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{OG_DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{OG_URL\}\}/g, () => ogUrl);
  html = html.replace(/\{\{OG_IMAGE\}\}/g, () => ogImage);
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

  // 1. Fetch articles from Nostr
  console.log('⏳ Connecting to Nostr relays...');
  let fetchedArticles = [];
  try {
    fetchedArticles = await fetchFromNostr();
    console.log(`✅ Fetched ${fetchedArticles.length} articles from relays`);
  } catch (err) {
    console.error(`❌ Failed to fetch articles: ${err.message}`);
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

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
