// ============================================================
// BBN Static Site Generator (SSG) — build.mjs
// Internationalized Multi-Language Build Pipeline (/en/ & /pt/)
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { toSlug, extractTitle, extractBody, contentToHTML, esc, renderArticleContent, assembleFullArticleMarkdown, toTagSlug, parseTags, formatTagPillsHtml, formatTagCloudHtml, REGIONAL_TAXONOMY, getRegionForTag, getRegionForArticle, groupTagsByRegion, formatRegionalNavHtml, isValidArticleRecord } from './shared.mjs';

// ── Configuration ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'dist');

const CONFIG = {
  baseUrl: (process.env.BBN_BASE_URL || 'https://bbnews.cc').replace(/\/+$/, ''),
  defaultOgImage: '/assets/og-default.png',
  homepageRetentionHours: 48, // 2 days — homepage feed display limit
  supabaseUrl: process.env.SUPABASE_URL || 'https://thyibhsuhpxqexjvprct.supabase.co',
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  supabaseTable: 'articles',
  supabaseLimit: 500
};
const VERSION = Date.now().toString();

// ── i18n Localization Dictionaries ─────────────────────────
const I18N = {
  en: {
    htmlLang: 'en',
    homeTitle: 'BBN - Bitcoin Brasil News | Crypto, Markets & Geopolitics',
    homeDesc: 'Real-time news on Bitcoin, cryptocurrency markets, and global geopolitics. Breaking news powered by Nostr.',
    archiveTitle: 'News Archive | BBN – Bitcoin Brasil News',
    archiveDesc: 'Complete archive of all news published by BBN – Bitcoin Brasil News. Search and filter by Bitcoin, markets, and geopolitics.',
    privacyTitle: 'Privacy Policy | BBN – Bitcoin Brasil News',
    privacyDesc: 'Privacy Policy for BBN – Bitcoin Brasil News. Learn how we protect your data and our commitment to privacy-first principles.',
    navHome: 'Home',
    navArchive: 'Archive',
    sectionLatestNews: 'Latest news',
    moreNews: 'More news',
    latestArticlesHeading: 'Latest Articles',
    footerUpdated: 'Updated daily',
    footerPrivacy: 'Privacy Policy',
    archiveHeading: 'News Archive',
    articlesPublished: 'articles published',
    searchPlaceholder: 'Search news by title...',
    periodAll: 'All Time',
    periodToday: 'Today',
    periodWeek: 'This Week',
    periodMonth: 'This Month',
    backToNews: 'Back to news',
    backToHome: 'Back to home',
    filterLabel: 'FILTER:',
    allNews: 'All News',
    viewOriginalSource: '→ View original source',
    privacyLastUpdated: 'Last Updated: September 2026',
    tagArchiveTitle: 'News Archive',
    tagArchiveDesc: 'Articles and real-time coverage tagged with #',
    articlesTaggedText: 'articles published',
    allArchivesText: 'All News Archive',
    topicsHeading: 'TOPICS',
    regionArchiveTitle: 'News & Analysis',
    regionArchiveDesc: 'Comprehensive news, sub-topics, and real-time coverage for '
  },
  pt: {
    htmlLang: 'pt-BR',
    homeTitle: 'BBN - Bitcoin Brasil News | Cripto, Mercado e Geopolítica',
    homeDesc: 'Notícias em tempo real sobre Bitcoin, mercados e geopolítica. Breaking news do mercado cripto global, powered by Nostr.',
    archiveTitle: 'Arquivo de Notícias | BBN – Bitcoin Brasil News',
    archiveDesc: 'Arquivo completo de todas as notícias publicadas pelo BBN – Bitcoin Brasil News. Busque e filtre por Bitcoin, mercado e geopolítica.',
    privacyTitle: 'Política de Privacidade | BBN – Bitcoin Brasil News',
    privacyDesc: 'Política de Privacidade do BBN – Bitcoin Brasil News. Conheça como protegemos seus dados e nosso compromisso com a privacidade.',
    navHome: 'Início',
    navArchive: 'Arquivo',
    sectionLatestNews: 'Últimas notícias',
    moreNews: 'Mais notícias',
    latestArticlesHeading: 'Últimos Artigos',
    footerUpdated: 'Atualizado diariamente',
    footerPrivacy: 'Política de Privacidade',
    archiveHeading: 'Arquivo de Notícias',
    articlesPublished: 'artigos publicados',
    searchPlaceholder: 'Buscar notícias por título...',
    periodAll: 'Todo o período',
    periodToday: 'Hoje',
    periodWeek: 'Esta semana',
    periodMonth: 'Este mês',
    backToNews: 'Voltar para notícias',
    backToHome: 'Voltar para o início',
    filterLabel: 'FILTRAR:',
    allNews: 'Todas as Notícias',
    viewOriginalSource: '→ Ver fonte original',
    privacyLastUpdated: 'Última atualização: Setembro de 2026',
    tagArchiveTitle: 'Arquivo de Notícias',
    tagArchiveDesc: 'Artigos e cobertura em tempo real com a tag #',
    articlesTaggedText: 'artigos publicados',
    allArchivesText: 'Arquivo Completo',
    topicsHeading: 'TÓPICOS',
    regionArchiveTitle: 'Notícias & Análises',
    regionArchiveDesc: 'Cobertura completa, sub-tópicos e notícias em tempo real sobre '
  }
};

// ── Portuguese Privacy Policy Body HTML ────────────────────
const PRIVACY_BODY_PT = `
          <!-- 1. Introdução -->
          <section class="privacy-section" id="privacy-introduction">
            <h2>1. Introdução</h2>
            <p>
              Bem-vindo ao <strong>BBN – Bitcoin Brasil News</strong> (<a href="https://bbnews.cc" target="_blank" rel="noopener noreferrer">https://bbnews.cc</a>). Somos uma plataforma de notícias financeiras dedicada à cobertura em tempo real e precisa sobre Bitcoin, mercado de criptoativos e desdobramentos geopolíticos globais.
            </p>
            <p>
              No BBN, assumimos o compromisso integral com a proteção de sua privacidade e transparência sobre o tratamento de dados. Esta Política de Privacidade descreve os padrões de tratamento e proteção adotados em nossa plataforma.
            </p>
            <p>
              Ao acessar e navegar em nosso site, você declara ciência quanto a esta Política de Privacidade.
            </p>
          </section>

          <!-- 2. Informações que Coletamos -->
          <section class="privacy-section" id="privacy-information">
            <h2>2. Informações que Coletamos (e o que NÃO coletamos)</h2>
            <p>
              O BBN opera sob uma <strong>filosofia orientada à privacidade (privacy-first)</strong>:
            </p>
            <ul>
              <li><strong>Nenhum Cadastro Necessário:</strong> Não solicitamos criação de conta, nome, e-mail, telefone ou quaisquer dados pessoais para ler as notícias.</li>
              <li><strong>Sem Venda de Dados:</strong> Jamais comercializamos, alugamos ou monetizamos dados de visitantes com terceiros.</li>
              <li><strong>Sem Rastreamento Invasivo:</strong> Não empregamos ferramentas de profiling comportamental ou scripts de fingerprinting.</li>
            </ul>

            <h3>Dados Técnicos Mínimos</h3>
            <p>
              Como em qualquer serviço da web, servidores de hospedagem e proxies podem registrar logs técnicos operacionais básicos (endereço IP anonimizado, tipo de navegador, sistema operacional e horário da requisição). Esses registros servem estritamente para segurança, diagnóstico de infraestrutura e prevenção contra ataques DDoS.
            </p>
          </section>

          <!-- 3. Protocolos Descentralizados -->
          <section class="privacy-section" id="privacy-decentralized">
            <h2>3. Protocolos Descentralizados e Serviços de Terceiros</h2>
            <p>
              Nossa infraestrutura combina serviços modernos de nuvem com tecnologias abertas:
            </p>
            <ul>
              <li><strong>Supabase:</strong> Banco de dados relacional para armazenamento editorial de artigos. Não armazena dados de leitores.</li>
              <li><strong>Protocolo Nostr:</strong> O BBN distribui publicações na rede Nostr de forma pública e resistente à censura. Nenhum dado de leitor trafega pelo protocolo.</li>
              <li><strong>Provedores Externos:</strong> Google Fonts para tipografia e Cloudflare/Render para entrega estática de conteúdo.</li>
            </ul>
          </section>

          <!-- 4. Cookies -->
          <section class="privacy-section" id="privacy-cookies">
            <h2>4. Cookies e Armazenamento Local</h2>
            <p>
              O site utiliza o mínimo de armazenamento local necessário para preferências de interface (como cache de filtros ou preferências de idioma). Não utilizamos cookies de rastreamento de publicidade de terceiros.
            </p>
          </section>

          <!-- 5. Segurança e Conformidade (LGPD, GDPR, CCPA) -->
          <section class="privacy-section" id="privacy-security">
            <h2>5. Segurança e Conformidade Internacional</h2>
            <p>
              Adotamos criptografia ponta a ponta via HTTPS/TLS em todas as conexões e respeitamos integralmente as legislações de privacidade vigentes:
            </p>
            <ul>
              <li><strong>LGPD (Lei Geral de Proteção de Dados - Brasil):</strong> Princípios de necessidade, transparência e segurança estritamente observados.</li>
              <li><strong>GDPR (União Europeia) e CCPA (Califórnia):</strong> Padrões internacionais de minimização de dados e direitos do usuário.</li>
            </ul>
          </section>

          <!-- 6. Contato -->
          <section class="privacy-section" id="privacy-contact">
            <h2>6. Informações de Contato</h2>
            <p>
              Para dúvidas editoriais ou sobre privacidade, entre em contato via <a href="mailto:info@bbnews.cc" class="privacy-contact-link">info@bbnews.cc</a>.
            </p>
          </section>
`;

const PRIVACY_BODY_EN = `
          <!-- 1. Introduction -->
          <section class="privacy-section" id="privacy-introduction">
            <h2>1. Introduction</h2>
            <p>
              Welcome to <strong>BBN – Bitcoin Brasil News</strong> (<a href="https://bbnews.cc" target="_blank" rel="noopener noreferrer">https://bbnews.cc</a>). We are a financial news platform dedicated to delivering timely, accurate coverage of Bitcoin, cryptocurrency markets, and global geopolitical developments.
            </p>
            <p>
              At BBN, we are deeply committed to protecting your privacy and maintaining full transparency regarding how data is handled on our platform. This Privacy Policy describes the types of information we may collect, how it is processed, and the measures we take to safeguard it.
            </p>
            <p>
              By accessing and using our website, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </section>

          <!-- 2. Information We Collect (And What We Don't) -->
          <section class="privacy-section" id="privacy-information">
            <h2>2. Information We Collect (And What We Don't)</h2>
            <p>
              BBN operates under a <strong>privacy-first philosophy</strong>. We have intentionally designed our platform so that you can read the news freely and without friction:
            </p>
            <ul>
              <li><strong>No Registration Required:</strong> You do not need to create an account, provide your name, email address, phone number, or any other personally identifiable information (PII) to browse and read articles on our site.</li>
              <li><strong>No Data Sales:</strong> We do not sell, trade, rent, or otherwise monetize any user data to third parties — under any circumstances.</li>
              <li><strong>No Invasive Tracking:</strong> We do not deploy invasive tracking mechanisms, behavioral profiling tools, or fingerprinting scripts to monitor your browsing activity across the web.</li>
            </ul>

            <h3>Minimal Technical Data</h3>
            <p>
              Like virtually all websites, our hosting infrastructure and analytics services may automatically process minimal technical log data as part of standard server operations (anonymized IP addresses, browser type, operating system, and request timestamps). This data is used solely to ensure site stability, diagnose technical issues, and protect against malicious traffic.
            </p>
          </section>

          <!-- 3. Decentralized Protocol & Third-Party Services -->
          <section class="privacy-section" id="privacy-decentralized">
            <h2>3. Decentralized Protocol &amp; Third-Party Services</h2>
            <p>
              BBN's backend infrastructure is designed to leverage modern, decentralized technologies:
            </p>
            <ul>
              <li><strong>Supabase:</strong> Stores editorial article data, headlines, and metadata. No user-generated personal data is stored in Supabase.</li>
              <li><strong>Nostr Protocol:</strong> BBN distributes content natively via the open, censorship-resistant Nostr protocol. Only editorial content is published to public relays.</li>
              <li><strong>Third-Party Delivery:</strong> Google Fonts for typography and Cloudflare/Render for static asset caching.</li>
            </ul>
          </section>

          <!-- 4. Cookies and Tracking Technologies -->
          <section class="privacy-section" id="privacy-cookies">
            <h2>4. Cookies and Tracking Technologies</h2>
            <p>
              BBN uses <strong>minimal or no tracking cookies</strong>. Any cookies or local storage items used are strictly for performance optimization, site security, or interface functional preferences.
            </p>
          </section>

          <!-- 5. Data Security & International Compliance -->
          <section class="privacy-section" id="privacy-security">
            <h2>5. Data Security &amp; International Compliance</h2>
            <p>
              All traffic is encrypted using HTTPS/TLS. BBN respects and complies with global data privacy frameworks including the <strong>GDPR</strong> (EU), <strong>CCPA</strong> (California), and Brazil's <strong>LGPD</strong>.
            </p>
          </section>

          <!-- 6. Contact Information -->
          <section class="privacy-section" id="privacy-contact">
            <h2>6. Contact Information</h2>
            <p>
              If you have any questions or requests regarding this policy, please contact us at <a href="mailto:info@bbnews.cc" class="privacy-contact-link">info@bbnews.cc</a>.
            </p>
          </section>
`;

// ── Fetch articles from Supabase (articles or artigos) ────────
async function fetchSupabaseTable(tableName) {
  const { supabaseUrl, supabaseKey, supabaseLimit } = CONFIG;

  if (!supabaseKey) {
    throw new Error('SUPABASE_ANON_KEY not set in environment variables.');
  }

  let allRows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const url = `${supabaseUrl}/rest/v1/${tableName}?order=created_at.desc&limit=${pageSize}&offset=${from}&select=*`;
    const res = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 404 || res.status === 400) {
        console.warn(`⚠️ Warning: Supabase table '${tableName}' (${res.status}): ${errText}`);
        return [];
      }
      throw new Error(`Supabase fetch failed for '${tableName}' (${res.status}): ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    allRows = allRows.concat(rows);
    if (rows.length < pageSize || allRows.length >= (supabaseLimit || 5000)) break;
    from += pageSize;
  }

  return allRows;
}

// ── Map Supabase Row to Internal BBN Article Model ──────────
function mapSupabaseRow(row, lang = 'en') {
  const title = (row.headline || (lang === 'pt' ? 'Sem título' : 'Untitled')).replace(/\*\*/g, '').trim();
  const assembledMarkdown = assembleFullArticleMarkdown(row, lang);
  const content = row.content || row.conteudo_blog || assembledMarkdown;
  const body = assembledMarkdown || extractBody(content, title) || content;
  const summary = row.summary || (row.article_lead ? row.article_lead.slice(0, 160).replace(/\n/g, ' ').trim() : (body ? body.slice(0, 160).replace(/\n/g, ' ').trim() : ''));
  const hook = row.hook || '';
  const score = 7;
  const time = row.created_at
    ? new Date(row.created_at).toISOString()
    : (row.time ? new Date(row.time).toISOString() : new Date().toISOString());

  const rawTagSource = row.tag || row.tags || row.hashtags;
  const parsedTags = rawTagSource
    ? parseTags(rawTagSource)
    : extractTagsFromContent(title, content).map(t => ({ label: t.charAt(0).toUpperCase() + t.slice(1), slug: toTagSlug(t) }));
  const tags = parsedTags.map(t => t.slug);

  return {
    id: String(row.id),
    lang,
    title,
    headline: title,
    slug: toSlug(title),
    body,
    conteudo_blog: content,
    summary,
    hook,
    score,
    time,
    parsedTags,
    tags,
    link: row.source_url || row.link || '',
    source_name: row.source_name || '',
    source_url: row.source_url || row.link || '',
    article_lead: row.article_lead || '',
    data_figures: row.data_figures || '',
    scenario: row.scenario || '',
    quote_text: row.quote_text || '',
    insight: row.insight || '',
    market_reaction: row.market_reaction || ''
  };
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

// ── Data Model: Parse & Localize Articles (Multi-language) ──
function parseLocalizedArticles(rawArticles) {
  const enPosts = [];
  const ptPosts = [];
  const slugMapEn = {};
  const slugMapPt = {};
  const enById = new Map();
  const ptById = new Map();

  rawArticles.forEach(row => {
    if (!row || !isValidArticleRecord(row)) return;

    // Pattern A: Nested .en and/or .pt objects
    if (row.en || row.pt) {
      let enPost = null;
      let ptPost = null;

      if (row.en) {
        const d = row.en;
        const content = d.content || d.conteudo_blog || d.article_lead || '';
        const title = (d.title || d.headline || extractTitle(content)).replace(/\*\*/g, '').trim();
        const body = extractBody(content, title);
        let slug = d.slug || toSlug(title);
        if (slugMapEn[slug]) slug = `${slug}-${row.id}`;
        const enParsedTags = d.parsedTags || parseTags(d.tag || d.tags || extractTagsFromContent(title, content));
        enPost = {
          id: String(row.id),
          lang: 'en',
          title,
          body,
          slug,
          link: d.link || row.link || '',
          summary: d.summary || row.summary || (body ? body.slice(0, 160).replace(/\n/g, ' ').trim() : ''),
          hook: d.hook || row.hook || '',
          time: d.time || row.time || new Date().toISOString(),
          score: d.score || row.score || 7,
          parsedTags: enParsedTags,
          tags: enParsedTags.map(t => t.slug)
        };
        slugMapEn[slug] = enPost;
        enPosts.push(enPost);
        enById.set(String(row.id), enPost);
      }

      if (row.pt) {
        const d = row.pt;
        const content = d.content || d.conteudo_blog || d.article_lead || '';
        const title = (d.title || d.headline || extractTitle(content)).replace(/\*\*/g, '').trim();
        const body = extractBody(content, title);
        let slug = d.slug || toSlug(title);
        if (slugMapPt[slug]) slug = `${slug}-${row.id}`;
        const ptParsedTags = d.parsedTags || parseTags(d.tag || d.tags || extractTagsFromContent(title, content));
        ptPost = {
          id: String(row.id),
          lang: 'pt',
          title,
          body,
          slug,
          link: d.link || row.link || '',
          summary: d.summary || row.summary || (body ? body.slice(0, 160).replace(/\n/g, ' ').trim() : ''),
          hook: d.hook || row.hook || '',
          time: d.time || row.time || new Date().toISOString(),
          score: d.score || row.score || 7,
          parsedTags: ptParsedTags,
          tags: ptParsedTags.map(t => t.slug)
        };
        slugMapPt[slug] = ptPost;
        ptPosts.push(ptPost);
        ptById.set(String(row.id), ptPost);
      }

      if (enPost && ptPost) {
        enPost.translation = ptPost;
        ptPost.translation = enPost;
      }
      return;
    }

    // Pattern B: Dual field suffixes (title_en / title_pt, content_en / content_pt)
    const hasPt = Boolean(row.title_pt || row.headline_pt || row.content_pt || row.conteudo_pt || row.conteudo_blog_pt);
    const hasEn = Boolean(row.title_en || row.headline_en || row.content_en || row.headline || row.title || row.conteudo_blog || row.content);
    const explicitLang = (row.lang || row.language || '').toLowerCase();

    if (hasPt && (hasEn || explicitLang === 'both')) {
      const enTitle = (row.title_en || row.headline_en || row.headline || row.title || 'Untitled').replace(/\*\*/g, '').trim();
      const enContent = row.content_en || row.conteudo_blog || row.content || row.article_lead || '';
      const enBody = extractBody(enContent, enTitle);
      let enSlug = toSlug(enTitle);
      if (slugMapEn[enSlug]) enSlug = `${enSlug}-${row.id}`;

      const ptTitle = (row.title_pt || row.headline_pt || enTitle).replace(/\*\*/g, '').trim();
      const ptContent = row.content_pt || row.conteudo_pt || row.conteudo_blog_pt || enContent;
      const ptBody = extractBody(ptContent, ptTitle);
      let ptSlug = toSlug(ptTitle);
      if (slugMapPt[ptSlug]) ptSlug = `${ptSlug}-${row.id}`;

      const enParsedTags = row.parsedTags || parseTags(row.tags_en || row.tag || row.tags || extractTagsFromContent(enTitle, enContent));
      const ptParsedTags = row.parsedTags || parseTags(row.tags_pt || row.tag || row.tags || extractTagsFromContent(ptTitle, ptContent));

      const enPost = {
        id: String(row.id),
        lang: 'en',
        title: enTitle,
        body: enBody,
        slug: enSlug,
        link: row.link ?? '',
        summary: row.summary_en || row.summary || (enBody ? enBody.slice(0, 160).replace(/\n/g, ' ').trim() : ''),
        hook: row.hook_en || row.hook || '',
        time: row.time || new Date().toISOString(),
        score: row.score || 7,
        parsedTags: enParsedTags,
        tags: enParsedTags.map(t => t.slug)
      };

      const ptPost = {
        id: String(row.id),
        lang: 'pt',
        title: ptTitle,
        body: ptBody,
        slug: ptSlug,
        link: row.link ?? '',
        summary: row.summary_pt || row.summary || (ptBody ? ptBody.slice(0, 160).replace(/\n/g, ' ').trim() : ''),
        hook: row.hook_pt || row.hook || '',
        time: row.time || new Date().toISOString(),
        score: row.score || 7,
        parsedTags: ptParsedTags,
        tags: ptParsedTags.map(t => t.slug)
      };

      enPost.translation = ptPost;
      ptPost.translation = enPost;

      slugMapEn[enSlug] = enPost;
      slugMapPt[ptSlug] = ptPost;
      enPosts.push(enPost);
      ptPosts.push(ptPost);
      enById.set(String(row.id), enPost);
      ptById.set(String(row.id), ptPost);
      return;
    }

    // Pattern C: Unilateral record (explicit lang or legacy default to 'en')
    const isPtOnly = explicitLang.startsWith('pt') || (hasPt && !hasEn);
    const content = row.content_pt || row.content_en || row.conteudo_blog || row.content || row.article_lead || row.headline || '';
    const rawTitle = row.title_pt || row.headline_pt || row.title_en || row.headline_en || row.headline || row.title;
    const title = (rawTitle && rawTitle !== 'Untitled' ? rawTitle : extractTitle(content)).replace(/\*\*/g, '').trim();
    const body = extractBody(content, title);
    const parsedTags = row.parsedTags || parseTags(row.tag || row.tags || extractTagsFromContent(title, content));

    if (isPtOnly) {
      let slug = toSlug(title);
      if (slugMapPt[slug]) slug = `${slug}-${row.id}`;
      const post = {
        id: String(row.id),
        lang: 'pt',
        title,
        body,
        slug,
        link: row.source_url || row.link || '',
        source_name: row.source_name || '',
        source_url: row.source_url || row.link || '',
        article_lead: row.article_lead || '',
        data_figures: row.data_figures || '',
        scenario: row.scenario || '',
        quote_text: row.quote_text || '',
        insight: row.insight || '',
        market_reaction: row.market_reaction || '',
        summary: row.summary || (row.article_lead ? row.article_lead.slice(0, 160).replace(/\n/g, ' ').trim() : (body ? body.slice(0, 160).replace(/\n/g, ' ').trim() : '')),
        hook: row.hook || '',
        time: row.time || new Date().toISOString(),
        score: row.score || 7,
        parsedTags,
        tags: parsedTags.map(t => t.slug),
        pairId: row.pair_id || row.translation_of || null,
        translation: null
      };
      slugMapPt[slug] = post;
      ptPosts.push(post);
      ptById.set(String(row.id), post);
    } else {
      let slug = toSlug(title);
      if (slugMapEn[slug]) slug = `${slug}-${row.id}`;
      const post = {
        id: String(row.id),
        lang: 'en',
        title,
        body,
        slug,
        link: row.source_url || row.link || '',
        source_name: row.source_name || '',
        source_url: row.source_url || row.link || '',
        article_lead: row.article_lead || '',
        data_figures: row.data_figures || '',
        scenario: row.scenario || '',
        quote_text: row.quote_text || '',
        insight: row.insight || '',
        market_reaction: row.market_reaction || '',
        summary: row.summary || (row.article_lead ? row.article_lead.slice(0, 160).replace(/\n/g, ' ').trim() : (body ? body.slice(0, 160).replace(/\n/g, ' ').trim() : '')),
        hook: row.hook || '',
        time: row.time || new Date().toISOString(),
        score: row.score || 7,
        parsedTags,
        tags: parsedTags.map(t => t.slug),
        pairId: row.pair_id || row.translation_of || null,
        translation: null
      };
      slugMapEn[slug] = post;
      enPosts.push(post);
      enById.set(String(row.id), post);
    }
  });

  // Second pass: link posts if translation_of / pair_id matches, same ID exists, or timestamp proximity
  enPosts.forEach(post => {
    if (!post.translation) {
      const byPair = post.pairId ? ptById.get(String(post.pairId)) : null;
      const byId = ptById.get(String(post.id));
      let counterpart = byPair || byId;

      if (!counterpart && post.time) {
        const postTime = new Date(post.time).getTime();
        counterpart = ptPosts.find(pt => {
          if (!pt.translation && pt.time) {
            const diff = Math.abs(postTime - new Date(pt.time).getTime());
            return diff < 120000; // within 2 minutes
          }
          return false;
        });
      }

      if (counterpart) {
        post.translation = counterpart;
        counterpart.translation = post;
      }
    }
  });

  enPosts.forEach(p => { p.region = getRegionForArticle(p); });
  ptPosts.forEach(p => { p.region = getRegionForArticle(p); });

  return { enPosts, ptPosts, slugMapEn, slugMapPt };
}

// ── Sanitize URL ───────────────────────────────────────────
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return '';
  return url.trim();
}

// ── Hreflang Tag Builder ───────────────────────────────────
function buildHreflangTags(enUrl, ptUrl) {
  const tags = [];
  if (enUrl) {
    tags.push(`<link rel="alternate" hreflang="en" href="${enUrl}" />`);
  }
  if (ptUrl) {
    tags.push(`<link rel="alternate" hreflang="pt-BR" href="${ptUrl}" />`);
  }
  // x-default points to English, falling back to Portuguese if English is absent
  const defaultUrl = enUrl || ptUrl;
  if (defaultUrl) {
    tags.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);
  }
  return tags.join('\n  ');
}

// ── Generate Article HTML ──────────────────────────────────
function generateArticlePage(post, template, lang) {
  const dict = I18N[lang];
  const description = post.summary || post.body.replace(/\n/g, ' ').slice(0, 160).trim();
  const canonicalUrl = `${CONFIG.baseUrl}/${lang}/news/${post.slug}`;
  const ogImage = CONFIG.baseUrl + CONFIG.defaultOgImage;
  const breadcrumb = esc(post.title.slice(0, 45)) + (post.title.length > 45 ? '…' : '');
  const hasStructuredSections = Boolean(
    post.article_lead || post.data_figures || post.scenario ||
    post.quote_text || post.insight || post.market_reaction
  );
  const articleBodyHtml = hasStructuredSections
    ? renderArticleContent(post, lang)
    : contentToHTML(post.body || post.conteudo_blog || '');
  const safeLink = sanitizeUrl(post.link);
  const sourceBtn = safeLink
    ? `<a class="article-source-btn" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">${dict.viewOriginalSource}</a>`
    : '';

  const articleCategory = (post.tags && post.tags.length > 0)
    ? post.tags[0].charAt(0).toUpperCase() + post.tags[0].slice(1)
    : (lang === 'pt' ? 'Notícias' : 'News');

  // Bidirectional hreflang calculation
  let enUrl = null;
  let ptUrl = null;

  if (lang === 'en') {
    enUrl = canonicalUrl;
    if (post.translation) {
      ptUrl = `${CONFIG.baseUrl}/pt/news/${post.translation.slug}`;
    }
  } else {
    ptUrl = canonicalUrl;
    if (post.translation) {
      enUrl = `${CONFIG.baseUrl}/en/news/${post.translation.slug}`;
    }
  }

  const hreflangTags = buildHreflangTags(enUrl, ptUrl);

  // Language switcher URLs
  const langEnUrl = enUrl || `${CONFIG.baseUrl}/en/`;
  const langPtUrl = ptUrl || `${CONFIG.baseUrl}/pt/`;
  const langEnActive = lang === 'en' ? ' active' : '';
  const langPtActive = lang === 'pt' ? ' active' : '';

  // JSON-LD NewsArticle
  const jsonLdArticle = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": post.title,
    "description": description,
    "datePublished": post.time,
    "dateModified": post.time,
    "image": ogImage,
    "url": canonicalUrl,
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
    "inLanguage": dict.htmlLang
  }, null, 4);

  const bbnConfigArticle = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
  html = html.replace(/\{\{TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{OG_TITLE\}\}/g, () => esc(post.title));
  html = html.replace(/\{\{OG_DESCRIPTION\}\}/g, () => esc(description));
  html = html.replace(/\{\{CANONICAL_URL\}\}/g, () => canonicalUrl);
  html = html.replace(/\{\{HREFLANG_TAGS\}\}/g, () => hreflangTags);
  html = html.replace(/\{\{OG_IMAGE\}\}/g, () => ogImage);
  html = html.replace(/\{\{PUBLISHED_TIME\}\}/g, () => post.time);
  html = html.replace(/\{\{ARTICLE_CATEGORY\}\}/g, () => esc(articleCategory));
  html = html.replace(/\{\{JSON_LD_ARTICLE\}\}/g, () => jsonLdArticle);
  html = html.replace(/\{\{BREADCRUMB\}\}/g, () => breadcrumb);
  html = html.replace(/\{\{ARTICLE_TITLE\}\}/g, () => esc(post.title));
  const postParsedTags = post.parsedTags || parseTags(post.tags);
  const articleTagsHtml = formatTagPillsHtml(postParsedTags, lang);

  html = html.replace(/\{\{ARTICLE_BODY\}\}/g, () => articleBodyHtml);
  html = html.replace(/\{\{ARTICLE_TAGS\}\}/g, () => articleTagsHtml);
  html = html.replace(/\{\{SOURCE_BUTTON\}\}/g, () => sourceBtn);
  html = html.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfigArticle);

  // Navigation & UI tokens
  html = html.replace(/\{\{LANG_EN_URL\}\}/g, () => langEnUrl);
  html = html.replace(/\{\{LANG_PT_URL\}\}/g, () => langPtUrl);
  html = html.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => langEnActive);
  html = html.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => langPtActive);
  html = html.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
  html = html.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
  html = html.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
  html = html.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
  html = html.replace(/\{\{SECTION_LATEST_NEWS\}\}/g, () => dict.sectionLatestNews);
  html = html.replace(/\{\{MORE_NEWS_TEXT\}\}/g, () => dict.moreNews);
  html = html.replace(/\{\{BACK_TO_NEWS_TEXT\}\}/g, () => dict.backToNews);
  html = html.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
  html = html.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
  html = html.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
}

// ── Generate Tag Archive HTML ──────────────────────────────
function generateTagArchivePage(tagEntry, template, lang, groupedTags, topTags, otherLangTagMap) {
  const dict = I18N[lang];
  const canonicalUrl = `${CONFIG.baseUrl}/${lang}/tag/${tagEntry.slug}`;
  const ogImage = CONFIG.baseUrl + CONFIG.defaultOgImage;
  const tagLabel = tagEntry.label;
  const pageTitle = `#${tagLabel} – ${dict.tagArchiveTitle} | BBN – Bitcoin Brasil News`;
  const pageDesc = `${dict.tagArchiveDesc}${tagLabel}. ${tagEntry.articles.length} ${dict.articlesTaggedText}.`;

  // Bidirectional hreflang calculation
  let enUrl = null;
  let ptUrl = null;
  if (lang === 'en') {
    enUrl = canonicalUrl;
    if (otherLangTagMap && otherLangTagMap.has(tagEntry.slug)) {
      ptUrl = `${CONFIG.baseUrl}/pt/tag/${tagEntry.slug}`;
    }
  } else {
    ptUrl = canonicalUrl;
    if (otherLangTagMap && otherLangTagMap.has(tagEntry.slug)) {
      enUrl = `${CONFIG.baseUrl}/en/tag/${tagEntry.slug}`;
    }
  }
  const hreflangTags = buildHreflangTags(enUrl, ptUrl);

  const langEnUrl = enUrl || `${CONFIG.baseUrl}/en/archive`;
  const langPtUrl = ptUrl || `${CONFIG.baseUrl}/pt/archive`;
  const langEnActive = lang === 'en' ? ' active' : '';
  const langPtActive = lang === 'pt' ? ' active' : '';

  const parentRegion = getRegionForTag(tagEntry.slug);
  const isPt = lang === 'pt';
  const prefix = isPt ? 'regiao' : 'region';
  const regSlug = isPt ? parentRegion.slugPt : parentRegion.slugEn;
  const regLabel = isPt ? parentRegion.labelPt : parentRegion.labelEn;
  const parentBreadcrumb = `<a href="/${lang}/${prefix}/${regSlug}">${esc(regLabel)}</a> <span>›</span> `;

  const regionalNavHtml = formatRegionalNavHtml({
    groupedTags,
    topTags,
    activeRegionId: parentRegion.id,
    activeTagSlug: tagEntry.slug,
    lang
  });
  const archiveGridHtml = generateArchiveGrid(tagEntry.articles, lang);

  const bbnConfig = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
  html = html.replace(/\{\{PAGE_TITLE\}\}/g, () => esc(pageTitle));
  html = html.replace(/\{\{PAGE_DESCRIPTION\}\}/g, () => esc(pageDesc));
  html = html.replace(/\{\{CANONICAL_URL\}\}/g, () => canonicalUrl);
  html = html.replace(/\{\{HREFLANG_TAGS\}\}/g, () => hreflangTags);
  html = html.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  html = html.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfig);

  html = html.replace(/\{\{TAG_LABEL\}\}/g, () => esc(tagLabel));
  html = html.replace(/\{\{TAG_ARTICLE_COUNT\}\}/g, () => String(tagEntry.articles.length));
  html = html.replace(/\{\{PARENT_REGION_BREADCRUMB\}\}/g, () => parentBreadcrumb);
  html = html.replace(/\{\{TAG_CLOUD\}\}/g, () => regionalNavHtml);
  html = html.replace(/\{\{ARCHIVE_GRID\}\}/g, () => archiveGridHtml);

  // Switcher & Navigation
  html = html.replace(/\{\{LANG_EN_URL\}\}/g, () => langEnUrl);
  html = html.replace(/\{\{LANG_PT_URL\}\}/g, () => langPtUrl);
  html = html.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => langEnActive);
  html = html.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => langPtActive);
  html = html.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
  html = html.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
  html = html.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
  html = html.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
  html = html.replace(/\{\{ALL_ARCHIVES_TEXT\}\}/g, () => dict.allArchivesText);
  html = html.replace(/\{\{ARTICLES_PUBLISHED_TEXT\}\}/g, () => dict.articlesTaggedText);
  html = html.replace(/\{\{SEARCH_PLACEHOLDER\}\}/g, () => dict.searchPlaceholder);
  html = html.replace(/\{\{PERIOD_ALL_TIME\}\}/g, () => dict.periodAll);
  html = html.replace(/\{\{PERIOD_TODAY\}\}/g, () => dict.periodToday);
  html = html.replace(/\{\{PERIOD_WEEK\}\}/g, () => dict.periodWeek);
  html = html.replace(/\{\{PERIOD_MONTH\}\}/g, () => dict.periodMonth);
  html = html.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
  html = html.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
  html = html.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
}

// ── Generate Region Archive HTML ────────────────────────────
function generateRegionArchivePage(region, template, lang, groupedTags, topTags, articles, otherTagMap) {
  const dict = I18N[lang];
  const isPt = lang === 'pt';
  const prefix = isPt ? 'regiao' : 'region';
  const regSlug = isPt ? region.slugPt : region.slugEn;
  const regLabel = isPt ? region.labelPt : region.labelEn;
  const canonicalUrl = `${CONFIG.baseUrl}/${lang}/${prefix}/${regSlug}`;
  const pageTitle = `${regLabel} – ${dict.regionArchiveTitle} | BBN – Bitcoin Brasil News`;
  const pageDesc = `${dict.regionArchiveDesc}${regLabel}. ${articles.length} ${dict.articlesTaggedText}.`;

  // Bidirectional hreflang
  let enUrl = `${CONFIG.baseUrl}/en/region/${region.slugEn}`;
  let ptUrl = `${CONFIG.baseUrl}/pt/regiao/${region.slugPt}`;
  const hreflangTags = buildHreflangTags(enUrl, ptUrl);

  const langEnUrl = enUrl;
  const langPtUrl = ptUrl;
  const langEnActive = lang === 'en' ? ' active' : '';
  const langPtActive = lang === 'pt' ? ' active' : '';

  const regionalNavHtml = formatRegionalNavHtml({
    groupedTags,
    topTags,
    activeRegionId: region.id,
    activeTagSlug: null,
    lang
  });

  const archiveGridHtml = generateArchiveGrid(articles, lang);

  const bbnConfig = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
  html = html.replace(/\{\{PAGE_TITLE\}\}/g, () => esc(pageTitle));
  html = html.replace(/\{\{PAGE_DESCRIPTION\}\}/g, () => esc(pageDesc));
  html = html.replace(/\{\{CANONICAL_URL\}\}/g, () => canonicalUrl);
  html = html.replace(/\{\{HREFLANG_TAGS\}\}/g, () => hreflangTags);
  html = html.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  html = html.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfig);

  html = html.replace(/\{\{REGION_LABEL\}\}/g, () => esc(regLabel));
  html = html.replace(/\{\{REGION_ARTICLE_COUNT\}\}/g, () => String(articles.length));
  html = html.replace(/\{\{REGIONAL_NAV\}\}/g, () => regionalNavHtml);
  html = html.replace(/\{\{ARCHIVE_GRID\}\}/g, () => archiveGridHtml);

  // Switcher & Navigation
  html = html.replace(/\{\{LANG_EN_URL\}\}/g, () => langEnUrl);
  html = html.replace(/\{\{LANG_PT_URL\}\}/g, () => langPtUrl);
  html = html.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => langEnActive);
  html = html.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => langPtActive);
  html = html.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
  html = html.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
  html = html.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
  html = html.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
  html = html.replace(/\{\{ALL_ARCHIVES_TEXT\}\}/g, () => dict.allArchivesText);
  html = html.replace(/\{\{ARTICLES_PUBLISHED_TEXT\}\}/g, () => dict.articlesTaggedText);
  html = html.replace(/\{\{SEARCH_PLACEHOLDER\}\}/g, () => dict.searchPlaceholder);
  html = html.replace(/\{\{PERIOD_ALL_TIME\}\}/g, () => dict.periodAll);
  html = html.replace(/\{\{PERIOD_TODAY\}\}/g, () => dict.periodToday);
  html = html.replace(/\{\{PERIOD_WEEK\}\}/g, () => dict.periodWeek);
  html = html.replace(/\{\{PERIOD_MONTH\}\}/g, () => dict.periodMonth);
  html = html.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
  html = html.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
  html = html.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
}

// ── Format Relative Time ───────────────────────────────────
function formatRelativeTime(hours, lang = 'en') {
  if (lang === 'pt') {
    if (hours < 1) {
      const mins = Math.round(hours * 60);
      return mins <= 1 ? 'Agora mesmo' : `${mins} min atrás`;
    }
    if (hours < 24) {
      const h = Math.floor(hours);
      return `${h} ${h === 1 ? 'hora' : 'horas'} atrás`;
    }
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'dia' : 'dias'} atrás`;
  }

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

// ── Generate Archive Grid HTML ─────────────────────────────
function generateArchiveGrid(articles, lang = 'en') {
  return articles.map(a => {
    const dt = new Date(a.time);
    const dateFormatted = lang === 'pt'
      ? dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const ageHours = (Date.now() - dt.getTime()) / (1000 * 60 * 60);
    const relativo = formatRelativeTime(ageHours, lang);

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
    const regionAttr = a.region ? ` data-region="${esc(a.region.id)}"` : '';
    const readText = lang === 'pt' ? 'Ler' : 'Read';

    return `
<a href="/${lang}/news/${a.slug}" class="bbn-archive-row"${tagsAttr}${regionAttr} data-time="${a.time}" data-title="${esc(a.title).toLowerCase()}">
  <div class="bbn-meta">
    <span class="bbn-badge-impact ${badgeClass}">${badge}</span>
    <span class="bbn-date">${dateFormatted}</span>
    <span class="bbn-relative-time">${relativo}</span>
  </div>
  <div class="bbn-title">
    <h3>${esc(a.title)}</h3>
  </div>
  <div class="bbn-action">${readText} <span>&rarr;</span></div>
</a>`;
  }).join('\n');
}

// ── Generate Filters HTML ──────────────────────────────────
function generateFiltersHtml(articles, lang = 'en') {
  const dict = I18N[lang];
  const uniqueTags = new Set();
  articles.forEach(a => {
    if (a.tags) {
      a.tags.forEach(t => uniqueTags.add(t));
    }
  });
  const allTags = Array.from(uniqueTags).sort();

  let html = `      <span class="filter-label">${dict.filterLabel}</span>\n`;
  html += `      <button class="filter-btn active" data-tag-val="all">${dict.allNews}</button>\n`;
  allTags.forEach(tag => {
    const capitalized = tag.charAt(0).toUpperCase() + tag.slice(1);
    html += `      <button class="filter-btn" data-tag-val="${esc(tag)}">${esc(capitalized)}</button>\n`;
  });
  return html;
}

// ── Generate Homepage HTML ─────────────────────────────────
function generateHomePage(articles, template, lang = 'en', tagCloudHtml = '') {
  const dict = I18N[lang];
  const canonicalUrl = `${CONFIG.baseUrl}/${lang}/`;
  const enUrl = `${CONFIG.baseUrl}/en/`;
  const ptUrl = `${CONFIG.baseUrl}/pt/`;
  const hreflangTags = buildHreflangTags(enUrl, ptUrl);

  const articleIndex = articles
    .map(a => `          <li><a href="/${lang}/news/${a.slug}">${esc(a.title)}</a></li>`)
    .join('\n');

  const bbnConfig = JSON.stringify({
    url: CONFIG.supabaseUrl,
    key: CONFIG.supabaseKey
  });

  let html = template;
  html = html.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
  html = html.replace(/\{\{PAGE_TITLE\}\}/g, () => dict.homeTitle);
  html = html.replace(/\{\{PAGE_DESCRIPTION\}\}/g, () => dict.homeDesc);
  html = html.replace(/\{\{CANONICAL_URL\}\}/g, () => canonicalUrl);
  html = html.replace(/\{\{HREFLANG_TAGS\}\}/g, () => hreflangTags);
  html = html.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
  html = html.replace(/\{\{LOCALE\}\}/g, () => lang);
  html = html.replace(/\{\{ARTICLE_INDEX\}\}/g, () => articleIndex);
  html = html.replace(/\{\{TAG_CLOUD\}\}/g, () => '');
  html = html.replace(/\{\{FILTERS\}\}/g, () => '');

  // Switcher & Navigation
  html = html.replace(/\{\{LANG_EN_URL\}\}/g, () => '/en/');
  html = html.replace(/\{\{LANG_PT_URL\}\}/g, () => '/pt/');
  html = html.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => (lang === 'en' ? ' active' : ''));
  html = html.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => (lang === 'pt' ? ' active' : ''));
  html = html.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
  html = html.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
  html = html.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
  html = html.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
  html = html.replace(/\{\{SECTION_LATEST_NEWS\}\}/g, () => dict.sectionLatestNews);
  html = html.replace(/\{\{MORE_NEWS_TEXT\}\}/g, () => dict.moreNews);
  html = html.replace(/\{\{LATEST_ARTICLES_HEADING\}\}/g, () => dict.latestArticlesHeading);
  html = html.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
  html = html.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
  html = html.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);

  html = html.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

  return html;
}

// ── Generate Root Fallback Router (dist/index.html) ─────────
function generateRootIndexHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin Brasil News</title>
  <meta name="description" content="Bitcoin Brasil News — Real-time Bitcoin, crypto and financial news. / Notícias em tempo real sobre Bitcoin, mercado cripto e geopolítica.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${CONFIG.baseUrl}/en/">
  <link rel="alternate" hreflang="en" href="${CONFIG.baseUrl}/en/">
  <link rel="alternate" hreflang="pt-BR" href="${CONFIG.baseUrl}/pt/">
  <link rel="alternate" hreflang="x-default" href="${CONFIG.baseUrl}/en/">
  <meta http-equiv="refresh" content="0;url=/en/">
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <script>
    (function() {
      try {
        var lang = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || '';
        if (/^pt\\b/i.test(lang)) {
          window.location.replace('/pt/');
        } else {
          window.location.replace('/en/');
        }
      } catch(e) {
        window.location.href = '/en/';
      }
    })();
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0B0B0B;
      color: #FAFAF8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .router-card {
      text-align: center;
      max-width: 480px;
      width: 100%;
      background: #111;
      border: 1.5px solid #F7931A;
      padding: 2.5rem 2rem;
      border-radius: 4px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .brand-logo {
      font-size: 3.5rem;
      font-weight: 900;
      color: #F7931A;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
      line-height: 1;
    }
    .brand-subtitle {
      font-family: monospace;
      font-size: 0.75rem;
      color: #888;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 1.75rem;
    }
    .prompt {
      color: #ccc;
      font-size: 0.92rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn-lang {
      display: inline-block;
      padding: 11px 22px;
      background: #F7931A;
      color: #0B0B0B;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.9rem;
      letter-spacing: 0.05em;
      border-radius: 2px;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .btn-lang:hover {
      background: #ffa83e;
      transform: translateY(-1px);
    }
    .btn-lang.secondary {
      background: transparent;
      color: #F7931A;
      border: 1px solid #F7931A;
    }
    .btn-lang.secondary:hover {
      background: rgba(247, 147, 26, 0.12);
    }
  </style>
</head>
<body>
  <div class="router-card">
    <div class="brand-logo">BBN</div>
    <div class="brand-subtitle">Bitcoin Brasil News</div>
    <p class="prompt">Select your preferred edition / Selecione sua edição:</p>
    <div class="btn-group">
      <a href="/en/" class="btn-lang">English (EN)</a>
      <a href="/pt/" class="btn-lang secondary">Português (PT)</a>
    </div>
  </div>
</body>
</html>`;
}

// ── XML Helpers ────────────────────────────────────────────
function escXml(str) {
  return String(str ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc822(date) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

function detectTickers(title, tags) {
  const text = `${title} ${(tags || []).join(' ')}`.toLowerCase();
  const tickers = [];

  if (/\bbitcoin\b|\bbtc\b/.test(text)) tickers.push('CRYPTO:BTC');
  if (/\bethereum\b|\beth\b/.test(text)) tickers.push('CRYPTO:ETH');
  if (/\bsolana\b|\bsol\b/.test(text)) tickers.push('CRYPTO:SOL');
  if (/\bripple\b|\bxrp\b/.test(text)) tickers.push('CRYPTO:XRP');
  if (/\bcardano\b|\bada\b/.test(text)) tickers.push('CRYPTO:ADA');
  if (/\bdogecoin\b|\bdoge\b/.test(text)) tickers.push('CRYPTO:DOGE');
  if (/\bbnb\b|\bbinance coin\b/.test(text)) tickers.push('CRYPTO:BNB');

  if (/\bmicrostrategy\b|\bmstr\b/.test(text)) tickers.push('NASDAQ:MSTR');
  if (/\bcoinbase\b|\bcoin\b/.test(text)) tickers.push('NASDAQ:COIN');
  if (/\bapple\b|\baapl\b/.test(text)) tickers.push('NASDAQ:AAPL');
  if (/\btesla\b|\btsla\b/.test(text)) tickers.push('NASDAQ:TSLA');
  if (/\bspot bitcoin etf\b|\bbitcoin etf\b|\bibit\b/.test(text)) tickers.push('NASDAQ:IBIT');
  if (/\bs&p 500\b|\bsp500\b/.test(text)) tickers.push('INDEXSP:.INX');

  if (/\bgold\b/.test(text)) tickers.push('COMMODITY:XAUUSD');
  if (/\bsilver\b/.test(text)) tickers.push('COMMODITY:XAGUSD');
  if (/\boil\b|\bopec\b|\bpetroleum\b/.test(text)) tickers.push('COMMODITY:USOIL');

  return tickers.join(',');
}

// ── Generate Sitemap.xml (Multilingual) ────────────────────
function generateSitemap(enArticles, ptArticles, baseUrl, enTagsMap = new Map(), ptTagsMap = new Map()) {
  const now = new Date().toISOString().split('T')[0];
  const defaultImage = `${baseUrl}/assets/og-default.png`;

  // Static pages with bidirectional xhtml:link hreflangs
  const staticGroups = [
    {
      en: `${baseUrl}/en/`,
      pt: `${baseUrl}/pt/`,
      changefreq: 'always',
      priority: '1.0'
    },
    {
      en: `${baseUrl}/en/archive`,
      pt: `${baseUrl}/pt/archive`,
      changefreq: 'daily',
      priority: '0.8'
    },
    {
      en: `${baseUrl}/en/privacy`,
      pt: `${baseUrl}/pt/privacy`,
      changefreq: 'yearly',
      priority: '0.3'
    }
  ];

  let staticEntries = '';
  staticGroups.forEach(group => {
    staticEntries += `
  <url>
    <loc>${group.en}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${group.changefreq}</changefreq>
    <priority>${group.priority}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${group.en}" />
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${group.pt}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${group.en}" />
  </url>
  <url>
    <loc>${group.pt}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${group.changefreq}</changefreq>
    <priority>${group.priority}</priority>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${group.pt}" />
    <xhtml:link rel="alternate" hreflang="en" href="${group.en}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${group.en}" />
  </url>`;
  });

  // News article entries
  const buildNewsEntries = (articles, lang) => {
    const newsLang = lang === 'en' ? 'en' : 'pt-br';
    return articles.map(post => {
      const articleUrl = `${baseUrl}/${lang}/news/${post.slug}`;
      const pubDate = post.time ? new Date(post.time).toISOString() : new Date().toISOString();
      const lastmod = pubDate.split('T')[0];
      const title = escXml(post.title);
      const keywords = escXml((post.tags || []).slice(0, 10).join(', '));
      const tickers = detectTickers(post.title, post.tags);
      const tickerBlock = tickers ? `\n      <news:stock_tickers>${escXml(tickers)}</news:stock_tickers>` : '';

      let alternateLinkBlock = '';
      if (post.translation) {
        const transLang = lang === 'en' ? 'pt-BR' : 'en';
        const transTarget = lang === 'en' ? 'pt' : 'en';
        const transUrl = `${baseUrl}/${transTarget}/news/${post.translation.slug}`;
        alternateLinkBlock = `\n    <xhtml:link rel="alternate" hreflang="${transLang}" href="${transUrl}" />`;
      }

      return `
  <url>
    <loc>${articleUrl}</loc>
    <lastmod>${lastmod}</lastmod>${alternateLinkBlock}
    <image:image>
      <image:loc>${defaultImage}</image:loc>
      <image:title>${title}</image:title>
    </image:image>
    <news:news>
      <news:publication>
        <news:name>Bitcoin Brasil News</news:name>
        <news:language>${newsLang}</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
      <news:keywords>${keywords}</news:keywords>${tickerBlock}
    </news:news>
  </url>`;
    }).join('');
  };

  const enNewsEntries = buildNewsEntries(enArticles, 'en');
  const ptNewsEntries = buildNewsEntries(ptArticles, 'pt');

  // Tag archive entries
  const buildTagEntries = (tagMap, lang, otherTagMap) => {
    const isEn = lang === 'en';
    const thisHreflang = isEn ? 'en' : 'pt-BR';
    const otherHreflang = isEn ? 'pt-BR' : 'en';
    const otherLang = isEn ? 'pt' : 'en';

    let tagXml = '';
    for (const [tagSlug, tagEntry] of tagMap) {
      const tagUrl = `${baseUrl}/${lang}/tag/${tagSlug}`;
      let alternateLinkBlock = '';
      if (otherTagMap && otherTagMap.has(tagSlug)) {
        const otherUrl = `${baseUrl}/${otherLang}/tag/${tagSlug}`;
        alternateLinkBlock += `\n    <xhtml:link rel="alternate" hreflang="${otherHreflang}" href="${otherUrl}" />`;
      }
      alternateLinkBlock += `\n    <xhtml:link rel="alternate" hreflang="${thisHreflang}" href="${tagUrl}" />`;
      alternateLinkBlock += `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/en/tag/${tagSlug}" />`;

      tagXml += `
  <url>
    <loc>${tagUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>${alternateLinkBlock}
  </url>`;
    }
    return tagXml;
  };

  const enTagEntries = buildTagEntries(enTagsMap, 'en', ptTagsMap);
  const ptTagEntries = buildTagEntries(ptTagsMap, 'pt', enTagsMap);

  // Regional archive entries
  let regionXml = '';
  for (const reg of Object.values(REGIONAL_TAXONOMY)) {
    const enRegUrl = `${baseUrl}/en/region/${reg.slugEn}`;
    const ptRegUrl = `${baseUrl}/pt/regiao/${reg.slugPt}`;

    regionXml += `
  <url>
    <loc>${enRegUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${enRegUrl}" />
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${ptRegUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${enRegUrl}" />
  </url>
  <url>
    <loc>${ptRegUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${ptRegUrl}" />
    <xhtml:link rel="alternate" hreflang="en" href="${enRegUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${enRegUrl}" />
  </url>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">${staticEntries}${regionXml}${enTagEntries}${ptTagEntries}${enNewsEntries}${ptNewsEntries}
</urlset>`;
}

// ── Generate Localized RSS 2.0 Feed ────────────────────────
function generateRssFeed(articles, baseUrl, lang, feedFileName) {
  const buildDate = toRfc822(new Date());
  const defaultImage = `${baseUrl}/assets/og-default.png`;
  const DEFAULT_IMAGE_BYTES = 0;
  const channelTitle = lang === 'pt' ? 'Bitcoin Brasil News (Português)' : 'Bitcoin Brasil News';
  const channelDesc = lang === 'pt'
    ? 'Notícias em tempo real sobre Bitcoin, criptomoedas e finanças globais.'
    : 'Real-time Bitcoin, crypto, and global financial news curated for investors worldwide.';
  const rssLang = lang === 'pt' ? 'pt-br' : 'en';

  const items = articles.map(post => {
    const articleUrl = `${baseUrl}/${lang}/news/${post.slug}`;
    const pubDate = toRfc822(new Date(post.time || Date.now()));
    const rawDesc = post.summary || post.hook || post.body?.slice(0, 280) || post.title;
    const description = escXml(rawDesc.replace(/\*\*/g, '').replace(/\*/g, '').trim());
    const enclosure = `<enclosure url="${defaultImage}" length="${DEFAULT_IMAGE_BYTES}" type="image/jpeg" />`;
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
    <title>${channelTitle}</title>
    <link>${baseUrl}/${lang}/</link>
    <description>${channelDesc}</description>
    <language>${rssLang}</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <ttl>15</ttl>
    <image>
      <url>${defaultImage}</url>
      <title>${channelTitle}</title>
      <link>${baseUrl}/${lang}/</link>
    </image>
    <atom:link href="${baseUrl}/${feedFileName}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}

// ── Ensure Directory Exists ────────────────────────────────
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ── Main Build Pipeline ────────────────────────────────────
async function build() {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  BBN Static Site Generator (i18n SSG)   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 1. Load existing database if available
  const DB_FILE = join(__dirname, 'articles-db.json');
  let dbArticles = [];
  if (existsSync(DB_FILE)) {
    try {
      dbArticles = JSON.parse(readFileSync(DB_FILE, 'utf-8')).filter(isValidArticleRecord);
      console.log(`📦 Loaded ${dbArticles.length} articles from local database`);
    } catch (e) {
      console.warn(`⚠️ Failed to load local database: ${e.message}`);
    }
  }

  // 2. Fetch fresh articles from Supabase (Two distinct pipelines: articles and artigos)
  console.log('⏳ Connecting to Supabase (English: "articles", Portuguese: "artigos")...');
  let enFetched = [];
  let ptFetched = [];
  try {
    const results = await Promise.allSettled([
      fetchSupabaseTable('articles'),
      fetchSupabaseTable('artigos')
    ]);

    if (results[0].status === 'fulfilled') {
      enFetched = results[0].value.map(row => mapSupabaseRow(row, 'en')).filter(isValidArticleRecord);
      console.log(`✅ [English Pipeline] Fetched ${enFetched.length} articles from "articles"`);
    } else {
      console.warn(`⚠️ [English Pipeline] Warning: ${results[0].reason?.message}`);
    }

    if (results[1].status === 'fulfilled') {
      ptFetched = results[1].value.map(row => mapSupabaseRow(row, 'pt')).filter(isValidArticleRecord);
      console.log(`✅ [Portuguese Pipeline] Fetched ${ptFetched.length} articles from "artigos"`);
    } else {
      console.warn(`⚠️ [Portuguese Pipeline] Warning: ${results[1].reason?.message}`);
    }
  } catch (err) {
    console.error(`❌ Failed to fetch articles from Supabase: ${err.message}`);
    process.exit(1);
  }

  // Merge articles: prioritize fresh fetches but preserve local database records
  const articleMap = new Map();
  dbArticles.forEach(item => {
    if (item && item.id && isValidArticleRecord(item)) articleMap.set(`${item.lang || 'en'}-${item.id}`, item);
  });
  enFetched.forEach(item => {
    if (item && item.id && isValidArticleRecord(item)) articleMap.set(`en-${item.id}`, item);
  });
  ptFetched.forEach(item => {
    if (item && item.id && isValidArticleRecord(item)) articleMap.set(`pt-${item.id}`, item);
  });

  const mergedArticles = Array.from(articleMap.values()).filter(isValidArticleRecord);
  mergedArticles.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Save updated database locally
  try {
    writeFileSync(DB_FILE, JSON.stringify(mergedArticles, null, 2), 'utf-8');
    console.log(`💾 Saved ${mergedArticles.length} articles back to local database`);
  } catch (e) {
    console.error(`❌ Failed to save local database: ${e.message}`);
  }

  // 3. Process localized articles into en and pt sets
  const { enPosts, ptPosts, slugMapEn, slugMapPt } = parseLocalizedArticles(mergedArticles);
  console.log(`📝 Processed: ${enPosts.length} English articles, ${ptPosts.length} Portuguese articles`);

  // 4. Filter homepage articles (48h retention)
  const enHomepage = enPosts.filter(post => {
    const ageHours = (Date.now() - new Date(post.time).getTime()) / (1000 * 60 * 60);
    return ageHours < CONFIG.homepageRetentionHours;
  });
  const ptHomepage = ptPosts.filter(post => {
    const ageHours = (Date.now() - new Date(post.time).getTime()) / (1000 * 60 * 60);
    return ageHours < CONFIG.homepageRetentionHours;
  });

  console.log(`🏠 Homepage window (48h): ${enHomepage.length} EN articles, ${ptHomepage.length} PT articles`);

  // 5. Read HTML templates
  const homeTemplate = readFileSync(join(__dirname, 'template-home.html'), 'utf-8');
  const articleTemplate = readFileSync(join(__dirname, 'template-article.html'), 'utf-8');
  const archiveTemplate = readFileSync(join(__dirname, 'template-archive.html'), 'utf-8');
  const tagTemplate = readFileSync(join(__dirname, 'template-tag.html'), 'utf-8');
  const regionTemplate = readFileSync(join(__dirname, 'template-region.html'), 'utf-8');
  const privacyTemplate = readFileSync(join(__dirname, 'template-privacy.html'), 'utf-8');

  // 6. Prepare dist directory structure (wipe legacy builds first)
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(DIST_DIR);
  ensureDir(join(DIST_DIR, 'assets'));
  ensureDir(join(DIST_DIR, 'assets', 'css'));
  ensureDir(join(DIST_DIR, 'assets', 'js'));
  ensureDir(join(DIST_DIR, 'en'));
  ensureDir(join(DIST_DIR, 'en', 'news'));
  ensureDir(join(DIST_DIR, 'en', 'tag'));
  ensureDir(join(DIST_DIR, 'pt'));
  ensureDir(join(DIST_DIR, 'pt', 'news'));
  ensureDir(join(DIST_DIR, 'pt', 'tag'));

  // 7. Copy static assets
  const staticFiles = ['style.css', 'app.js'];
  for (const file of staticFiles) {
    const src = join(__dirname, file);
    if (existsSync(src)) {
      cpSync(src, join(DIST_DIR, file), { force: true });
      if (file.endsWith('.css')) cpSync(src, join(DIST_DIR, 'assets', 'css', file), { force: true });
      if (file.endsWith('.js')) cpSync(src, join(DIST_DIR, 'assets', 'js', file), { force: true });
      console.log(`📦 Copied ${file}`);
    }
  }

  // Assets folder
  const assetsDir = join(__dirname, 'assets');
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, join(DIST_DIR, 'assets'), { recursive: true, force: true });
    console.log('📦 Copied assets/');
  }

  // Favicon & Robots
  const favSrc = join(__dirname, 'public', 'favicon.ico');
  if (existsSync(favSrc)) {
    cpSync(favSrc, join(DIST_DIR, 'favicon.ico'), { force: true });
    console.log('📦 Copied favicon.ico');
  }
  const robotsSrc = join(__dirname, 'public', 'robots.txt');
  if (existsSync(robotsSrc)) {
    cpSync(robotsSrc, join(DIST_DIR, 'robots.txt'), { force: true });
    console.log('📦 Copied robots.txt');
  }
  const manifestSrc = join(__dirname, 'manifest.json');
  if (existsSync(manifestSrc)) {
    cpSync(manifestSrc, join(DIST_DIR, 'manifest.json'), { force: true });
    console.log('📦 Copied manifest.json');
  }

  // 8. Generate Root Fallback Router (dist/index.html)
  writeFileSync(join(DIST_DIR, 'index.html'), generateRootIndexHtml(), 'utf-8');
  console.log('🌐 Generated dist/index.html (Intelligent Client-Side Language Router)');

  // Build tag maps per locale for dynamic SSG routes & tag clouds
  const buildTagMap = (articles) => {
    const map = new Map();
    articles.forEach(post => {
      const pTags = post.parsedTags || parseTags(post.tags);
      pTags.forEach(t => {
        if (!map.has(t.slug)) {
          map.set(t.slug, { label: t.label, slug: t.slug, count: 0, articles: [] });
        }
        const entry = map.get(t.slug);
        entry.count++;
        entry.articles.push(post);
      });
    });
    return map;
  };

  const enTagsMap = buildTagMap(enPosts);
  const ptTagsMap = buildTagMap(ptPosts);

  // 9. Generate Localized Pages for /en/ and /pt/
  const locales = [
    { lang: 'en', articles: enPosts, homepage: enHomepage, privacyBody: PRIVACY_BODY_EN },
    { lang: 'pt', articles: ptPosts, homepage: ptHomepage, privacyBody: PRIVACY_BODY_PT }
  ];

  const bbnConfigJson = JSON.stringify({ url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey });

  for (const loc of locales) {
    const { lang, articles, homepage, privacyBody } = loc;
    const dict = I18N[lang];
    const locDir = join(DIST_DIR, lang);
    const otherLang = lang === 'en' ? 'pt' : 'en';

    const currentTagMap = lang === 'en' ? enTagsMap : ptTagsMap;
    const otherTagMap = lang === 'en' ? ptTagsMap : enTagsMap;
    const allTags = Array.from(currentTagMap.values());
    const topTags = allTags.slice().sort((a, b) => b.count - a.count);
    const groupedTags = groupTagsByRegion(allTags);

    const regionalNavHtml = formatRegionalNavHtml({
      groupedTags,
      topTags,
      activeRegionId: 'all',
      lang
    });

    // A. Homepage (/en/index.html, /pt/index.html) — Pure live feed without tag links
    let homeHtml = generateHomePage(homepage.length > 0 ? homepage : articles.slice(0, 60), homeTemplate, lang, '');
    writeFileSync(join(locDir, 'index.html'), homeHtml, 'utf-8');

    // B. Archive Pages (/en/archive.html, /en/archive/index.html)
    let archiveHtml = archiveTemplate;
    const enArchiveUrl = `${CONFIG.baseUrl}/en/archive`;
    const ptArchiveUrl = `${CONFIG.baseUrl}/pt/archive`;
    const archiveCanonical = `${CONFIG.baseUrl}/${lang}/archive`;
    const archiveHreflangs = buildHreflangTags(enArchiveUrl, ptArchiveUrl);

    archiveHtml = archiveHtml.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
    archiveHtml = archiveHtml.replace(/\{\{PAGE_TITLE\}\}/g, () => dict.archiveTitle);
    archiveHtml = archiveHtml.replace(/\{\{PAGE_DESCRIPTION\}\}/g, () => dict.archiveDesc);
    archiveHtml = archiveHtml.replace(/\{\{CANONICAL_URL\}\}/g, () => archiveCanonical);
    archiveHtml = archiveHtml.replace(/\{\{HREFLANG_TAGS\}\}/g, () => archiveHreflangs);
    archiveHtml = archiveHtml.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
    archiveHtml = archiveHtml.replace(/\{\{BBN_CONFIG\}\}/g, () => bbnConfigJson);

    // Switcher & Navigation
    archiveHtml = archiveHtml.replace(/\{\{LANG_EN_URL\}\}/g, () => '/en/archive');
    archiveHtml = archiveHtml.replace(/\{\{LANG_PT_URL\}\}/g, () => '/pt/archive');
    archiveHtml = archiveHtml.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => (lang === 'en' ? ' active' : ''));
    archiveHtml = archiveHtml.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => (lang === 'pt' ? ' active' : ''));
    archiveHtml = archiveHtml.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
    archiveHtml = archiveHtml.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
    archiveHtml = archiveHtml.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
    archiveHtml = archiveHtml.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
    archiveHtml = archiveHtml.replace(/\{\{ARCHIVE_HEADING\}\}/g, () => dict.archiveHeading);
    archiveHtml = archiveHtml.replace(/\{\{ARTICLES_PUBLISHED_TEXT\}\}/g, () => dict.articlesPublished);
    archiveHtml = archiveHtml.replace(/\{\{SEARCH_PLACEHOLDER\}\}/g, () => dict.searchPlaceholder);
    archiveHtml = archiveHtml.replace(/\{\{PERIOD_ALL_TIME\}\}/g, () => dict.periodAll);
    archiveHtml = archiveHtml.replace(/\{\{PERIOD_TODAY\}\}/g, () => dict.periodToday);
    archiveHtml = archiveHtml.replace(/\{\{PERIOD_WEEK\}\}/g, () => dict.periodWeek);
    archiveHtml = archiveHtml.replace(/\{\{PERIOD_MONTH\}\}/g, () => dict.periodMonth);
    archiveHtml = archiveHtml.replace(/\{\{BACK_TO_HOME_TEXT\}\}/g, () => dict.backToHome);
    archiveHtml = archiveHtml.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
    archiveHtml = archiveHtml.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
    archiveHtml = archiveHtml.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);

    archiveHtml = archiveHtml.replace(/\{\{TAG_CLOUD\}\}/g, () => regionalNavHtml);
    archiveHtml = archiveHtml.replace(/\{\{FILTERS\}\}/g, () => regionalNavHtml);
    const archiveGridHtml = generateArchiveGrid(articles, lang);
    archiveHtml = archiveHtml.replace(/\{\{ARCHIVE_GRID\}\}/g, () => archiveGridHtml);
    archiveHtml = archiveHtml.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

    writeFileSync(join(locDir, 'archive.html'), archiveHtml, 'utf-8');
    const archiveDir = join(locDir, 'archive');
    ensureDir(archiveDir);
    writeFileSync(join(archiveDir, 'index.html'), archiveHtml, 'utf-8');

    // C. Tag Archive Pages (/lang/tag/[slug]/index.html)
    let tagsBuilt = 0;
    for (const [tagSlug, tagEntry] of currentTagMap) {
      const tagPageHtml = generateTagArchivePage(tagEntry, tagTemplate, lang, groupedTags, topTags, otherTagMap);
      const tagDir = join(locDir, 'tag', tagSlug);
      ensureDir(tagDir);
      writeFileSync(join(tagDir, 'index.html'), tagPageHtml, 'utf-8');
      tagsBuilt++;
    }
    console.log(`🏷️  Generated ${tagsBuilt} tag archive pages for /${lang}/tag/`);

    // D. Regional Archive Pages (/pt/regiao/[slug]/index.html or /en/region/[slug]/index.html)
    const regionPrefix = lang === 'pt' ? 'regiao' : 'region';
    const regionBaseDir = join(locDir, regionPrefix);
    ensureDir(regionBaseDir);

    let regionsBuilt = 0;
    for (const region of Object.values(REGIONAL_TAXONOMY)) {
      const regSlug = lang === 'pt' ? region.slugPt : region.slugEn;
      const regArticles = articles.filter(a => a.region && a.region.id === region.id);

      const regionPageHtml = generateRegionArchivePage(
        region,
        regionTemplate,
        lang,
        groupedTags,
        topTags,
        regArticles,
        otherTagMap
      );

      const regDir = join(regionBaseDir, regSlug);
      ensureDir(regDir);
      writeFileSync(join(regDir, 'index.html'), regionPageHtml, 'utf-8');
      regionsBuilt++;
    }
    console.log(`🌍 Generated ${regionsBuilt} regional archive pages for /${lang}/${regionPrefix}/`);
    console.log(`🏷️  Generated ${tagsBuilt} tag archive pages for /${lang}/tag/`);

    // D. Privacy Policy Pages (/en/privacy.html, /en/privacy/index.html)
    let privHtml = privacyTemplate;
    const enPrivUrl = `${CONFIG.baseUrl}/en/privacy`;
    const ptPrivUrl = `${CONFIG.baseUrl}/pt/privacy`;
    const privCanonical = `${CONFIG.baseUrl}/${lang}/privacy`;
    const privHreflangs = buildHreflangTags(enPrivUrl, ptPrivUrl);

    privHtml = privHtml.replace(/\{\{HTML_LANG\}\}/g, () => dict.htmlLang);
    privHtml = privHtml.replace(/\{\{PAGE_TITLE\}\}/g, () => dict.privacyTitle);
    privHtml = privHtml.replace(/\{\{PAGE_DESCRIPTION\}\}/g, () => dict.privacyDesc);
    privHtml = privHtml.replace(/\{\{CANONICAL_URL\}\}/g, () => privCanonical);
    privHtml = privHtml.replace(/\{\{HREFLANG_TAGS\}\}/g, () => privHreflangs);
    privHtml = privHtml.replace(/\{\{BASE_URL\}\}/g, () => CONFIG.baseUrl);
    privHtml = privHtml.replace(/\{\{PRIVACY_TITLE\}\}/g, () => dict.privacyTitle);
    privHtml = privHtml.replace(/\{\{PRIVACY_LAST_UPDATED\}\}/g, () => dict.privacyLastUpdated);
    privHtml = privHtml.replace(/\{\{PRIVACY_CONTENT\}\}/g, () => privacyBody);

    privHtml = privHtml.replace(/\{\{LANG_EN_URL\}\}/g, () => '/en/privacy');
    privHtml = privHtml.replace(/\{\{LANG_PT_URL\}\}/g, () => '/pt/privacy');
    privHtml = privHtml.replace(/\{\{LANG_EN_ACTIVE\}\}/g, () => (lang === 'en' ? ' active' : ''));
    privHtml = privHtml.replace(/\{\{LANG_PT_ACTIVE\}\}/g, () => (lang === 'pt' ? ' active' : ''));
    privHtml = privHtml.replace(/\{\{NAV_HOME_URL\}\}/g, () => `/${lang}/`);
    privHtml = privHtml.replace(/\{\{NAV_HOME_TEXT\}\}/g, () => dict.navHome);
    privHtml = privHtml.replace(/\{\{NAV_ARCHIVE_URL\}\}/g, () => `/${lang}/archive`);
    privHtml = privHtml.replace(/\{\{NAV_ARCHIVE_TEXT\}\}/g, () => dict.navArchive);
    privHtml = privHtml.replace(/\{\{BACK_TO_HOME_TEXT\}\}/g, () => dict.backToHome);
    privHtml = privHtml.replace(/\{\{FOOTER_UPDATED\}\}/g, () => dict.footerUpdated);
    privHtml = privHtml.replace(/\{\{FOOTER_PRIVACY_URL\}\}/g, () => `/${lang}/privacy`);
    privHtml = privHtml.replace(/\{\{FOOTER_PRIVACY_TEXT\}\}/g, () => dict.footerPrivacy);
    privHtml = privHtml.replace(/\?v=[0-9.]+/g, () => '?v=' + VERSION);

    writeFileSync(join(locDir, 'privacy.html'), privHtml, 'utf-8');
    const privDir = join(locDir, 'privacy');
    ensureDir(privDir);
    writeFileSync(join(privDir, 'index.html'), privHtml, 'utf-8');

    // E. Article Pages (/lang/news/[slug].html & /lang/news/[slug]/index.html)
    let articlesBuilt = 0;
    for (const post of articles) {
      const artHtml = generateArticlePage(post, articleTemplate, lang);

      // Clean directory-based URL structure for native server resolution
      const artCleanDir = join(locDir, 'news', post.slug);
      ensureDir(artCleanDir);
      writeFileSync(join(artCleanDir, 'index.html'), artHtml, 'utf-8');

      articlesBuilt++;
    }

    console.log(`📑 Generated ${articlesBuilt} articles for /${lang}/news/`);
  }

  // 10. Generate Multilingual Sitemap.xml
  const sitemapXml = generateSitemap(enPosts, ptPosts, CONFIG.baseUrl, enTagsMap, ptTagsMap);
  writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`🗺️  Generated sitemap.xml (${enPosts.length + ptPosts.length + enTagsMap.size + ptTagsMap.size + 6} URLs — dual /en/ & /pt/ namespaces)`);

  // 11. Generate Localized RSS 2.0 Feeds
  const enRss = generateRssFeed(enPosts, CONFIG.baseUrl, 'en', 'feed.xml');
  writeFileSync(join(DIST_DIR, 'feed.xml'), enRss, 'utf-8');
  console.log(`📡 Generated feed.xml (English RSS — ${enPosts.length} items)`);

  const ptRss = generateRssFeed(ptPosts, CONFIG.baseUrl, 'pt', 'feed-pt.xml');
  writeFileSync(join(DIST_DIR, 'feed-pt.xml'), ptRss, 'utf-8');
  console.log(`📡 Generated feed-pt.xml (Portuguese RSS — ${ptPosts.length} items)`);

  // 12. Export JSON Database for Fallback
  writeFileSync(join(DIST_DIR, 'articles.json'), JSON.stringify(mergedArticles), 'utf-8');
  console.log(`📂 Exported articles.json database`);

  // 13. Generate Netlify _redirects
  const redirectsContent = `# Netlify / Static Host Redirects — Auto-generated by build.mjs
# Language detection at Root
/               /pt/            302  Language=pt
/               /en/            302

# Localized Clean URLs
/en/privacy     /en/privacy/index.html     200
/pt/privacy     /pt/privacy/index.html     200
/en/archive     /en/archive/index.html     200
/pt/archive     /pt/archive/index.html     200

# Legacy URL fallbacks for backwards compatibility (301 before 200 catch-alls)
/privacy        /en/privacy/               301
/archive        /en/archive/               301
/news/*         /en/news/:splat            301
/noticia/*      /pt/news/:splat            301

# SPA Routing Fallback (200 Rewrite)
# Serves language SPA shell if pre-rendered static index.html does not exist on disk
/pt/regiao/*    /pt/index.html  200
/pt/tag/*       /pt/index.html  200
/pt/news/*      /pt/index.html  200
/pt/*           /pt/index.html  200
/en/region/*    /en/index.html  200
/en/tag/*       /en/index.html  200
/en/news/*      /en/index.html  200
/en/*           /en/index.html  200
/*              /index.html     200
`;
  writeFileSync(join(DIST_DIR, '_redirects'), redirectsContent, 'utf-8');
  console.log('🔀 Generated _redirects (Netlify language detection & routing rules)');

  // 14. Generate Nginx Configuration Snippet (Reverse-Proxy Architecture)
  const nginxSnippet = `# ============================================================
# BBN Nginx Multi-Language Reverse-Proxy Configuration
# Place inside or include in your server {} block
# ============================================================

# 1. Map Accept-Language header to appropriate directory
map $http_accept_language $preferred_lang {
    default en;
    ~*pt    pt;
}

# server {
#     listen 80;
#     listen 443 ssl http2;
#     server_name www.bbnews.cc bbnews.cc;
#     root /var/www/bbn/dist;
#     index index.html;
#
#     # Root redirection based on browser headers
#     location = / {
#         return 302 /$preferred_lang/;
#     }
#
#     # Static subdirectories for /en/ and /pt/ with clean URL index & SPA fallback
#     location /en/ {
#         try_files $uri $uri/ $uri/index.html $uri.html /en/index.html;
#     }
#
#     location /pt/ {
#         try_files $uri $uri/ $uri/index.html $uri.html /pt/index.html;
#     }
#
#     # Legacy redirect rules
#     location ~ ^/news/(.*)$ {
#         return 301 /en/news/$1;
#     }
#     location = /archive {
#         return 301 /en/archive;
#     }
#     location = /privacy {
#         return 301 /en/privacy;
#     }
#
#     # Cache static assets (CSS, JS, images, fonts)
#     location ~* \\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
#         expires 30d;
#         add_header Cache-Control "public, max-age=2592000, immutable";
#     }
#
#     # XML feeds and sitemaps (no aggressive caching for fresh discovery)
#     location ~* \\.(xml|txt)$ {
#         expires 1h;
#         add_header Cache-Control "public, max-age=3600";
#     }
# }
`;
  writeFileSync(join(DIST_DIR, 'nginx.conf.example'), nginxSnippet, 'utf-8');
  console.log('⚙️  Generated nginx.conf.example (Nginx reverse-proxy language mapping)');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`✨ Multi-language build completed in ${elapsed}s`);
  console.log(`📁 Output: ${DIST_DIR}`);
  console.log(`🇬🇧 English articles: ${enPosts.length} generated under /en/news/`);
  console.log(`🇧🇷 Portuguese articles: ${ptPosts.length} generated under /pt/news/`);
  console.log('');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
