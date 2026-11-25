// ============================================================
// BBN Automated Breaking News Pipeline (GitHub Actions / Node 22)
// Replaces n8n workflow with zero external dependencies:
// 20 RSS Feeds -> Recency Filter -> Supabase Dedupe ->
// 6-Key Groq Rotation (Analyzer + EN/PT Editorial) -> Jina AI -> Supabase
// ============================================================

import fs from 'fs';
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
const MAX_AI_SIMILARITY = parseInt(process.env.BBN_MAX_SIMILARITY || '60', 10);
const MAX_LOCAL_SIMILARITY = parseInt(process.env.BBN_MAX_LOCAL_SIMILARITY || '50', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OPENROUTER_MODELS = (
  process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL.trim(), 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']
    : ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']
).filter((m, idx, arr) => m && arr.indexOf(m) === idx);

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

const DEDUPE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'after', 'amid',
  'says', 'said', 'will', 'new', 'more', 'than', 'about', 'under', 'between', 'against',
  'news', 'report', 'reports', 'global', 'world', 'market', 'markets', 'crypto', 'raises',
  'para', 'com', 'por', 'que', 'dos', 'das', 'nos', 'nas', 'uma', 'como', 'sobre', 'apos',
  'entre', 'contra', 'novo', 'nova', 'global', 'mundo', 'mercado', 'mercados', 'cripto',
]);

function extractSignificantTokens(text) {
  return new Set(
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !DEDUPE_STOP_WORDS.has(w))
  );
}

// Layer 1 local similarity metric (0..100) using weighted token overlap + Jaccard
function calcLocalSimilarity(textA, textB) {
  const setA = extractSignificantTokens(textA);
  const setB = extractSignificantTokens(textB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared++;
  }
  if (shared < 2) return 0;

  const overlap = shared / Math.min(setA.size, setB.size);
  const jaccard = shared / (setA.size + setB.size - shared);
  return Math.round((overlap * 0.65 + jaccard * 0.35) * 100);
}

function findMostSimilarLocal(candidateTitle, recentHeadlines) {
  let bestScore = 0;
  let bestMatch = '';
  for (const existing of recentHeadlines) {
    const score = calcLocalSimilarity(candidateTitle, existing);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = existing;
    }
  }
  return { score: bestScore, match: bestMatch };
}

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
      return { ok: false, name: feed.name, items: [] };
    }
    const xml = await res.text();
    const items = parseRssOrAtom(xml, feed.name);
    return { ok: true, name: feed.name, items };
  } catch (err) {
    console.warn(`[RSS] ${feed.name}: failed (${err.message})`);
    return { ok: false, name: feed.name, items: [] };
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

// ── OpenRouter Free Long-Form Writer (with automatic Groq fallback) ──
function extractJsonObject(raw) {
  let cleaned = String(raw || '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

async function callOpenRouterOrGroqJSON(prompt) {
  const systemPrompt = 'You are a senior financial and geopolitical journalist. Return strictly one valid raw JSON object with no markdown fences or extra text.';

  if (OPENROUTER_API_KEY) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://bbnews.cc',
            'X-Title': 'BBN - Bitcoin Brasil News',
          },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (res.status === 429 || res.status >= 500) {
          const body = await res.text();
          console.warn(`[OpenRouter] ${model} returned HTTP ${res.status} (${body.slice(0, 140)}); trying next model...`);
          continue;
        }
        if (!res.ok) {
          const body = await res.text();
          console.warn(`[OpenRouter] ${model} HTTP ${res.status}: ${body.slice(0, 180)}`);
          continue;
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        const parsed = extractJsonObject(content);
        console.log(`✍️ [OpenRouter] Article generated with ${model}`);
        return { parsed, provider: `OpenRouter (${model})` };
      } catch (err) {
        console.warn(`[OpenRouter] ${model} failed: ${err.message}`);
      }
    }
    console.warn('↩️ [Writer] OpenRouter unavailable/rate-limited; falling back to Groq...');
  }

  const parsed = await callGroqJSON(prompt, systemPrompt);
  return { parsed, provider: `Groq (${GROQ_MODEL})` };
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
function buildAnalyzerPrompt(item, recentHeadlines = []) {
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

  const recentList = recentHeadlines.length > 0
    ? recentHeadlines.slice(0, 30).map((h, i) => `${i + 1}. ${h}`).join('\n')
    : '(none)';

  return `You are a Senior Breaking News Editor specializing in Global Geopolitics and Bitcoin Markets.

ALREADY PUBLISHED HEADLINES (last 48h — DO NOT duplicate any of these events):
${recentList}

NEW CANDIDATE ARTICLE:
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
  "similarity_score": 0,
  "similar_to": "",
  "is_duplicate": false,
  "should_alert": true,
  "tags": "#Bitcoin #Geopolitics"
}

DUPLICATE & SIMILARITY GUIDE (0 to 100):
- 80-100: Same exact event/verdict/attack/announcement covered by another outlet or angle (set is_duplicate=true, should_alert=false)
- 60-79: Essentially the same news story with minor extra detail (set is_duplicate=true, should_alert=false)
- 25-59: Same broad theme (e.g. both about Bitcoin or US politics) but clearly a DIFFERENT event (is_duplicate=false)
- 0-24: Completely unrelated to all already published headlines (is_duplicate=false)
- Put the closest existing headline in "similar_to" when similarity_score >= 40, otherwise "".

SCORING GUIDE (be strict, do not inflate):
- 9-10: True Black Swan — active major war escalation, central bank collapse, exchange hack > $1B
- 7-8: Market mover — ETF approval/rejection, Fed rate decision, major sanctions, country-wide crypto regulation
- 5-6: Geopolitically relevant — elections, regional conflicts, regulatory proposals
- 1-4: Domestic politics, opinion pieces, minor updates, or insufficient snippet

RULES:
- score MUST be a whole integer 1-10
- similarity_score MUST be a whole integer 0-100
- should_alert MUST be boolean true ONLY if score >= ${MIN_ALERT_SCORE} AND is_duplicate is false AND similarity_score < ${MAX_AI_SIMILARITY}`;
}

function buildEditorialPrompt(item, fullText, lang) {
  const isPt = lang === 'pt';
  const langName = isPt ? 'PORTUGUESE (PT-BR, natural Brazilian financial journalism)' : 'ENGLISH-US (natural financial wire journalism)';

  return `You are the Senior Editor-in-Chief of BBN (Bitcoin Brasil News).
Write a comprehensive, in-depth, completely original financial-wire article strictly grounded in the RAW NEWS DATA below.
Do NOT invent facts, statistics, or quotes. Do NOT include any raw URLs or "Source:" lines in the text.
Use **bold** markdown inside paragraphs (never inside headline) to highlight key numbers, institutions, or crypto/macro terms.
LANGUAGE: ALL fields MUST be written strictly in ${langName}.

Return ONLY a flat JSON object with these exact keys:
{
  "headline": "High-impact clickable title without markdown asterisks",
  "hook": "One sharp, authoritative lead sentence summarizing the core shock",
  "summary": "2 to 3 sentence executive summary",
  "article_lead": "2 to 3 rich, detailed introductory paragraphs covering what happened, who is involved, and why it matters immediately (separate paragraphs with \\n\\n; do not repeat the headline)",
  "data_figures": "Detailed breakdown of concrete numbers, dollar amounts, percentages, dates, and metrics explicitly stated in the source (or '${isPt ? 'Não se aplica.' : 'Not applicable.'}' if none)",
  "scenario": "2 to 3 thorough paragraphs explaining the geopolitical, macroeconomic, or regulatory background and historical context leading up to this event (separate paragraphs with \\n\\n)",
  "quote_text": "Direct quote from a named official, analyst, or institution present in the source (or '${isPt ? 'Não se aplica.' : 'Not applicable.'}' if none)",
  "insight": "2 to 3 deep analytical paragraphs explaining how this development impacts Bitcoin, crypto liquidity, institutional flows, and global markets (separate paragraphs with \\n\\n)",
  "market_reaction": "Detailed description of immediate price, bond, oil, FX, or crypto market reaction mentioned in the source (or '${isPt ? 'Não se aplica.' : 'Not applicable.'}' if none)",
  "tag": "#Hashtag1 #Hashtag2 #Hashtag3 #Hashtag4",
  "wikimedia_query": "2 to 4 English words for a real-world photo of the main person, city, building, or event (e.g. 'Kyiv Ukraine', 'Donald Trump', 'Riyadh skyline', 'Federal Reserve Washington')",
  "pexels_query": "2 to 3 English words for a clean stock photo scene if no specific place/person applies (e.g. 'oil tanker ocean', 'bitcoin trading chart', 'stock market screen')"
}

RAW NEWS DATA:
Title: ${item.title}
Content: ${fullText}`;
}

function assembleFallbackMarkdown(ed, _item, lang) {
  const isPt = lang === 'pt';
  const parts = [ed.article_lead];
  if (ed.scenario) parts.push(`## ${isPt ? 'O Cenário' : 'The Scenario'}\n\n${ed.scenario}`);
  if (ed.insight) parts.push(`## ${isPt ? 'Análise BBN' : 'BBN Insight'}\n\n${ed.insight}`);
  return parts.filter(Boolean).join('\n\n');
}

function writeGitHubStepSummary(stats) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const statusBanner = stats.fatalFailure
    ? '### ❌ System Error — Action Required'
    : stats.published.length > 0
      ? `### ✅ Healthy — Published ${stats.published.length} breaking news article(s)`
      : `### ✅ Healthy — No new breaking news (score >= ${MIN_ALERT_SCORE}) this cycle`;

  const lines = [
    '## BBN Breaking News Pipeline Summary',
    '',
    statusBanner,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| RSS Feeds OK | ${stats.feedsOk} / ${RSS_FEEDS.length} |`,
    `| Raw RSS Items | ${stats.rawItems} |`,
    `| Relevant Candidates | ${stats.rankedCandidates} |`,
    `| Blocked by Local Dedupe (L1) | ${stats.blockedL1} |`,
    `| Analyzed by Groq | ${stats.analyzerSuccess} ok / ${stats.analyzerErrors.length} failed |`,
    `| Blocked by AI Dedupe (L2, sim >= ${MAX_AI_SIMILARITY}) | ${stats.blockedL2} |`,
    `| Skipped (score < ${MIN_ALERT_SCORE}) | ${stats.skippedLowScore} |`,
    `| Published Articles | **${stats.published.length}** |`,
    `| Publish Errors | ${stats.publishErrors.length} |`,
    '',
  ];

  if (stats.published.length > 0) {
    lines.push('### Published Articles', '');
    for (const p of stats.published) {
      lines.push(`- **${p.enHeadline}** (PT: *${p.ptHeadline}*) — Writer: \`${p.provider}\` · Image: ${p.hasImage ? '🖼️ Yes' : '—'}`);
    }
    lines.push('');
  }

  const allErrors = [...stats.analyzerErrors, ...stats.publishErrors];
  if (allErrors.length > 0) {
    lines.push('### Errors Detected', '');
    for (const err of allErrors.slice(0, 10)) {
      lines.push(`- \`${String(err).replace(/`/g, "'")}\``);
    }
    lines.push('');
  }

  try {
    fs.appendFileSync(summaryPath, lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    console.warn(`[Summary] Could not write GITHUB_STEP_SUMMARY: ${err.message}`);
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 [BBN Pipeline] Starting (dryRun=${DRY_RUN}, groqKeys=${GROQ_KEYS.length})`);

  const stats = {
    feedsOk: 0,
    rawItems: 0,
    rankedCandidates: 0,
    blockedL1: 0,
    analyzerSuccess: 0,
    analyzerErrors: [],
    blockedL2: 0,
    skippedLowScore: 0,
    publishAttempted: 0,
    published: [],
    publishErrors: [],
    fatalFailure: false,
  };

  // 1. Fetch all 20 RSS feeds in parallel
  const feedResults = await Promise.all(RSS_FEEDS.map(fetchFeed));
  stats.feedsOk = feedResults.filter((f) => f.ok).length;
  const allItems = feedResults.flatMap((f) => f.items);
  stats.rawItems = allItems.length;
  console.log(`📡 [RSS] Collected ${allItems.length} raw items from ${stats.feedsOk}/${RSS_FEEDS.length} feeds`);

  if (stats.feedsOk === 0) {
    stats.fatalFailure = true;
    stats.analyzerErrors.push('All 20 RSS feeds failed to respond.');
    writeGitHubStepSummary(stats);
    throw new Error('All 20 RSS feeds failed to respond.');
  }

  // 2. Filter & rank by recency + relevance
  const ranked = filterAndRank(allItems);
  stats.rankedCandidates = ranked.length;
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
  const recentHeadlines48h = [];
  const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;

  for (const row of recentEn) {
    const u = (row.source_url || row.link || '').split('?')[0].split('#')[0].trim().toLowerCase();
    if (u) existingLinks.add(u);
    const hl = String(row.headline || row.title || '').replace(/\*\*/g, '').trim();
    const t = toSlug(hl);
    if (t) existingTitles.add(t);
    const createdMs = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (hl && (!createdMs || createdMs >= cutoff48h)) {
      recentHeadlines48h.push(hl);
    }
  }

  const freshCandidates = ranked
    .filter((item) => {
      const linkLower = item.cleanLink.toLowerCase();
      const titleSlug = toSlug(item.title);
      if (existingLinks.has(linkLower) || existingTitles.has(titleSlug)) return false;

      // Layer 1: Local similarity pre-filter against last 48h headlines
      const localSim = findMostSimilarLocal(item.title, recentHeadlines48h);
      if (localSim.score >= MAX_LOCAL_SIMILARITY) {
        stats.blockedL1++;
        console.log(`🔁 [Dedupe-L1] localSim=${localSim.score}/100 | Skipping "${item.title.slice(0, 60)}" (similar to "${localSim.match.slice(0, 55)}")`);
        return false;
      }
      return true;
    })
    .slice(0, MAX_ANALYZE);

  console.log(`🆕 [Dedupe] ${freshCandidates.length} new candidates to analyze with Groq (48h reference headlines: ${recentHeadlines48h.length})`);
  if (freshCandidates.length === 0) {
    console.log('✅ Nothing new to publish. Exiting.');
    writeGitHubStepSummary(stats);
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

      // Re-check Layer 1 against articles already published earlier in THIS SAME run
      const intraRunSim = findMostSimilarLocal(item.title, recentHeadlines48h);
      if (intraRunSim.score >= MAX_LOCAL_SIMILARITY) {
        stats.blockedL1++;
        console.log(`🔁 [Dedupe-L1] localSim=${intraRunSim.score}/100 (same-run) | Skipping "${item.title.slice(0, 60)}"`);
        continue;
      }

      let analysis;
      try {
        analysis = await callGroqJSON(buildAnalyzerPrompt(item, recentHeadlines48h));
        stats.analyzerSuccess++;
      } catch (err) {
        stats.analyzerErrors.push(`Analyzer (${item.title.slice(0, 40)}): ${err.message}`);
        console.error(`❌ [Analyzer] Failed for "${item.title}": ${err.message}`);
        continue;
      }

      const score = parseInt(analysis?.score, 10) || 0;
      const aiSim = Math.max(0, Math.min(100, parseInt(analysis?.similarity_score, 10) || 0));
      const isDuplicate = Boolean(analysis?.is_duplicate) || aiSim >= MAX_AI_SIMILARITY;
      const shouldAlert = Boolean(analysis?.should_alert) && score >= MIN_ALERT_SCORE && !isDuplicate;
      const simNote = analysis?.similar_to ? ` similarTo="${String(analysis.similar_to).slice(0, 45)}"` : '';
      console.log(`📊 [Analyzer] score=${score}/10 aiSim=${aiSim}/100 dup=${isDuplicate} alert=${shouldAlert}${simNote} | ${item.title.slice(0, 65)}`);

      if (isDuplicate) {
        stats.blockedL2++;
        continue;
      }
      if (!shouldAlert) {
        stats.skippedLowScore++;
        continue;
      }

      stats.publishAttempted++;

      // 5. Fetch full text via Jina AI
      const fullText = await fetchFullArticleText(item.link, item.contentSnippet);

      // 6. Generate long-form EN and PT editorial versions (OpenRouter :free -> Groq fallback)
      try {
        const enResult = await callOpenRouterOrGroqJSON(buildEditorialPrompt(item, fullText, 'en'));
        const ptResult = await callOpenRouterOrGroqJSON(buildEditorialPrompt(item, fullText, 'pt'));
        const enEd = enResult.parsed;
        const ptEd = ptResult.parsed;

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
          USE_LINK: 'no',
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
          USE_LINK: 'no',
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
        stats.published.push({
          enHeadline: enRaw.headline,
          ptHeadline: ptRaw.headline,
          provider: enResult.provider,
          hasImage: Boolean(imgPostUrl),
        });
        // Register both the generated headline and raw RSS title so later candidates in this same run are deduplicated
        recentHeadlines48h.unshift(cleanEnHeadline, item.title);
      } catch (err) {
        stats.publishErrors.push(`Publish (${item.title.slice(0, 40)}): ${err.message}`);
        console.error(`❌ [Publish] Failed for "${item.title}": ${err.message}`);
      }
    }
  } finally {
    if (imageRenderer) {
      await imageRenderer.close();
    }
  }

  // Detect real system failures so GitHub Actions marks the run red (❌) and emails the owner
  const allAnalyzersFailed = freshCandidates.length > 0 && stats.analyzerSuccess === 0 && stats.analyzerErrors.length > 0;
  const allPublishesFailed = stats.publishAttempted > 0 && publishedCount === 0 && stats.publishErrors.length > 0;
  stats.fatalFailure = allAnalyzersFailed || allPublishesFailed;

  writeGitHubStepSummary(stats);

  console.log(`🏁 [BBN Pipeline] Done. Published ${publishedCount} breaking news article(s).`);

  if (stats.fatalFailure) {
    throw new Error(
      allAnalyzersFailed
        ? `All Groq analyzer calls failed (${stats.analyzerErrors.length} errors)`
        : `All article publish attempts failed (${stats.publishErrors.length} errors)`
    );
  }
}

main().catch((err) => {
  console.error('💥 [BBN Pipeline] Fatal error:', err);
  process.exit(1);
});
