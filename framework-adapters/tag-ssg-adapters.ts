/**
 * BBN Tag Filtering and Navigation SSG Adapters
 * 
 * Production-ready reference implementations for modern web frameworks:
 * 1. Tag Utility (TypeScript)
 * 2. Next.js App Router (generateStaticParams)
 * 3. Next.js Pages Router (getStaticPaths + getStaticProps)
 * 4. Astro (getStaticPaths)
 */

// ============================================================================
// 1. Tag Parsing & Normalization Utility (TypeScript)
// ============================================================================

export interface Tag {
  label: string;
  slug: string;
}

export interface Article {
  id: string | number;
  slug: string;
  title: string;
  tag?: string | null;
  tags?: string[] | null;
  created_at?: string;
  lang?: 'en' | 'pt';
}

/**
 * Converts any raw tag text or label into a clean, URL-friendly slug.
 * - Removes accents and diacritics via Unicode NFD
 * - Inserts hyphens at camelCase boundaries
 * - Converts to lowercase and removes invalid characters
 * - Trims leading/trailing hyphens
 */
export function toTagSlug(tag: string): string {
  if (!tag || typeof tag !== 'string') return '';
  let str = tag.trim().replace(/^#+/, '');
  if (!str) return '';
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Parses raw tag inputs (strings with hashtags, comma-separated lists, or arrays)
 * into a deduplicated array of { label, slug } objects.
 */
export function parseTags(input: unknown): Tag[] {
  if (!input) return [];
  const rawTokens: string[] = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') rawTokens.push(item);
      else if (item && typeof item === 'object') {
        const anyItem = item as Record<string, unknown>;
        if (anyItem.label || anyItem.name || anyItem.tag) {
          rawTokens.push(String(anyItem.label || anyItem.name || anyItem.tag));
        }
      }
    }
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

  const seenSlugs = new Set<string>();
  const result: Tag[] = [];

  for (const token of rawTokens) {
    const label = token.trim().replace(/^#+/, '');
    const slug = toTagSlug(label);
    if (!slug || !label) continue;
    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      result.push({ label, slug });
    }
  }

  return result;
}

// ============================================================================
// 2. Next.js App Router Example: app/[lang]/tag/[tag]/page.tsx
// ============================================================================

/*
// File: app/[lang]/tag/[tag]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';

// Mock Supabase fetcher
async function fetchArticlesForLocale(lang: 'en' | 'pt'): Promise<Article[]> {
  const table = lang === 'pt' ? 'artigos' : 'articles';
  // const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  return [];
}

export async function generateStaticParams() {
  const locales: ('en' | 'pt')[] = ['en', 'pt'];
  const paths: { lang: string; tag: string }[] = [];

  for (const lang of locales) {
    const articles = await fetchArticlesForLocale(lang);
    const tagSet = new Set<string>();
    for (const article of articles) {
      const tags = parseTags(article.tag || article.tags);
      for (const t of tags) {
        tagSet.add(t.slug);
      }
    }
    for (const tagSlug of tagSet) {
      paths.push({ lang, tag: tagSlug });
    }
  }

  return paths;
}

export async function generateMetadata({ params }: { params: { lang: string; tag: string } }): Promise<Metadata> {
  const isPt = params.lang === 'pt';
  const tagLabel = params.tag.toUpperCase();

  return {
    title: `#${tagLabel} – ${isPt ? 'Arquivo' : 'Archive'} | BBN`,
    description: isPt
      ? `Notícias e análises em tempo real filtradas por #${tagLabel}.`
      : `Real-time news and analysis filtered by #${tagLabel}.`,
    alternates: {
      canonical: `https://www.bbnews.cc/${params.lang}/tag/${params.tag}`,
      languages: {
        'en': `https://www.bbnews.cc/en/tag/${params.tag}`,
        'pt': `https://www.bbnews.cc/pt/tag/${params.tag}`,
        'x-default': `https://www.bbnews.cc/en/tag/${params.tag}`,
      }
    }
  };
}

export default async function TagArchivePage({ params }: { params: { lang: string; tag: string } }) {
  const lang = params.lang as 'en' | 'pt';
  const articles = await fetchArticlesForLocale(lang);
  
  const filtered = articles.filter(a => {
    const tags = parseTags(a.tag || a.tags);
    return tags.some(t => t.slug === params.tag);
  });

  if (filtered.length === 0) {
    notFound();
  }

  const primaryTag = parseTags(filtered[0]?.tag || filtered[0]?.tags).find(t => t.slug === params.tag);
  const tagLabel = primaryTag ? primaryTag.label : params.tag;

  return (
    <main className="tag-archive-container">
      <header className="tag-archive-header">
        <h1>#{tagLabel}</h1>
        <span className="tag-count">{filtered.length} {lang === 'pt' ? 'artigos' : 'articles'}</span>
      </header>

      <section className="archive-grid">
        {filtered.map(article => (
          <article key={article.id} className="archive-item">
            <Link href={`/${lang}/news/${article.slug}`}>
              <h2>{article.title}</h2>
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
*/

// ============================================================================
// 3. Next.js Pages Router Example: pages/[lang]/tag/[tag].tsx
// ============================================================================

/*
// File: pages/[lang]/tag/[tag].tsx
import { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';

interface TagPageProps {
  lang: 'en' | 'pt';
  tagSlug: string;
  tagLabel: string;
  articles: Article[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const locales = ['en', 'pt'];
  const paths = [];

  for (const lang of locales) {
    const articles = await fetchArticlesForLocale(lang as 'en' | 'pt');
    const tags = new Set<string>();
    for (const a of articles) {
      parseTags(a.tag || a.tags).forEach(t => tags.add(t.slug));
    }
    for (const tag of tags) {
      paths.push({ params: { lang, tag } });
    }
  }

  return {
    paths,
    fallback: false, // Pure SSG
  };
};

export const getStaticProps: GetStaticProps<TagPageProps> = async ({ params }) => {
  const lang = (params?.lang as 'en' | 'pt') || 'en';
  const tagSlug = params?.tag as string;
  const articles = await fetchArticlesForLocale(lang);

  let tagLabel = tagSlug;
  const filtered = articles.filter(a => {
    const tags = parseTags(a.tag || a.tags);
    const found = tags.find(t => t.slug === tagSlug);
    if (found) tagLabel = found.label;
    return Boolean(found);
  });

  return {
    props: {
      lang,
      tagSlug,
      tagLabel,
      articles: filtered,
    },
    revalidate: 60, // Optional ISR
  };
};

export default function TagPage({ lang, tagSlug, tagLabel, articles }: TagPageProps) {
  return (
    <>
      <Head>
        <title>#{tagLabel} Archive | BBN</title>
        <link rel="canonical" href={`https://www.bbnews.cc/${lang}/tag/${tagSlug}`} />
      </Head>
      <div className="tag-page">
        <h1>#{tagLabel}</h1>
        <ul>
          {articles.map(a => (
            <li key={a.id}>
              <Link href={`/${lang}/news/${a.slug}`}>{a.title}</Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
*/

// ============================================================================
// 4. Astro Component Example: src/pages/[lang]/tag/[tag].astro
// ============================================================================

/*
---
// File: src/pages/[lang]/tag/[tag].astro
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { parseTags, toTagSlug } from '../../../utils/tags';

export async function getStaticPaths() {
  const locales = ['en', 'pt'] as const;
  const allRoutes = [];

  for (const lang of locales) {
    const table = lang === 'pt' ? 'artigos' : 'articles';
    // Fetch articles from Supabase or content collections
    const articles = await getArticles(table);

    // Group articles by tag slug
    const tagMap = new Map<string, { label: string; slug: string; articles: any[] }>();

    for (const article of articles) {
      const tags = parseTags(article.tag || article.tags);
      for (const t of tags) {
        if (!tagMap.has(t.slug)) {
          tagMap.set(t.slug, { label: t.label, slug: t.slug, articles: [] });
        }
        tagMap.get(t.slug)!.articles.push(article);
      }
    }

    for (const [slug, entry] of tagMap.entries()) {
      allRoutes.push({
        params: { lang, tag: slug },
        props: {
          tagLabel: entry.label,
          articles: entry.articles,
          lang,
        },
      });
    }
  }

  return allRoutes;
}

const { lang, tag } = Astro.params;
const { tagLabel, articles } = Astro.props;
---

<BaseLayout title={`#${tagLabel} Archive | BBN`}>
  <main class="tag-archive">
    <header class="tag-header">
      <h1>#{tagLabel}</h1>
      <p>{articles.length} articles published</p>
    </header>

    <div class="archive-grid">
      {articles.map((article: any) => (
        <a href={`/${lang}/news/${article.slug}`} class="archive-card">
          <h3>{article.title}</h3>
        </a>
      ))}
    </div>
  </main>
</BaseLayout>
*/
