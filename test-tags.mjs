// ============================================================
// BBN Tag Parsing & Normalization Unit Test Suite
// Run: node test-tags.mjs
// ============================================================

import assert from 'assert';
import {
  toTagSlug,
  parseTags,
  formatTagPillsHtml,
  formatTagCloudHtml,
  getRegionForTag,
  getRegionForArticle,
  groupTagsByRegion,
  formatRegionalNavHtml,
  REGIONAL_TAXONOMY
} from './shared.mjs';

console.log('🧪 Running BBN Tag Parsing & Normalization Tests...\n');

// 1. Test toTagSlug()
console.log('1. Testing toTagSlug()...');
assert.strictEqual(toTagSlug('#PoliticaBR'), 'politica-br');
assert.strictEqual(toTagSlug('PoliticaBR'), 'politica-br');
assert.strictEqual(toTagSlug('BrazilPolitics'), 'brazil-politics');
assert.strictEqual(toTagSlug('Bitcoin'), 'bitcoin');
assert.strictEqual(toTagSlug('SançõesEUA'), 'sancoes-eua');
assert.strictEqual(toTagSlug('PreçosDoCrú'), 'precos-do-cru');
assert.strictEqual(toTagSlug('ConselhoDeSegurança'), 'conselho-de-seguranca');
assert.strictEqual(toTagSlug('USJustice'), 'us-justice');
assert.strictEqual(toTagSlug('STF'), 'stf');
assert.strictEqual(toTagSlug('PGR'), 'pgr');
assert.strictEqual(toTagSlug('BBNInsight'), 'bbn-insight');
assert.strictEqual(toTagSlug('   #Crypto   '), 'crypto');
assert.strictEqual(toTagSlug('Mercados & Finanças'), 'mercados-financas');
console.log('   ✅ toTagSlug() tests passed!');

// 2. Test parseTags() with hashtag strings
console.log('2. Testing parseTags() with hashtag strings...');
const rawPt = '#PoliticaBR #Economia #SançõesEUA';
const parsedPt = parseTags(rawPt);
assert.deepStrictEqual(parsedPt, [
  { label: 'PoliticaBR', slug: 'politica-br' },
  { label: 'Economia', slug: 'economia' },
  { label: 'SançõesEUA', slug: 'sancoes-eua' }
]);

const rawEn = '#Bitcoin #BrazilPolitics #Crypto';
const parsedEn = parseTags(rawEn);
assert.deepStrictEqual(parsedEn, [
  { label: 'Bitcoin', slug: 'bitcoin' },
  { label: 'BrazilPolitics', slug: 'brazil-politics' },
  { label: 'Crypto', slug: 'crypto' }
]);
console.log('   ✅ Hashtag string parsing tests passed!');

// 3. Test parseTags() with comma/space separated strings and deduplication
console.log('3. Testing parseTags() with comma strings and deduplication...');
const rawComma = 'Bitcoin, BrazilPolitics, Crypto, #bitcoin';
const parsedComma = parseTags(rawComma);
assert.deepStrictEqual(parsedComma, [
  { label: 'Bitcoin', slug: 'bitcoin' },
  { label: 'BrazilPolitics', slug: 'brazil-politics' },
  { label: 'Crypto', slug: 'crypto' }
]);
console.log('   ✅ Comma/deduplication tests passed!');

// 4. Test parseTags() with arrays of strings or objects
console.log('4. Testing parseTags() with arrays...');
const rawArr = ['CrimeCripto', 'RouboBitcoin', 'JustiçaEUA'];
const parsedArr = parseTags(rawArr);
assert.deepStrictEqual(parsedArr, [
  { label: 'CrimeCripto', slug: 'crime-cripto' },
  { label: 'RouboBitcoin', slug: 'roubo-bitcoin' },
  { label: 'JustiçaEUA', slug: 'justica-eua' }
]);

const rawObjArr = [{ label: 'PoliticaBR' }, { label: 'Economia', slug: 'economia' }];
const parsedObjArr = parseTags(rawObjArr);
assert.deepStrictEqual(parsedObjArr, [
  { label: 'PoliticaBR', slug: 'politica-br' },
  { label: 'Economia', slug: 'economia' }
]);
console.log('   ✅ Array parsing tests passed!');

// 5. Test formatTagPillsHtml()
console.log('5. Testing formatTagPillsHtml()...');
const pillsHtmlPt = formatTagPillsHtml(parsedPt, 'pt');
assert(pillsHtmlPt.includes('href="/pt/tag/politica-br"'));
assert(pillsHtmlPt.includes('class="article-tag-pill"'));
assert(pillsHtmlPt.includes('#</span><span class="tag-label">PoliticaBR'));

const pillsHtmlEn = formatTagPillsHtml(parsedEn, 'en');
assert(pillsHtmlEn.includes('href="/en/tag/bitcoin"'));
assert(pillsHtmlEn.includes('class="article-tag-pill"'));
assert(pillsHtmlEn.includes('#</span><span class="tag-label">Bitcoin'));
console.log('   ✅ formatTagPillsHtml() tests passed!');

// 6. Test formatTagCloudHtml()
console.log('6. Testing formatTagCloudHtml()...');
const tagStats = [
  { label: 'PoliticaBR', slug: 'politica-br', count: 42 },
  { label: 'Economia', slug: 'economia', count: 18 }
];
const cloudHtml = formatTagCloudHtml(tagStats, 'politica-br', 'pt');
assert(cloudHtml.includes('class="tag-nav-chip active"'));
assert(cloudHtml.includes('data-tag-slug="politica-br"'));
assert(cloudHtml.includes('href="/pt/tag/economia"'));
assert(cloudHtml.includes('<span class="tag-nav-count">42</span>'));
assert(cloudHtml.includes('Todas as Notícias'));
console.log('   ✅ formatTagCloudHtml() tests passed!');

// 7. Test Regional Taxonomy Classification
console.log('7. Testing getRegionForTag() & getRegionForArticle()...');
assert.strictEqual(getRegionForTag('politica-br').id, 'brasil');
assert.strictEqual(getRegionForTag('stf').id, 'brasil');
assert.strictEqual(getRegionForTag('policia-federal').id, 'brasil');
assert.strictEqual(getRegionForTag('bitcoin').id, 'crypto');
assert.strictEqual(getRegionForTag('oriente-medio').id, 'middleEast');
assert.strictEqual(getRegionForTag('petroleo').id, 'middleEast');
assert.strictEqual(getRegionForTag('trump').id, 'global');

const mockArticle = {
  title: 'Diretores da PF Oferecem Renúncia em Solidariedade ao Chefe',
  tag: '#PoliciaFederal #STF'
};
assert.strictEqual(getRegionForArticle(mockArticle).id, 'brasil');
console.log('   ✅ Regional taxonomy tests passed!');

// 8. Test 2-Tier Regional Navigation HTML
console.log('8. Testing formatRegionalNavHtml()...');
const grouped = groupTagsByRegion([
  { label: 'PoliticaBR', slug: 'politica-br', count: 9 },
  { label: 'STF', slug: 'stf', count: 7 },
  { label: 'Bitcoin', slug: 'bitcoin', count: 25 },
  { label: 'OrienteMédio', slug: 'oriente-medio', count: 4 }
]);
assert.strictEqual(grouped.brasil.length, 2);
assert.strictEqual(grouped.crypto.length, 1);
assert.strictEqual(grouped.middleEast.length, 1);

const regionalNavHtml = formatRegionalNavHtml({
  groupedTags: grouped,
  topTags: [{ label: 'PoliticaBR', slug: 'politica-br', count: 9 }],
  activeRegionId: 'brasil',
  activeTagSlug: 'stf',
  lang: 'pt'
});
assert(regionalNavHtml.includes('data-region-id="brasil"'));
assert(regionalNavHtml.includes('class="region-tab-btn active"'));
assert(regionalNavHtml.includes('data-panel-region="brasil"'));
assert(regionalNavHtml.includes('href="/pt/regiao/brasil"'));
assert(regionalNavHtml.includes('href="/pt/tag/stf"'));
console.log('   ✅ formatRegionalNavHtml() tests passed!');

console.log('\n🎉 ALL TAG PARSING & NORMALIZATION TESTS PASSED SUCCESSFULLY!');
