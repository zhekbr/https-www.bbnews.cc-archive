// ============================================================
// BBN Image Generator — scripts/generate-image.mjs
// Smart visual search (Wikimedia Commons anti-logo filter -> Pexels fallback)
// + 1200x1200 PNG rendering using pre-installed Chrome + puppeteer-core
// + Upload to Supabase Storage bucket `img_post`.
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { buildImageHtml } from './image-template.mjs';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
  'from', 'by', 'in', 'of', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'with', 'after', 'amid', 'over', 'into', 'new', 'says', 'raises', 'hits',
]);

// Reject logos, flags, maps, diagrams, icons, watermarks, screens, animals, vintage/irrelevant shots
const WIKIMEDIA_BLOCKED_RE =
  /(logo|flag|map|coat[\s_-]of[\s_-]arms|seal|emblem|icon|banner|diagram|chart|signature|stamp|crest|badge|symbol|locator|outline|blank|vector|watermark|screenshot|headline|newspaper|cover|poster|living[\s_-]room|bedroom|kitchen|bathroom|selfie|wedding|church|monastery|cathedral|restaurant|food|menu|flower|garden|statue|painting|museum[\s_-]interior|gravestone|cemetery|bird|crow|raven|vulture|eagle|hawk|pigeon|duck|animal|dog|cat|insect|fish|cookie|login|signup|19[0-8]\d)/i;

const VISION_GROQ_MODEL = process.env.VISION_GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const VISION_OPENROUTER_MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
];
const MIN_IMAGE_SCORE = parseInt(process.env.BBN_MIN_IMAGE_SCORE || '7', 10);
const MAX_IMAGE_CANDIDATES_TO_JUDGE = parseInt(process.env.BBN_MAX_IMAGE_JUDGE || '6', 10);

// Persistent anti-repeat background image history stored in private Supabase `system_tokens`
const sessionUsedImages = new Set();

async function loadUsedBackgroundImages({ supabaseUrl, serviceRoleKey }) {
  const used = new Set(sessionUsedImages);
  if (!supabaseUrl || !serviceRoleKey) return used;
  try {
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/system_tokens?service=eq.used_bg_images&select=access_token`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });
    if (!res.ok) return used;
    const rows = await res.json();
    const raw = rows?.[0]?.access_token;
    if (!raw) return used;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const u of arr) used.add(String(u));
    }
  } catch {
    // ignore read error
  }
  return used;
}

async function recordUsedBackgroundImage({ url, usedSet, supabaseUrl, serviceRoleKey }) {
  if (!url) return;
  sessionUsedImages.add(url);
  usedSet.add(url);
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const pruned = Array.from(usedSet).slice(-200);
    await fetch(`${cleanUrl}/rest/v1/system_tokens?on_conflict=service`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        service: 'used_bg_images',
        access_token: JSON.stringify(pruned),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn(`[Image] Could not persist used_bg_images: ${err.message}`);
  }
}

function detectChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function extractPexelsQuery(headline) {
  const words = String(headline || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ') || 'bitcoin finance';
}

export async function searchWikimediaCandidates(query, maxResults = 6, usedUrls = new Set()) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${cleanQuery} filetype:bitmap`,
      gsrlimit: '25',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: '1280',
      format: 'json',
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'BBN-NewsBot/1.0 (https://bbnews.cc; contact@bbnews.cc)',
      },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    const queryWords = cleanQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const candidates = [];
    for (const page of pages) {
      const title = String(page?.title || '');
      const titleLower = title.toLowerCase();
      const info = page?.imageinfo?.[0];
      if (!info) continue;

      const mime = String(info.mime || '').toLowerCase();
      if (mime !== 'image/jpeg' && mime !== 'image/png') continue;

      const width = Number(info.width) || 0;
      const height = Number(info.height) || 0;
      if (width < 800 || height < 500) continue;

      const ratio = width / height;
      if (ratio < 0.55 || ratio > 2.4) continue;

      const url = info.thumburl || info.url || '';
      if (!/^https?:\/\//i.test(url)) continue;
      if (usedUrls.has(url)) continue;

      if (WIKIMEDIA_BLOCKED_RE.test(title) || WIKIMEDIA_BLOCKED_RE.test(url)) continue;

      const matchedWords = queryWords.filter((w) => titleLower.includes(w));
      if (queryWords.length > 0 && !titleLower.includes(queryWords[0])) continue;

      const rank =
        matchedWords.length * 25 +
        (mime === 'image/jpeg' ? 10 : 0) +
        (width >= 1200 ? 5 : 0) -
        Math.abs(ratio - 1.33);
      candidates.push({ url, rank, source: 'Wikimedia', label: title });
    }

    candidates.sort((a, b) => b.rank - a.rank);
    return candidates.slice(0, maxResults);
  } catch (err) {
    console.warn(`[Wikimedia] Search failed for "${cleanQuery}": ${err.message}`);
    return [];
  }
}

export async function searchWikimediaImage(query) {
  const list = await searchWikimediaCandidates(query, 1);
  if (list[0]) {
    console.log(`🌐 [Wikimedia] Selected photo for "${query}": ${list[0].label}`);
    return list[0].url;
  }
  return '';
}

export async function searchPexelsCandidates(queryOrHeadline, pexelsApiKey, maxResults = 6, usedUrls = new Set()) {
  if (!pexelsApiKey) return [];
  const queries = [
    String(queryOrHeadline || '').trim(),
    extractPexelsQuery(queryOrHeadline),
    'financial district architecture dusk',
  ].filter(Boolean);

  const tried = new Set();
  const seenUrls = new Set();
  const results = [];

  for (const q of queries) {
    if (results.length >= maxResults) break;
    if (tried.has(q.toLowerCase())) continue;
    tried.add(q.toLowerCase());

    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Authorization': pexelsApiKey,
          'User-Agent': 'BBN-ImageBot/1.0 (+https://bbnews.cc)',
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      for (const p of json?.photos || []) {
        const photoUrl = p?.src?.large2x || p?.src?.large || p?.src?.original;
        const previewUrl = p?.src?.medium || photoUrl;
        if (!photoUrl || seenUrls.has(photoUrl) || usedUrls.has(photoUrl)) continue;
        seenUrls.add(photoUrl);
        results.push({
          url: photoUrl,
          previewUrl,
          source: 'Pexels',
          label: `${q} (#${p.id})`,
        });
        if (results.length >= maxResults) break;
      }
    } catch (err) {
      console.warn(`[Pexels] Search failed for "${q}": ${err.message}`);
    }
  }
  return results;
}

export async function searchPexelsImage(queryOrHeadline, pexelsApiKey) {
  const list = await searchPexelsCandidates(queryOrHeadline, pexelsApiKey, 1);
  if (list[0]) {
    console.log(`📷 [Pexels] Selected photo for "${list[0].label}"`);
    return list[0].url;
  }
  return '';
}

function parseJudgeJson(raw) {
  let cleaned = String(raw || '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) cleaned = cleaned.slice(s, e + 1);
  return JSON.parse(cleaned);
}

async function judgeImageWithVisionAI({ imageUrl, headline, summary, groqKeys = [], openRouterKeys = [] }) {
  const prompt = `You are a ruthless Senior Photo Editor at Bloomberg / Financial Times choosing a high-contrast background photo for a mobile news Reel cover.

NEWS HEADLINE: ${headline}
NEWS SUMMARY: ${String(summary || '').slice(0, 260)}

Score the image from 1 to 10:
- 9-10: Sharp, dramatic, well-lit editorial photo with ONE clear focal point (recognizable leader, government/central bank building, military/energy/port scene, financial market/city) directly matching THIS news. Zero text, zero watermarks.
- 7-8: Clean, sharp, professional photo with a clear subject matching the topic and scale. Good lighting/contrast on mobile.
- 4-6: Generic, low-contrast, too dark/muddy, mismatched scale (e.g. small concrete mixer for a megaproject), or weak focal point.
- 1-3 (AUTOMATIC REJECT): Computer/phone screens, login/cookie forms, websites, screenshots, text/logos/watermarks, random birds/animals, vintage black-and-white old photos, nearly pitch-black frames, blurry shots, or unrelated rooms/churches.

Return ONLY a valid JSON object:
{"score": 7, "has_watermark": false, "reason": "max 12 words explaining why"}`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  // 1. Try Groq Vision (fast, separate TPD quota from gpt-oss-120b)
  for (let i = 0; i < Math.min(groqKeys.length, 4); i++) {
    const apiKey = groqKeys[i];
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(18000),
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: VISION_GROQ_MODEL,
          temperature: 0.1,
          max_tokens: 150,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      if (res.status === 429 || res.status === 401 || res.status >= 500) continue;
      if (!res.ok) break;
      const data = await res.json();
      const parsed = parseJudgeJson(data?.choices?.[0]?.message?.content || '');
      const score = Math.max(1, Math.min(10, parseInt(parsed?.score, 10) || 1));
      return {
        score,
        hasWatermark: Boolean(parsed?.has_watermark),
        reason: String(parsed?.reason || '').slice(0, 120),
        judge: `Groq(${VISION_GROQ_MODEL})`,
      };
    } catch {
      // try next key / fallback
    }
  }

  // 2. Fallback to OpenRouter Vision (:free)
  if (openRouterKeys.length > 0) {
    for (const model of VISION_OPENROUTER_MODELS) {
      const apiKey = openRouterKeys[0];
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(22000),
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://bbnews.cc',
            'X-Title': 'BBN - Bitcoin Brasil News',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 150,
            messages,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = parseJudgeJson(data?.choices?.[0]?.message?.content || '');
        const score = Math.max(1, Math.min(10, parseInt(parsed?.score, 10) || 1));
        return {
          score,
          hasWatermark: Boolean(parsed?.has_watermark),
          reason: String(parsed?.reason || '').slice(0, 120),
          judge: `OpenRouter(${model})`,
        };
      } catch {
        // try next vision model
      }
    }
  }

  return null;
}

export async function findBestBackgroundImage({
  headline,
  summary = '',
  wikimediaQuery,
  pexelsQuery,
  pexelsApiKey,
  groqKeys = [],
  openRouterKeys = [],
  supabaseUrl = '',
  serviceRoleKey = '',
}) {
  // Load last 200 used background URLs so we NEVER repeat the same photo in the feed
  const usedUrls = await loadUsedBackgroundImages({ supabaseUrl, serviceRoleKey });

  // Gather fresh non-repeated candidate pool from both Wikimedia Commons and Pexels in parallel
  const [wikiList, pexelsList] = await Promise.all([
    wikimediaQuery ? searchWikimediaCandidates(wikimediaQuery, 5, usedUrls) : Promise.resolve([]),
    searchPexelsCandidates(pexelsQuery || headline, pexelsApiKey, 5, usedUrls),
  ]);

  // Interleave candidates (Wikimedia + Pexels) so the Vision Judge evaluates diverse options quickly
  const pool = [];
  const maxLen = Math.max(wikiList.length, pexelsList.length);
  for (let i = 0; i < maxLen; i++) {
    if (wikiList[i]) pool.push(wikiList[i]);
    if (pexelsList[i]) pool.push(pexelsList[i]);
  }

  if (pool.length === 0) {
    if (!pexelsApiKey && headline) {
      const fallbackUrl = await searchWikimediaImage(extractPexelsQuery(headline));
      if (fallbackUrl) await recordUsedBackgroundImage({ url: fallbackUrl, usedSet: usedUrls, supabaseUrl, serviceRoleKey });
      return fallbackUrl;
    }
    return '';
  }

  // If no Vision AI keys are available, return the first unused candidate
  if (groqKeys.length === 0 && openRouterKeys.length === 0) {
    console.log(`🖼️ [Image] Selected unused (${pool[0].source}): ${pool[0].label}`);
    await recordUsedBackgroundImage({ url: pool[0].url, usedSet: usedUrls, supabaseUrl, serviceRoleKey });
    return pool[0].url;
  }

  let bestCandidate = null;
  const toJudge = pool.slice(0, MAX_IMAGE_CANDIDATES_TO_JUDGE);

  for (const cand of toJudge) {
    const verdict = await judgeImageWithVisionAI({
      imageUrl: cand.previewUrl || cand.url,
      headline,
      summary,
      groqKeys,
      openRouterKeys,
    });

    if (!verdict) {
      if (!bestCandidate) bestCandidate = { ...cand, score: 6, reason: 'Vision AI unavailable' };
      break;
    }

    const effectiveScore = verdict.hasWatermark ? 1 : verdict.score;
    console.log(
      `🧐 [ImageJudge] ${cand.source} score=${effectiveScore}/10 wm=${verdict.hasWatermark} (${verdict.judge}): ${verdict.reason} | ${cand.label}`
    );

    if (!bestCandidate || effectiveScore > bestCandidate.score) {
      bestCandidate = { ...cand, score: effectiveScore, reason: verdict.reason };
    }

    if (effectiveScore >= MIN_IMAGE_SCORE && !verdict.hasWatermark) {
      console.log(`✅ [ImageJudge] Approved (${cand.source}, ${effectiveScore}/10): ${cand.label}`);
      await recordUsedBackgroundImage({ url: cand.url, usedSet: usedUrls, supabaseUrl, serviceRoleKey });
      return cand.url;
    }
  }

  const chosen = bestCandidate || pool[0];
  console.log(`🖼️ [ImageJudge] Picked best unused (${chosen.source}, ${chosen.score || '?'}/10): ${chosen.label}`);
  await recordUsedBackgroundImage({ url: chosen.url, usedSet: usedUrls, supabaseUrl, serviceRoleKey });
  return chosen.url;
}

export async function createImageRenderer() {
  const executablePath = detectChromeExecutable();
  if (!executablePath) {
    console.warn('[Image] Chrome/Chromium not found; skipping image generation.');
    return null;
  }

  let puppeteer;
  try {
    const mod = await import('puppeteer-core');
    puppeteer = mod.default || mod;
  } catch {
    console.warn('[Image] puppeteer-core not installed; skipping image generation.');
    return null;
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1080,1080',
    ],
  });

  return {
    async render({ title, subline = 'bbnews.cc', imgUrl, width = 1080, height = 1080 }) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        const cleanTitle = String(title || '').replace(/\*\*/g, '').trim();
        const html = buildImageHtml({ title: cleanTitle, subline, img_url: imgUrl, width, height });
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForFunction(() => window.__BBN_READY__ === true, { timeout: 10000 });
        const canvasEl = await page.$('.canvas');
        if (!canvasEl) throw new Error('Element .canvas not found');
        const buffer = await canvasEl.screenshot({ type: 'png' });
        const hash = crypto.randomBytes(8).toString('hex');
        const suffix = height > width ? 'reel' : 'post';
        const filename = `bbn-${suffix}-${Date.now()}-${hash}.png`;
        return { buffer, filename };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

export async function renderPngToReelMp4({ pngBuffer, durationSec = 7 }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbn-reel-'));
  const inPng = path.join(tmpDir, 'frame.png');
  const outMp4 = path.join(tmpDir, 'reel.mp4');

  try {
    fs.writeFileSync(inPng, pngBuffer);
    // Crisp static 1080x1920 vertical MP4 + silent AAC audio (required by IG Reels)
    const args = [
      '-y',
      '-loop', '1',
      '-framerate', '30',
      '-i', inPng,
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-t', String(durationSec),
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outMp4,
    ];

    await new Promise((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) return reject(new Error(`ffmpeg failed: ${err.message} ${String(stderr || '').slice(-200)}`));
        resolve();
      });
    });

    const buffer = fs.readFileSync(outMp4);
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `bbn-reel-${Date.now()}-${hash}.mp4`;
    return { buffer, filename };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function uploadImageToSupabase({
  buffer,
  filename,
  supabaseUrl,
  serviceRoleKey,
  bucket = 'img_post',
  contentType = 'image/png',
}) {
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const uploadUrl = `${cleanUrl}/storage/v1/object/${bucket}/${filename}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase Storage upload failed (HTTP ${res.status}): ${errText}`);
  }
  return `${cleanUrl}/storage/v1/object/public/${bucket}/${filename}`;
}
