// ============================================================
// BBN PostPulse Publisher — scripts/postpulse.mjs
// Refreshes OAuth2 token, imports Supabase img_post PNG, and
// schedules posts across Instagram, X, TikTok, Facebook & Threads.
// ============================================================

const FALLBACK_ACCOUNTS = [
  { id: 1757, type: 'INSTAGRAM' },
  { id: 1756, type: 'X_TWITTER' },
  { id: 1758, type: 'TIK_TOK' },
  { id: 1759, type: 'FACEBOOK', chatId: '1226176870572281' },
  { id: 1760, type: 'THREADS' },
];

const SUPPORTED_PLATFORMS = new Set(['INSTAGRAM', 'X_TWITTER', 'TIK_TOK', 'FACEBOOK', 'THREADS']);
const DEFAULT_FB_CHAT_ID = process.env.POSTPULSE_FACEBOOK_PAGE_ID || '1226176870572281';
const TIKTOK_FALLBACK_MINUTES = parseInt(process.env.TIKTOK_FALLBACK_MINUTES || '75', 10); // 1h15
const TIKTOK_MAX_POSTS_24H = parseInt(process.env.TIKTOK_MAX_POSTS_24H || '12', 10);
const TIKTOK_PRIORITY_SCORE = parseInt(process.env.TIKTOK_PRIORITY_SCORE || '10', 10);

async function loadTikTokPostTimestamps({ supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) return [];
  try {
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/system_tokens?service=eq.tiktok_rate_limit&select=access_token`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const raw = rows?.[0]?.access_token;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((ts) => Number.isFinite(ts) && ts >= cutoff).sort((a, b) => a - b)
      : [];
  } catch {
    return [];
  }
}

async function saveTikTokPostTimestamps({ supabaseUrl, serviceRoleKey, timestamps }) {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruned = timestamps.filter((ts) => ts >= cutoff).slice(-50);
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
        service: 'tiktok_rate_limit',
        access_token: JSON.stringify(pruned),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn(`[PostPulse:TIK_TOK] Could not persist rate-limit state: ${err.message}`);
  }
}

function evaluateTikTokEligibility({ score, timestamps }) {
  const count24h = timestamps.length;
  if (count24h >= TIKTOK_MAX_POSTS_24H) {
    return { allowed: false, reason: `24h cap reached (${count24h}/${TIKTOK_MAX_POSTS_24H})` };
  }
  if (score >= TIKTOK_PRIORITY_SCORE) {
    return { allowed: true, reason: `priority score=${score}/10 (${count24h}/${TIKTOK_MAX_POSTS_24H} in 24h)` };
  }
  const lastTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
  const minsSinceLast = lastTs ? Math.floor((Date.now() - lastTs) / 60000) : Infinity;
  if (minsSinceLast >= TIKTOK_FALLBACK_MINUTES) {
    return {
      allowed: true,
      reason: `inactivity fallback (${lastTs ? `${minsSinceLast}m` : 'first post'} >= ${TIKTOK_FALLBACK_MINUTES}m; ${count24h}/${TIKTOK_MAX_POSTS_24H} in 24h)`,
    };
  }
  const remaining = TIKTOK_FALLBACK_MINUTES - minsSinceLast;
  return {
    allowed: false,
    reason: `score=${score} < ${TIKTOK_PRIORITY_SCORE}; last post ${minsSinceLast}m ago (fallback in ${remaining}m; ${count24h}/${TIKTOK_MAX_POSTS_24H} in 24h)`,
  };
}

function normalizePlatformType(raw) {
  const up = String(raw || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (up === 'TIKTOK' || up === 'TIK_TOK') return 'TIK_TOK';
  if (up === 'X' || up === 'TWITTER' || up === 'X_TWITTER') return 'X_TWITTER';
  if (up.startsWith('FACEBOOK') || up === 'FB') return 'FACEBOOK';
  if (up.startsWith('INSTAGRAM') || up === 'IG') return 'INSTAGRAM';
  if (up.startsWith('THREADS')) return 'THREADS';
  return up;
}

export async function getConnectedAccounts(accessToken) {
  try {
    const res = await fetch('https://api.post-pulse.com/v1/accounts', {
      signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return FALLBACK_ACCOUNTS;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.accounts || data?.data || data?.items || []);
    if (!Array.isArray(list) || list.length === 0) return FALLBACK_ACCOUNTS;

    console.log(
      `🔍 [PostPulse] Raw accounts (${list.length}): ${list
        .map((a) => `${a.platform || a.type || a.socialMediaPlatform || '?'}#${a.id}(${a.username || a.name || ''})`)
        .join(', ')}`
    );

    const mapped = [];
    for (const acc of list) {
      const type = normalizePlatformType(acc.platform || acc.type || acc.socialMediaPlatform);
      if (!SUPPORTED_PLATFORMS.has(type)) continue;
      const id = Number(acc.id);
      if (!id) continue;
      const entry = { id, type };
      if (type === 'FACEBOOK') {
        entry.chatId = String(acc.pageId || acc.chatId || acc.externalId || DEFAULT_FB_CHAT_ID);
      }
      mapped.push(entry);
    }
    if (mapped.length > 0) {
      console.log(`🔗 [PostPulse] Active accounts discovered: ${mapped.map((a) => `${a.type}#${a.id}`).join(', ')}`);
      return mapped;
    }
  } catch (err) {
    console.warn(`[PostPulse] Could not list connected accounts, using defaults: ${err.message}`);
  }
  return FALLBACK_ACCOUNTS;
}

export async function getPostPulseAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  supabaseUrl,
  serviceRoleKey,
}) {
  // 1. Try loading latest rotated token from private Supabase table `system_tokens`
  let activeRefreshToken = refreshToken;
  if (supabaseUrl && serviceRoleKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const getRes = await fetch(`${cleanUrl}/rest/v1/system_tokens?service=eq.postpulse&select=*`, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
      });
      if (getRes.ok) {
        const rows = await getRes.json();
        const saved = rows?.[0];
        if (saved?.access_token && saved?.expires_at) {
          const expiresMs = new Date(saved.expires_at).getTime();
          if (expiresMs > Date.now() + 5 * 60 * 1000) {
            return saved.access_token;
          }
        }
        if (saved?.refresh_token) {
          activeRefreshToken = saved.refresh_token;
        }
      }
    } catch (err) {
      console.warn(`[PostPulse] Could not read system_tokens: ${err.message}`);
    }
  }

  // 2. Refresh OAuth2 access token (and capture rotated refresh_token)
  const res = await fetch('https://auth.post-pulse.com/oauth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: activeRefreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(`PostPulse OAuth refresh failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }

  // 3. Persist the new access_token + rotated refresh_token back to Supabase `system_tokens`
  if (supabaseUrl && serviceRoleKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const expiresInSec = Number(data.expires_in) || 82800;
      const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
      const nextRefresh = data.refresh_token || activeRefreshToken;

      const upsertRes = await fetch(`${cleanUrl}/rest/v1/system_tokens?on_conflict=service`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          service: 'postpulse',
          access_token: data.access_token,
          refresh_token: nextRefresh,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!upsertRes.ok) {
        const errText = await upsertRes.text();
        console.warn(`[PostPulse] Could not save rotated token to system_tokens (HTTP ${upsertRes.status}): ${errText.slice(0, 160)}`);
      }
    } catch (err) {
      console.warn(`[PostPulse] Failed saving rotated token: ${err.message}`);
    }
  }

  return data.access_token;
}

export async function importPostPulseMedia({ accessToken, imageUrl }) {
  const res = await fetch('https://api.post-pulse.com/v1/media/upload/import', {
    method: 'POST',
    signal: AbortSignal.timeout(25000),
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: imageUrl }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PostPulse media import failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }

  // Immediate path/s3Key response
  const immediatePath = data?.s3Key || data?.path || data?.key;
  if (immediatePath) return immediatePath;

  // Async import flow: { id, state: "QUEUED" } -> poll GET /v1/media/upload/import/{id} until READY
  if (!data?.id) {
    throw new Error(`PostPulse media import unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const importId = data.id;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollRes = await fetch(`https://api.post-pulse.com/v1/media/upload/import/${importId}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const pollData = await pollRes.json();
    if (!pollRes.ok) {
      throw new Error(`PostPulse import poll failed (HTTP ${pollRes.status}): ${JSON.stringify(pollData).slice(0, 200)}`);
    }

    const state = String(pollData?.state || '').toUpperCase();
    const readyPath = pollData?.s3Key || pollData?.path || pollData?.key;
    if ((state === 'READY' || state === 'COMPLETED') && readyPath) {
      return readyPath;
    }
    if (state === 'FAILED' || state === 'ERROR') {
      throw new Error(`PostPulse media import ${state}: ${JSON.stringify(pollData).slice(0, 200)}`);
    }
  }

  throw new Error(`PostPulse media import #${importId} timed out waiting for READY state`);
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\*\*/g, '')
    .trim();
}

export async function publishToPostPulse({
  accessToken,
  headline,
  summary,
  tag,
  imageUrl,
  videoUrl = '',
  score = 8,
  supabaseUrl = '',
  serviceRoleKey = '',
  delayMinutes = 2,
}) {
  const imageMediaPath = imageUrl ? await importPostPulseMedia({ accessToken, imageUrl }) : '';
  let videoMediaPath = '';
  if (videoUrl) {
    try {
      videoMediaPath = await importPostPulseMedia({ accessToken, imageUrl: videoUrl });
      console.log(`🎬 [PostPulse] Imported 9:16 MP4 Reel media: ${videoMediaPath}`);
    } catch (vidErr) {
      console.warn(`⚠️ [PostPulse] Reel MP4 import failed (falling back to PNG): ${vidErr.message}`);
    }
  }

  const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
  const cleanSummary = stripMarkdown(summary || headline || '');
  const cleanTag = stripMarkdown(tag || '');
  const baseText = `${cleanSummary}\n\n${cleanTag}`.trim();

  const accounts = await getConnectedAccounts(accessToken);
  const tiktokTimestamps = await loadTikTokPostTimestamps({ supabaseUrl, serviceRoleKey });
  const results = [];
  const errors = [];

  for (const acc of accounts) {
    const platformSettings = { type: acc.type };
    let attachmentPath = imageMediaPath;

    if (acc.type === 'INSTAGRAM') {
      if (videoMediaPath) {
        platformSettings.publicationType = 'REELS';
        attachmentPath = videoMediaPath;
      } else {
        platformSettings.publicationType = 'FEED';
      }
    } else if (acc.type === 'FACEBOOK') {
      platformSettings.publicationType = 'FEED';
    } else if (acc.type === 'TIK_TOK') {
      const check = evaluateTikTokEligibility({ score, timestamps: tiktokTimestamps });
      if (!check.allowed) {
        console.log(`⏭️ [PostPulse:TIK_TOK] Skipped (${check.reason})`);
        continue;
      }
      console.log(`🎯 [PostPulse:TIK_TOK] Allowed (${check.reason})`);
      platformSettings.title = stripMarkdown(headline || '').slice(0, 90);
      platformSettings.privacyLevel = 'PUBLIC_TO_EVERYONE';
      if (videoMediaPath) {
        attachmentPath = videoMediaPath;
      }
    }

    if (!attachmentPath) continue;

    // X/Twitter 280-char safety
    const content = acc.type === 'X_TWITTER' && baseText.length > 275
      ? `${baseText.slice(0, 272)}...`
      : baseText;

    const postObj = {
      content,
      attachmentPaths: [attachmentPath],
    };
    if (acc.chatId) {
      postObj.chatId = acc.chatId;
    }

    const res = await fetch('https://api.post-pulse.com/v1/posts', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheduledTime,
        isDraft: false,
        publications: [
          {
            socialMediaAccountId: acc.id,
            platformSettings,
            posts: [postObj],
          },
        ],
      }),
    });

    const respText = await res.text();
    if (res.ok) {
      const label = acc.type === 'INSTAGRAM' && platformSettings.publicationType === 'REELS'
        ? 'INSTAGRAM(REELS)'
        : acc.type;
      results.push(label);
      if (acc.type === 'TIK_TOK') {
        tiktokTimestamps.push(Date.now());
        await saveTikTokPostTimestamps({ supabaseUrl, serviceRoleKey, timestamps: tiktokTimestamps });
      }
    } else {
      console.warn(`⚠️ [PostPulse:${acc.type}] HTTP ${res.status}: ${respText.slice(0, 200)}`);
      errors.push(`${acc.type}: ${respText.slice(0, 120)}`);
    }
  }

  if (results.length === 0) {
    throw new Error(`All PostPulse channels failed: ${errors.join(' | ')}`);
  }

  return {
    mediaPath: imageMediaPath,
    videoMediaPath,
    scheduledTime,
    publishedChannels: results,
    failedChannels: errors,
  };
}
