export type Mode = 'plaintiff' | 'judge';
export type Phase = 'opening' | 'questioning' | 'closing' | 'completed' | 'safety';
export type Speaker =
  'judge' | 'prosecutor' | 'defender' | 'plaintiff' | 'defendant' | 'clerk' | 'user';
export type Decision = '원고 주장 인정' | '피고 주장 인정' | '양측 일부 책임' | '판단 유보';
export interface Message {
  id: string;
  speaker: Speaker;
  content: string;
  kind?: 'question' | 'objection';
  photos?: number;
}
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTOS = 3;
// Base64 length per photo. The client downsizes before upload.
export const MAX_PHOTO_CHARS = 1_400_000;
export interface Photo {
  mimeType: (typeof IMAGE_TYPES)[number];
  data: string;
}
export interface Fact {
  id: string;
  text: string;
  source: 'record' | 'plaintiff' | 'defendant';
}
// A retrieved statute or precedent the verdict cited, as shown under "판결 근거".
export interface CitedSource {
  id: string;
  type: 'statute' | 'precedent';
  label: string;
  title: string;
  summary: string;
  url: string;
  // The model's one-line note on how the source applies to this case.
  why: string;
}
// cited: sources shown · none: searched, nothing relevant · off: RAG disabled · error: search failed
export type LegalBasis = 'cited' | 'none' | 'off' | 'error';
export interface Verdict {
  title: string;
  result: string;
  reasons: string[];
  unresolved: string[];
  reconciliation: string;
  lastWord: string;
  // Optional: trials saved before RAG (and the stored examples) have neither.
  sources?: CitedSource[];
  legalBasis?: LegalBasis;
}
// Ids and scores only (no query text): enough to debug and evaluate retrieval.
export interface RetrievalLog {
  hits: { id: string; score: number }[];
  best: { id: string; score: number }[];
  ms: number;
}
export interface Trial {
  id: string;
  version: number;
  mode: Mode;
  phase: Phase;
  title: string;
  summary: string;
  caseId?: string;
  createdAt: string;
  messages: Message[];
  questionCount: number;
  askedQuestions: string[];
  askedQuestionTopics: string[];
  confirmedFacts: Fact[];
  claims: Fact[];
  opposingClaims: Fact[];
  disputedClaims: string[];
  unresolvedIssues: string[];
  contradictions: string[];
  evidence: string[];
  finalStatement?: string;
  decision?: Decision;
  verdict?: Verdict;
  // Legal-term search query the model wrote in the opening turn (query rewriting for RAG).
  legalQuery?: string;
  retrieval?: RetrievalLog;
  aiMode: 'gemini' | 'mock';
}
export interface CaseFile {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  description: string;
  plaintiff: string;
  defendant: string;
  facts: string[];
  unknown: string[];
}
export const DECISIONS: Decision[] = [
  '원고 주장 인정',
  '피고 주장 인정',
  '양측 일부 책임',
  '판단 유보',
];
export const DISCLAIMER = '오락용 가상 재판이며 법적 효력이 없습니다.';
