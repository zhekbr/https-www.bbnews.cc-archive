// --- BBN Configuration (injetada pelo build SSG via window.__BBN_CONFIG__) ---
const SUPABASE_URL = window.__BBN_CONFIG__?.url || '';
const SUPABASE_ANON_KEY = window.__BBN_CONFIG__?.key || '';

const ROWS_COUNT = 3;
let activeCard = null;
let slugMap = {};

function toSlug(text) {
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

function renderArticle(post) {
  const container = document.getElementById('article-container');
  const safeLink = sanitizeUrl(post.link);
  const sourceBtn = safeLink
    ? `<a class="article-source-btn" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">→ View original source</a>`
    : '';

  container.innerHTML = `
    <div class="article-breadcrumb">
      <span class="breadcrumb-home" onclick="goHome()">BBN</span>
      <span>›</span>
      <span>${esc(post.title.slice(0, 45))}${post.title.length > 45 ? '…' : ''}</span>
    </div>
    <h1 class="article-title">${esc(post.title)}</h1>
    <hr class="article-divider">
    <div class="article-body">${contentToHTML(post.body)}</div>
    <div style="margin-top:2.5rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;">
      ${sourceBtn}
      <button class="article-back-btn" onclick="goHome()">← Back to news</button>
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

  if (pageHome) pageHome.classList.remove('active');
  if (pageArticle) pageArticle.classList.remove('active');
  if (pageArchive) pageArchive.classList.remove('active');

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
    if (pageId === 'page-home' && href === '/') {
      link.classList.add('active');
    } else if (pageId === 'page-archive' && href === '/archive') {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  if (!document.getElementById('page-home')) {
    window.location.href = '/';
    return;
  }
  try { history.pushState(null, '', '/'); } catch (e) { window.location.href = '/'; return; }
  showPage('page-home');
  document.title = 'BBN – Bitcoin Brasil News';
  closePanel();
}

function goArchive() {
  if (!document.getElementById('page-archive')) {
    window.location.href = '/archive';
    return;
  }
  try { history.pushState(null, '', '/archive'); } catch (e) { window.location.href = '/archive'; return; }
  showPage('page-archive');
  document.title = 'Arquivo de Notícias | BBN – Bitcoin Brasil News';
  closePanel();
}

function goArticle(slug) {
  const post = slugMap[slug];
  const url = `/news/${slug}`;
  try { history.pushState(null, '', url); } catch (e) { window.location.href = url; }

  if (!post) {
    showPage('page-article');
    renderArticleNotFound(slug);
    return;
  }
  document.title = `${post.title} — BBN`;
  showPage('page-article');
  renderArticle(post);
}

function routeFromURL() {
  const path = window.location.pathname;

  // Static standalone pages — app.js is loaded but these pages render their
  // own content; returning early prevents the SPA router from redirecting
  // back to "/" when page-home doesn't exist in the current DOM.
  if (
    path === '/privacy' ||
    path === '/privacy/' ||
    path === '/privacy/index.html' ||
    path === '/privacy.html'
  ) {
    return;
  }

  if (
    path === '/archive' ||
    path === '/archive/' ||
    path === '/archive/index.html' ||
    path === '/archive.html' ||
    path === '/mais-noticias' ||
    path === '/mais-noticias/'
  ) {
    goArchive();
    return;
  }
  const articleMatch = path.match(/^\/news\/(.+?)(?:\/)?$/);
  if (articleMatch) {
    goArticle(articleMatch[1]);
    return;
  }
  // Legacy hash routing support (redirect to clean URL)
  const hash = window.location.hash;
  const hashMatch = hash.match(/^#\/news\/(.+)$/);
  if (hashMatch) {
    const slug = hashMatch[1];
    history.replaceState(null, '', `/news/${slug}`);
    goArticle(slug);
    return;
  }
  showPage('page-home');
  document.title = 'BBN – Bitcoin Brasil News';
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

function processArticleRows(rows) {
  rows.forEach((row) => {
    const content = row.conteudo_blog || row.headline;
    const title = row.headline && row.headline !== 'Untitled' ? row.headline : extractTitle(content);
    const body = extractBody(content, title);
    let slug = toSlug(title);
    if (slugMap[slug]) slug = `${slug}-${row.id}`;
    const post = { id: row.id, title, body, slug, link: row.link ?? '' };
    slugMap[slug] = post;
    row._slug = slug;
    row.title = title;
  });
}

async function fetchFromSupabase() {
  // [M-04] select=* substituído por colunas explícitas para evitar exposição de campos internos futuros
  const cols = 'id,headline,content,article_lead,summary,hook,created_at,link';
  const url = `${SUPABASE_URL}/rest/v1/articles?order=created_at.desc&limit=500&select=${cols}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No articles in Supabase');

  // Map Supabase columns to BBN article format
  return rows.map(row => {
    const headlineClean = (row.headline || 'Untitled').replace(/\*\*/g, '').trim();
    return {
      id: String(row.id),
      headline: headlineClean,
      title: headlineClean,
      conteudo_blog: row.content || row.article_lead || '',
      summary: row.summary || '',
      hook: row.hook || '',
      score: 7, // column removed from Supabase; defaulting to 7
      time: row.created_at || new Date().toISOString(),
      link: '',
      tags: clientExtractTags(row.headline || '', row.content || '')
    };
  });
}

async function loadArticles() {
  try {
    // Primary source: Supabase (always up to date)
    const articles = await fetchFromSupabase();
    processArticleRows(articles);
    console.log(`[BBN] Loaded ${articles.length} articles from Supabase`);
    return articles;
  } catch (supErr) {
    console.warn('[BBN] Supabase fetch failed, falling back to articles.json:', supErr.message);
    try {
      const res = await fetch('/articles.json');
      if (!res.ok) throw new Error('Failed to load articles.json');
      const articles = await res.json();
      if (!Array.isArray(articles) || articles.length === 0) throw new Error('Empty articles.json');
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
           href="/news/${item._slug}" onclick="event.preventDefault(); goArticle('${item._slug}')">→ Read full article</a>
        <button class="panel-btn btn-ghost" onclick="closePanel()">✕ Close</button>
      </div>
    </div>
  `;
}
function makeCard(item, rowIdx, votesMap) {
  const card = document.createElement('div');
  card.className = 'news-card';
  card.dataset.newsId = item.id;
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
    // Defensive: skip articles with missing critical fields
    if (!item || !item.title || !item.time) return;

    const card = document.createElement('a');
    card.className = 'bbn-archive-row';
    card.href = `/news/${item._slug}`;
    
    // Set attributes for filtering
    card.dataset.time = item.time;
    card.dataset.title = (item.title || '').toLowerCase();
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
  
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const period = periodSelect ? periodSelect.value : 'all';
  const tagValue = activeBtn ? (activeBtn.getAttribute('data-tag-val') || 'all') : 'all';
  
  const rows = Array.from(grid.querySelectorAll('.bbn-archive-row'));
  const now = Date.now();
  
  const filteredRows = rows.filter(row => {
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
    
    return matchesTag && matchesSearch && matchesPeriod;
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
  if (dateDisplay) {
    dateDisplay.textContent = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  fetchBtcPrice();
  setInterval(fetchBtcPrice, 15000);

  const isPreRendered = document.getElementById('article-container')
    && document.getElementById('article-container').children.length > 0
    && window.location.pathname.startsWith('/news/');

  if (!isPreRendered) {
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
      const archiveGrid = document.getElementById('archive-grid');
      if (archiveGrid) {
        populateArchive(noticias);
        buildFilters(noticias);
      }
    } else if (!isPreRendered) {
      showError(new Error('No articles available'));
    }

    if (!isPreRendered || !window.location.pathname.startsWith('/news/')) {
      routeFromURL();
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
