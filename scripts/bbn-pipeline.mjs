// ============================================================
// BBN Automated Breaking News Pipeline (GitHub Actions / Node 22)
// Replaces n8n workflow with zero external dependencies:
// 20 RSS Feeds -> Recency Filter -> Supabase Dedupe ->
// 6-Key Groq Rotation (Analyzer + EN/PT Editorial) -> Jina AI -> Supabase
// ============================================================

import { toSlug } from '../shared.mjs';
import {
  findBestBackgroundImage,
  createImageRenderer,
  uploadImageToSupabase,
} from './generate-image.mjs';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const MAX_ANALYZE = parseInt(process.env.BBN_MAX_ANALYZE || '10', 10);
const MAX_PUBLISH = parseInt(process.env.BBN_MAX_PUBLISH || '4', 10);
const MIN_ALERT_SCORE = parseInt(process.env.BBN_MIN_SCORE || '8', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JINA_API_KEY = process.env.JINA_API_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';

// Parse multiple Groq keys from GROQ_API_KEYS (comma/newline/space separated) or GROQ_API_KEY_1..N
// Keeps only tokens starting with "gsk_" so stray labels/notes are ignored.
function loadGroqKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEYS) {
    keys.push(
      ...process.env.GROQ_API_KEYS.split(/[\s,;]+/)
        .map((k) => k.trim())
        .filter((k) => /^gsk_/i.test(k))
    );
  }
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && /^gsk_/i.test(k.trim())) keys.push(k.trim());
  }
  if (process.env.GROQ_API_KEY && /^gsk_/i.test(process.env.GROQ_API_KEY.trim())) {
    keys.push(process.env.GROQ_API_KEY.trim());
  }
  return [...new Set(keys)];
}

const GROQ_KEYS = loadGroqKeys();
let groqKeyCursor = 0;

// ── 20 RSS Feeds (from bbn.json) ────────────────────────────
const RSS_FEEDS = [
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { name: 'SCMP', url: 'https://www.scmp.com/rss/91/feed' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/' },
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/' },
  { name: 'OilPrice', url: 'https://oilprice.com/rss/main' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss' },
  { name: 'Kitco', url: 'https://www.kitco.com/news/category/gold/feed/' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'Financial Times', url: 'https://www.ft.com/global-economy?format=rss' },
  { name: 'ZeroHedge', url: 'https://feeds.feedburner.com/zerohedge/feed' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/' },
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { name: 'Reuters', url: 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=en' },
  { name: 'AP News', url: 'https://news.google.com/rss/search?q=when:24h+allinurl:apnews.com&hl=en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

const TIER1_DOMAINS = [
  'reuters.com', 'bbc.co.uk', 'bbc.com',
  'apnews.com', 'aljazeera.com', 'theguardian.com',
  'ft.com', 'zerohedge.com', 'al-monitor.com', 'cnbc.com',
];

const PRIMARY_KEYWORDS = [
  'world', 'geopolitics', 'global', 'conflict', 'war', 'guerra', 'conflito', 'mundo',
  'bitcoin', 'btc', 'crypto', 'criptomoeda', 'criptomoedas', 'blockchain',
  'brasil', 'brazil', 'brasília', 'lula', 'stf', 'banco central', 'haddad',
  'china', 'india', 'asia', 'us', 'eua', 'russia', 'putin', 'biden', 'trump',
];

const SECONDARY_KEYWORDS = [
  'military', 'strike', 'missile', 'treaty', 'sanction', 'election', 'ataque', 'sanção',
  'eleição', 'etf', 'halving', 'regulation', 'mining', 'sec', 'binance', 'fed', 'selic',
  'inflation', 'inflação', 'pib', 'gdp', 'trade', 'embargo', 'tensão', 'diplomacia',
  'acordo', 'juros', 'taxa', 'mercado',
];

const VIP_KEYWORDS = ['bitcoin', 'btc', 'crypto', 'criptomoeda', 'criptomoedas'];
const HIGH_IMPACT_KEYWORDS = ['war', 'guerra', 'ataque', 'strike', 'sanction', 'sanção', 'crash', 'collapse', 'colapso'];

// ── Helpers ─────────────────────────────────────────────────
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHTML(html) {
  if (!html) return '';
  return decodeEntities(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAtomLink(xml) {
  const m = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return m ? decodeEntities(m[1]).trim() : '';
}

function parseRssOrAtom(xml, feedName) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  for (const block of itemMatches) {
    const title = stripHTML(extractTag(block, 'title'));
    const link = decodeEntities(extractTag(block, 'link')) || extractAtomLink(block);
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;

    const rawContent =
      extractTag(block, 'content:encoded') ||
      extractTag(block, 'content') ||
      extractTag(block, 'description') ||
      extractTag(block, 'summary') ||
      '';
    const contentSnippet = stripHTML(rawContent).slice(0, 1800);
    const pubDateRaw =
      extractTag(block, 'pubDate') ||
      extractTag(block, 'published') ||
      extractTag(block, 'updated') ||
      extractTag(block, 'dc:date') ||
      '';
    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const pubDate = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    const source = stripHTML(extractTag(block, 'dc:creator') || extractTag(block, 'author') || feedName) || feedName;

    let domain = '';
    try {
      domain = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      domain = '';
    }

    items.push({
      title,
      link: link.split('#')[0].trim(),
      cleanLink: link.split('?')[0].split('#')[0].trim(),
      contentSnippet,
      pubDate,
      source,
      domain,
      isTier1: TIER1_DOMAINS.some((d) => domain.endsWith(d)),
    });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'BBN-NewsBot/1.0 (+https://bbnews.cc)' },
    });
    if (!res.ok) {
      console.warn(`[RSS] ${feed.name}: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const items = parseRssOrAtom(xml, feed.name);
    return items;
  } catch (err) {
    console.warn(`[RSS] ${feed.name}: failed (${err.message})`);
    return [];
  }
}

function calcPreScore(item, searchContext) {
  let score = 0;
  if (item.pubDate) {
    const ageInHours = (Date.now() - new Date(item.pubDate).getTime()) / (1000 * 60 * 60);
    if (ageInHours <= 1) score += 6;
    else if (ageInHours <= 3) score += 4;
    else if (ageInHours <= 6) score += 2;
    else if (ageInHours <= 12) score += 1;
  }
  if (HIGH_IMPACT_KEYWORDS.some((kw) => searchContext.includes(kw))) score += 2;
  if (VIP_KEYWORDS.some((kw) => searchContext.includes(kw))) score += 2;
  if (item.isTier1) score += 1;
  return score;
}

function filterAndRank(items) {
  const seenLinks = new Set();
  const candidates = [];

  for (const item of items) {
    if (seenLinks.has(item.cleanLink)) continue;
    seenLinks.add(item.cleanLink);

    const searchContext = `${item.title} ${item.contentSnippet}`.toLowerCase();
    const isVip = VIP_KEYWORDS.some((kw) => searchContext.includes(kw));
    const hasPrimary = PRIMARY_KEYWORDS.some((kw) => searchContext.includes(kw));
    const hasSec = SECONDARY_KEYWORDS.some((kw) => searchContext.includes(kw));

    if (!isVip && !(hasPrimary && hasSec)) continue;

    const preScore = calcPreScore(item, searchContext);
    if (preScore < 4) continue;

    candidates.push({ ...item, preScore, isVip });
  }

  return candidates.sort((a, b) => b.preScore - a.preScore);
}

// ── 6-Key Rotating Groq Client ──────────────────────────────
async function callGroqJSON(prompt, systemPrompt = 'You return strictly valid raw JSON objects only.') {
  if (GROQ_KEYS.length === 0) {
    throw new Error('No Groq API keys configured in GROQ_API_KEYS');
  }

  const totalAttempts = GROQ_KEYS.length * 2;
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const keyIdx = groqKeyCursor % GROQ_KEYS.length;
    groqKeyCursor = (groqKeyCursor + 1) % GROQ_KEYS.length;
    const apiKey = GROQ_KEYS[keyIdx];

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text();
        console.warn(`[Groq] Key #${keyIdx + 1} returned HTTP ${res.status}; rotating to next key...`);
        lastError = new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`);
        if (attempt >= GROQ_KEYS.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      let raw = data?.choices?.[0]?.message?.content || '';
      raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw);
    } catch (err) {
      lastError = err;
      console.warn(`[Groq] Attempt ${attempt + 1} (Key #${keyIdx + 1}) error: ${err.message}`);
    }
  }

  throw lastError || new Error('All Groq API keys failed');
}

// ── Jina AI Reader (with safe URL validation) ───────────────
async function fetchFullArticleText(url, fallbackSnippet) {
  if (!JINA_API_KEY || !/^https?:\/\//i.test(url)) return fallbackSnippet;
  try {
    const parsed = new URL(url);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) return fallbackSnippet;

    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'Authorization': `Bearer ${JINA_API_KEY}`,
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
        'X-No-Cache': 'true',
        'X-Remove-Selector': 'header, footer, nav, .comments',
      },
    });
    if (!res.ok) return fallbackSnippet;
    const json = await res.json();
    let text = json?.data?.content || '';
    text = text
      .replace(/\[[A-Za-z0-9\s]+?\$[\d,.]+\s+[\d,.]+?%\]/gi, '')
      .replace(/\[.*?\]\((https?:\/\/[^\s]+)\)/gi, '')
      .replace(/Share this article/gi, '')
      .replace(/Copy link/gi, '')
      .trim();
    return text.length > 200 ? text.slice(0, 8000) : fallbackSnippet;
  } catch (err) {
    console.warn(`[Jina] Failed for ${url}: ${err.message}`);
    return fallbackSnippet;
  }
}

// ── Supabase Helpers (Dynamic Schema Detection) ─────────────
async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${options.method || 'GET'} ${path} -> HTTP ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getRecentSupabaseRecords(table) {
  try {
    const rows = await supabaseRequest(`${table}?order=created_at.desc&limit=500&select=*`);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(`[Supabase] Could not read ${table}: ${err.message}`);
    return [];
  }
}

function buildSchemaMatchedPayload(allowedCols, data) {
  if (!allowedCols || allowedCols.size === 0) return data;
  const payload = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowedCols.has(k) && v !== undefined) {
      payload[k] = v;
    }
  }
  return payload;
}

// ── Prompts ─────────────────────────────────────────────────
function buildAnalyzerPrompt(item) {
  const urgencyContext =
    item.preScore >= 9
      ? 'EXTREME URGENCY — Black Swan event. This could reshape global markets immediately.'
      : item.preScore === 8
        ? 'HIGH URGENCY — Major market mover. Significant geopolitical or crypto impact expected.'
        : 'RELEVANT — Notable development worth monitoring, but not an immediate market shock.';

  const contentWarning =
    item.contentSnippet.length < 200
      ? `WARNING: The content snippet is very short (${item.contentSnippet.length} chars). Write only what is explicitly stated. If insufficient, set score <= 3.`
      : 'Content is sufficient.';

  return `You are a Senior Breaking News Editor specializing in Global Geopolitics and Bitcoin Markets.

ARTICLE DATA:
- Title: ${item.title}
- Source: ${item.source} (${item.domain})
- Published: ${item.pubDate}
- Pre-Score: ${item.preScore}/10
- Urgency context: ${urgencyContext}
- Content warning: ${contentWarning}
- Content: ${item.contentSnippet}
- Original URL: ${item.link}

Return ONLY a valid JSON object with these exact keys:
{
  "headline": "High-impact headline in English, max 15 words",
  "hook": "One sharp opening sentence in English, max 25 words",
  "score": 8,
  "should_alert": true,
  "tags": "#Bitcoin #Geopolitics"
}

SCORING GUIDE (be strict, do not inflate):
- 9-10: True Black Swan — active major war escalation, central bank collapse, exchange hack > $1B
- 7-8: Market mover — ETF approval/rejection, Fed rate decision, major sanctions, country-wide crypto regulation
- 5-6: Geopolitically relevant — elections, regional conflicts, regulatory proposals
- 1-4: Domestic politics, opinion pieces, minor updates, or insufficient snippet

RULES:
- score MUST be a whole integer 1-10
- should_alert MUST be boolean true only if score >= ${MIN_ALERT_SCORE}`;
}

function buildEditorialPrompt(item, fullText, lang) {
  const isPt = lang === 'pt';
  const langName = isPt ? 'PORTUGUESE (PT-BR, natural Brazilian financial journalism)' : 'ENGLISH-US (natural financial wire journalism)';

  return `You are the Senior Editor-in-Chief of BBN (Bitcoin Brasil News).
Write a completely original, authoritative financial-wire article strictly grounded in the RAW NEWS DATA below.
Do NOT invent facts. Use **bold** markdown to highlight key numbers, institutions, or crypto terms.
LANGUAGE: ALL fields MUST be written strictly in ${langName}.

Return ONLY a flat JSON object with these exact keys:
{
  "headline": "High-impact clickable title",
  "hook": "One sharp lead sentence",
  "summary": "2-sentence executive summary",
  "article_lead": "1 to 2 introductory paragraphs detailing the core facts (do not repeat the headline)",
  "data_figures": "Key numbers, percentages, prices, or dates from the source (or 'Not applicable.' if none)",
  "scenario": "Geopolitical, economic, or regulatory background of the event",
  "quote_text": "Direct quote from a named official/source in the text (or 'Not applicable.' if none)",
  "insight": "Exclusive BBN analysis on how this impacts Bitcoin, crypto markets, and global investors",
  "market_reaction": "Immediate market/price reaction if mentioned (or 'Not applicable.' if none)",
  "tag": "#Hashtag1 #Hashtag2 #Hashtag3",
  "wikimedia_query": "2 to 4 English words for a real-world photo of the main person, city, building, or event (e.g. 'Kyiv Ukraine', 'Donald Trump', 'Riyadh skyline', 'Federal Reserve Washington')",
  "pexels_query": "2 to 3 English words for a clean stock photo scene if no specific place/person applies (e.g. 'oil tanker ocean', 'bitcoin trading chart', 'stock market screen')"
}

RAW NEWS DATA:
Title: ${item.title}
Source: ${item.source}
Link: ${item.link}
Content: ${fullText}`;
}

function assembleFallbackMarkdown(ed, item, lang) {
  const isPt = lang === 'pt';
  const parts = [ed.article_lead];
  if (ed.scenario) parts.push(`## ${isPt ? 'O Cenário' : 'The Scenario'}\n\n${ed.scenario}`);
  if (ed.insight) parts.push(`## ${isPt ? 'Análise BBN' : 'BBN Insight'}\n\n${ed.insight}`);
  parts.push(`${isPt ? 'Fonte' : 'Source'}: ${item.source} (${item.link})`);
  return parts.filter(Boolean).join('\n\n');
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 [BBN Pipeline] Starting (dryRun=${DRY_RUN}, groqKeys=${GROQ_KEYS.length})`);

  // 1. Fetch all 20 RSS feeds in parallel
  const feedResults = await Promise.all(RSS_FEEDS.map(fetchFeed));
  const allItems = feedResults.flat();
  console.log(`📡 [RSS] Collected ${allItems.length} raw items from ${RSS_FEEDS.length} feeds`);

  // 2. Filter & rank by recency + relevance
  const ranked = filterAndRank(allItems);
  console.log(`🎯 [Filter] ${ranked.length} relevant candidates passed Dynamic Filter`);

  if (DRY_RUN) {
    console.log('🧪 [Dry Run] Top 5 candidates:');
    ranked.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. [preScore=${c.preScore}] (${c.source}) ${c.title}`);
    });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  if (GROQ_KEYS.length === 0) {
    throw new Error('GROQ_API_KEYS is required');
  }

  // 3. Load recent records from Supabase for deduplication & schema discovery
  const [recentEn, recentPt] = await Promise.all([
    getRecentSupabaseRecords('articles'),
    getRecentSupabaseRecords('artigos'),
  ]);

  const enCols = new Set(recentEn[0] ? Object.keys(recentEn[0]).filter((c) => c !== 'id' && c !== 'created_at') : []);
  const ptCols = new Set(recentPt[0] ? Object.keys(recentPt[0]).filter((c) => c !== 'id' && c !== 'created_at') : []);

  const existingLinks = new Set();
  const existingTitles = new Set();
  for (const row of recentEn) {
    const u = (row.source_url || row.link || '').split('?')[0].split('#')[0].trim().toLowerCase();
    if (u) existingLinks.add(u);
    const t = toSlug(row.headline || row.title || '');
    if (t) existingTitles.add(t);
  }

  const freshCandidates = ranked
    .filter((item) => {
      const linkLower = item.cleanLink.toLowerCase();
      const titleSlug = toSlug(item.title);
      return !existingLinks.has(linkLower) && !existingTitles.has(titleSlug);
    })
    .slice(0, MAX_ANALYZE);

  console.log(`🆕 [Dedupe] ${freshCandidates.length} new candidates to analyze with Groq`);
  if (freshCandidates.length === 0) {
    console.log('✅ Nothing new to publish. Exiting.');
    return;
  }

  // 4. Analyze urgency with Groq (rotating keys) & generate post images
  let publishedCount = 0;
  let imageRenderer = await createImageRenderer();
  if (imageRenderer) {
    console.log('🎨 [Image] Headless Chrome renderer ready (Wikimedia Commons -> Pexels -> 1200x1200 BBN template)');
  }

  try {
    for (const item of freshCandidates) {
      if (publishedCount >= MAX_PUBLISH) break;

      let analysis;
      try {
        analysis = await callGroqJSON(buildAnalyzerPrompt(item));
      } catch (err) {
        console.error(`❌ [Analyzer] Failed for "${item.title}": ${err.message}`);
        continue;
      }

      const score = parseInt(analysis?.score, 10) || 0;
      const shouldAlert = Boolean(analysis?.should_alert) && score >= MIN_ALERT_SCORE;
      console.log(`📊 [Analyzer] score=${score}/10 alert=${shouldAlert} | ${item.title.slice(0, 70)}`);

      if (!shouldAlert) continue;

      // 5. Fetch full text via Jina AI
      const fullText = await fetchFullArticleText(item.link, item.contentSnippet);

      // 6. Generate EN and PT editorial versions using rotating Groq keys
      try {
        const enEd = await callGroqJSON(buildEditorialPrompt(item, fullText, 'en'));
        const ptEd = await callGroqJSON(buildEditorialPrompt(item, fullText, 'pt'));

        const cleanEnHeadline = String(enEd.headline || analysis.headline || item.title).replace(/\*\*/g, '').trim();
        const cleanPtHeadline = String(ptEd.headline || cleanEnHeadline).replace(/\*\*/g, '').trim();

        // 7. Generate 1200x1200 PNG post card & upload to Supabase Storage (bucket: img_post)
        let imgPostUrl = '';
        if (imageRenderer) {
          try {
            const bgUrl = await findBestBackgroundImage({
              headline: cleanEnHeadline,
              wikimediaQuery: enEd.wikimedia_query,
              pexelsQuery: enEd.pexels_query,
              pexelsApiKey: PEXELS_API_KEY,
            });
            const { buffer, filename } = await imageRenderer.render({
              title: enEd.hook || cleanEnHeadline,
              subline: 'bbnews.cc',
              imgUrl: bgUrl,
            });
            imgPostUrl = await uploadImageToSupabase({
              buffer,
              filename,
              supabaseUrl: SUPABASE_URL,
              serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
            });
            console.log(`🖼️ [Image] Uploaded to Supabase Storage: ${filename}`);
          } catch (imgErr) {
            console.warn(`⚠️ [Image] Failed for "${cleanEnHeadline}": ${imgErr.message}`);
          }
        }

        const enRaw = {
          headline: cleanEnHeadline,
          title: cleanEnHeadline,
          hook: enEd.hook || analysis.hook || '',
          summary: enEd.summary || '',
          article_lead: enEd.article_lead || '',
          data_figures: enEd.data_figures || 'Not applicable.',
          scenario: enEd.scenario || '',
          quote_text: enEd.quote_text || 'Not applicable.',
          insight: enEd.insight || '',
          market_reaction: enEd.market_reaction || 'Not applicable.',
          conteudo_blog: assembleFallbackMarkdown(enEd, item, 'en'),
          content: assembleFallbackMarkdown(enEd, item, 'en'),
          tag: enEd.tag || analysis.tags || '#Bitcoin #Geopolitics',
          source_url: item.link,
          link: item.link,
          source_name: item.source,
          img_post: imgPostUrl || undefined,
          USE_LINK: 'yes',
          slug: toSlug(cleanEnHeadline),
        };

        const ptRaw = {
          headline: cleanPtHeadline,
          title: cleanPtHeadline,
          hook: ptEd.hook || '',
          summary: ptEd.summary || '',
          article_lead: ptEd.article_lead || '',
          data_figures: ptEd.data_figures || 'Não se aplica.',
          scenario: ptEd.scenario || '',
          quote_text: ptEd.quote_text || 'Não se aplica.',
          insight: ptEd.insight || '',
          market_reaction: ptEd.market_reaction || 'Não se aplica.',
          conteudo_blog: assembleFallbackMarkdown(ptEd, item, 'pt'),
          content: assembleFallbackMarkdown(ptEd, item, 'pt'),
          tag: ptEd.tag || enRaw.tag,
          source_url: item.link,
          link: item.link,
          source_name: item.source,
          img_post: imgPostUrl || undefined,
          USE_LINK: 'yes',
          slug: toSlug(cleanPtHeadline),
        };

        const enPayload = buildSchemaMatchedPayload(enCols, enRaw);
        const ptPayload = buildSchemaMatchedPayload(ptCols, ptRaw);

        await supabaseRequest('articles', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(enPayload),
        });
        console.log(`✅ [Supabase] Inserted EN article: ${enRaw.headline}`);

        if (ptCols.size > 0) {
          await supabaseRequest('artigos', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(ptPayload),
          });
          console.log(`✅ [Supabase] Inserted PT article: ${ptRaw.headline}`);
        }

        publishedCount++;
      } catch (err) {
        console.error(`❌ [Publish] Failed for "${item.title}": ${err.message}`);
      }
    }
  } finally {
    if (imageRenderer) {
      await imageRenderer.close();
    }
  }

  console.log(`🏁 [BBN Pipeline] Done. Published ${publishedCount} breaking news article(s).`);
}

main().catch((err) => {
  console.error('💥 [BBN Pipeline] Fatal error:', err);
  process.exit(1);
});
