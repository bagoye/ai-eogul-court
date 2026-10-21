import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Trial, Message } from '../../shared/types.js';
import { DECISIONS } from '../../shared/types.js';
import { CASES } from '../../shared/cases.js';
import { type Provider, type AIContext, validateOutput } from './ai.js';
import { AppError } from './errors.js';

export const intakeSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(['plaintiff', 'judge']),
  title: z.string().trim().max(65).default(''),
  summary: z.string().trim().max(5000).default(''),
  caseId: z.string().max(50).optional(),
});
export const actionSchema = z.object({
  requestId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  type: z.enum(['answer', 'end', 'verdict', 'objection']),
  input: z.string().trim().max(3000).default(''),
  target: z.enum(['plaintiff', 'defendant']).optional(),
  messageId: z.string().uuid().optional(),
  decision: z.enum(DECISIONS).optional(),
});
export type Action = z.infer<typeof actionSchema>;
export const seriousText = (value: string) =>
  /폭행|성폭|성추행|성범죄|강간|학대|스토킹|자살|자해|살인|죽이겠|죽여버|협박|사기당|가정폭력|맞았|때렸|때려서|불법촬영|아동.{0,6}피해|sexual assault|suicid|stalking|domestic violence/iu.test(
    value,
  );
const message = (
  speaker: Message['speaker'],
  content: string,
  kind?: Message['kind'],
): Message => ({ id: randomUUID(), speaker, content, ...(kind ? { kind } : {}) });
const unique = (items: string[]) => [...new Set(items)].slice(0, 20);
const normalized = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

async function generate(
  trial: Trial,
  provider: Provider,
  operation: AIContext['operation'],
  input: string,
  extra: Partial<AIContext> = {},
) {
  const context: AIContext = { trial, operation, input, ...extra };
  const output = validateOutput(await provider(context), context);
  if (output.safety === 'serious') {
    trial.phase = 'safety';
    return;
  }
  trial.messages.push(...output.messages.map((m) => message(m.speaker, m.content)));
  trial.unresolvedIssues = unique([...trial.unresolvedIssues, ...output.unresolvedIssues]);
  trial.contradictions = unique([...trial.contradictions, ...output.contradictions]);
  if (operation === 'opening' && !trial.title) trial.title = output.caseTitle;
  if (operation === 'verdict') {
    trial.verdict = {
      ...output.verdict!,
      ...(trial.mode === 'judge' ? { result: trial.decision! } : {}),
      unresolved: unique([
        ...trial.unresolvedIssues,
        ...trial.contradictions,
        ...output.verdict!.unresolved,
      ]),
    };
    trial.phase = 'completed';
    return;
  }
  if (trial.mode === 'plaintiff') {
    const q = output.suggestedQuestion.trim();
    // The model cannot control phase or budget. Repeated/no question ends examination.
    if (
      trial.questionCount >= 3 ||
      !q ||
      output.questionTopic === 'none' ||
      trial.askedQuestionTopics.includes(output.questionTopic) ||
      trial.askedQuestions.some((old) => normalized(old) === normalized(q))
    ) {
      trial.phase = 'closing';
      return;
    }
    trial.questionCount++;
    trial.askedQuestions.push(q);
    trial.askedQuestionTopics.push(output.questionTopic);
    trial.messages.push(message('judge', q, 'question'));
  }
  trial.phase = trial.mode === 'judge' && trial.questionCount >= 3 ? 'closing' : 'questioning';
}

export async function createTrial(
  data: z.infer<typeof intakeSchema>,
  provider: Provider,
  aiMode: Trial['aiMode'],
): Promise<Trial> {
  const file = data.mode === 'judge' ? CASES.find((c) => c.id === data.caseId) : undefined;
  if (data.mode === 'judge' && !file)
    throw new AppError(400, 'CASE_REQUIRED', '재판할 사건을 선택해 주세요.');
  if (
    data.mode === 'plaintiff' &&
    (data.summary.length < 20 || new Set(data.summary.replace(/\s/g, '')).size < 7)
  )
    throw new AppError(
      400,
      'DETAIL_REQUIRED',
      '누가, 어떤 상황에서, 무엇을 했는지 20자 이상으로 설명해 주세요.',
    );
  const trial: Trial = {
    id: randomUUID(),
    version: 0,
    mode: data.mode,
    phase: 'opening',
    title: file?.title || data.title,
    summary: file?.description || data.summary,
    caseId: file?.id,
    createdAt: new Date().toISOString(),
    messages: [],
    questionCount: 0,
    askedQuestions: [],
    askedQuestionTopics: [],
    confirmedFacts:
      file?.facts.map((text, i) => ({ id: `fact-${i}`, text, source: 'record' })) || [],
    claims: [{ id: 'claim-0', text: file?.plaintiff || data.summary, source: 'plaintiff' }],
    opposingClaims: file ? [{ id: 'opposing-0', text: file.defendant, source: 'defendant' }] : [],
    disputedClaims: file
      ? [file.plaintiff, file.defendant]
      : ['원고의 진술에 대한 상대방의 확인이 없습니다.'],
    unresolvedIssues: file?.unknown || ['상대방 진술 및 의도 미확인'],
    contradictions: [],
    evidence: [],
    aiMode,
  };
  if (seriousText(data.summary + data.title)) {
    trial.phase = 'safety';
    return trial;
  }
  await generate(trial, provider, 'opening', trial.summary);
  return trial;
}

// Copy-on-write: API failure never partially advances the original session.
export async function advance(original: Trial, action: Action, provider: Provider): Promise<Trial> {
  if (action.version !== original.version)
    throw new AppError(
      409,
      'STALE_VERSION',
      '다른 요청에서 재판이 변경되었습니다. 최신 기록을 불러와 주세요.',
    );
  const trial = structuredClone(original);
  if (trial.phase === 'completed' || trial.phase === 'safety')
    throw new AppError(409, 'TRIAL_ENDED', '이미 종료된 재판입니다.');
  if (action.type === 'end') {
    if (trial.phase !== 'questioning')
      throw new AppError(409, 'WRONG_PHASE', '심문 단계에서만 종료할 수 있습니다.');
    trial.phase = 'closing';
  } else if (action.type === 'verdict') {
    if (trial.phase !== 'closing')
      throw new AppError(409, 'WRONG_PHASE', '심문을 종료한 후 판결할 수 있습니다.');
    if (trial.mode === 'judge' && !action.decision)
      throw new AppError(400, 'DECISION_REQUIRED', '판결 결과를 직접 선택해 주세요.');
    trial.decision = trial.mode === 'judge' ? action.decision : undefined;
    trial.finalStatement = action.input;
    if (action.input) {
      trial.messages.push(message('user', action.input));
      if (trial.mode === 'plaintiff')
        trial.claims.push({ id: `claim-final`, text: action.input, source: 'plaintiff' });
    }
    if (seriousText(action.input)) trial.phase = 'safety';
    else await generate(trial, provider, 'verdict', action.input);
  } else {
    if (trial.phase !== 'questioning')
      throw new AppError(409, 'WRONG_PHASE', '현재 단계에서는 추가 심문을 할 수 없습니다.');
    if (!action.input) throw new AppError(400, 'INPUT_REQUIRED', '진술 또는 질문을 입력해 주세요.');
    if (trial.mode === 'judge' && !action.target && action.type === 'answer')
      throw new AppError(400, 'TARGET_REQUIRED', '질문할 당사자를 선택해 주세요.');
    if (trial.mode === 'judge' && trial.questionCount >= 3)
      throw new AppError(409, 'QUESTION_LIMIT', '심문은 최대 3회입니다.');
    let objectionTo: string | undefined;
    if (action.type === 'objection') {
      const selected = trial.messages.find(
        (m) =>
          m.id === action.messageId &&
          ['judge', 'prosecutor', 'defender', 'plaintiff', 'defendant'].includes(m.speaker) &&
          m.kind !== 'question',
      );
      if (!selected)
        throw new AppError(400, 'MESSAGE_REQUIRED', '이의를 제기할 발언을 선택해 주세요.');
      if (trial.messages.some((m) => m.kind === 'objection'))
        throw new AppError(409, 'OBJECTION_LIMIT', '이의 제기는 재판당 1회 가능합니다.');
      objectionTo = selected.content;
    }
    if (trial.mode === 'judge') {
      if (trial.askedQuestions.some((q) => normalized(q) === normalized(action.input)))
        throw new AppError(
          400,
          'DUPLICATE_QUESTION',
          '이미 한 질문입니다. 다른 쟁점을 질문해 주세요.',
        );
      trial.questionCount++;
      trial.askedQuestions.push(action.input);
    } else {
      trial.claims.push({
        id: `claim-${trial.claims.length}`,
        text: action.input,
        source: 'plaintiff',
      });
    }
    trial.messages.push(
      message('user', action.input, action.type === 'objection' ? 'objection' : undefined),
    );
    if (seriousText(action.input)) trial.phase = 'safety';
    else
      await generate(trial, provider, action.type, action.input, {
        target: action.target,
        objectionTo,
      });
  }
  trial.version++;
  return trial;
}
