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
}
export interface Fact {
  id: string;
  text: string;
  source: 'record' | 'plaintiff' | 'defendant';
}
export interface Verdict {
  title: string;
  result: string;
  reasons: string[];
  unresolved: string[];
  reconciliation: string;
  lastWord: string;
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
