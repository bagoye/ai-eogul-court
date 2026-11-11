// Statute-article and case-number mentions in Korean legal text.
// One implementation shared by the corpus builder (scripts/rag), the verdict validator and the
// evaluation, so "what counts as citing a law" means the same thing everywhere.
// No imports: Node runs this file directly from the .mjs scripts (type stripping).

export interface LegalRef {
  kind: 'article' | 'case';
  // Normalized law name without spaces or brackets; empty when the text names no law.
  law: string;
  // '618', '3의2' for articles; '99다34697' for cases.
  id: string;
}

const LAW_NAME = String.raw`(?:「([^」]{2,60})」|([가-힣ㆍ·]{1,30}(?:법|규칙|시행령|시행규칙)))`;
const ARTICLE = new RegExp(
  String.raw`(?:${LAW_NAME}\s*)?제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,2}))?`,
  'gu',
);
// Case-type codes only, so dates and amounts ("2024년 10월", "3층 10호") never match.
const CASE = new RegExp(
  String.raw`(?<!\d)(\d{2,4})\s?(다카|가합|가단|가소|구합|고단|고합|다|나|마|므|도|누|두|라|스|후|허|노|카)\s?(\d{1,6})(?!\d)`,
  'gu',
);

export const normalizeLaw = (name: string) => name.replace(/[\s「」]/gu, '');

// Inside a statute (`ownLaw` given), a bare "제3조" means that statute's own article, even right
// after a mention of another law. Elsewhere a named law carries forward: "민법 제2조, 제536조"
// attributes both articles to 민법.
export function findLegalRefs(text: string, ownLaw = ''): LegalRef[] {
  const refs: LegalRef[] = [];
  const own = normalizeLaw(ownLaw);
  let last = '';
  for (const m of text.matchAll(ARTICLE)) {
    const named = m[1] || m[2];
    if (named) last = normalizeLaw(named);
    const law = named ? last : own || last;
    refs.push({ kind: 'article', law, id: m[4] ? `${m[3]}의${m[4]}` : m[3]! });
  }
  for (const m of text.matchAll(CASE))
    refs.push({ kind: 'case', law: '', id: `${m[1]}${m[2]}${m[3]}` });
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.kind}:${r.law}:${r.id}`;
    return !seen.has(key) && !!seen.add(key);
  });
}

// Law names in free text are often shortened ("층간소음 규칙", "주택임대차법"); treat a name as
// matching when one ends with the other, and an unnamed article as matching any law.
const sameLaw = (a: string, b: string) => !a || !b || a === b || a.endsWith(b) || b.endsWith(a);

export function isCovered(ref: LegalRef, allowed: LegalRef[]): boolean {
  return allowed.some(
    (a) =>
      a.kind === ref.kind && a.id === ref.id && (ref.kind === 'case' || sameLaw(a.law, ref.law)),
  );
}

export const formatRef = (r: LegalRef) =>
  r.kind === 'case'
    ? r.id
    : `${r.law ? `${r.law} ` : ''}제${r.id.replace('의', '조의')}${r.id.includes('의') ? '' : '조'}`;
