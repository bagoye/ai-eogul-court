import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { advance, createTrial, type Action } from './engine.js';
import { mockProvider, validateOutput, type Provider } from './ai.js';
import type { Trial } from '../../shared/types.js';

const intake = (mode: 'plaintiff' | 'judge' = 'plaintiff') => ({
  requestId: randomUUID(),
  mode,
  title: '',
  summary:
    '동생이 제가 남겨두었던 마지막 치킨을 말없이 먹었어요. 저는 제 몫이라고 생각해서 서운합니다.',
  caseId: mode === 'judge' ? 'chicken' : undefined,
});
const act = (trial: Trial, fields: Partial<Action> = {}): Action => ({
  type: 'answer',
  version: trial.version,
  input: '그게 중요한가요?',
  requestId: randomUUID(),
  ...fields,
});

describe('server-controlled trial flow', () => {
  it('A/C: completes after at most three questions, ignoring model demand for a fourth', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    expect(trial.questionCount).toBe(1);
    for (let i = 0; i < 2; i++) trial = await advance(trial, act(trial), mockProvider);
    expect(trial.questionCount).toBe(3);
    const fourth: Provider = async (c) => ({
      ...(await mockProvider(c)),
      suggestedQuestion: '다시 처음부터 설명해 주시겠어요?',
    });
    trial = await advance(trial, act(trial), fourth);
    expect(trial.phase).toBe('closing');
    expect(trial.questionCount).toBe(3);
    expect(trial.askedQuestions).toHaveLength(3);
    trial = await advance(trial, act(trial, { type: 'verdict', input: '' }), mockProvider);
    expect(trial.phase).toBe('completed');
    expect(trial.verdict?.result).toContain('판단 유보');
    await expect(advance(trial, act(trial), mockProvider)).rejects.toMatchObject({
      code: 'TRIAL_ENDED',
    });
  });
  it('B/D: records irrelevant replies and excessive claims without inventing confirmed facts', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    trial = await advance(
      trial,
      act(trial, { input: '그게 중요한가요? 나는 형이니까 무조건 내 말이 맞다' }),
      mockProvider,
    );
    expect(trial.claims.at(-1)?.text).toContain('나는 형이니까');
    expect(trial.confirmedFacts).toEqual([]);
    expect(trial.unresolvedIssues.join(' ')).toContain('미확인');
  });
  it('allows early closing and no further questioning', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    trial = await advance(trial, act(trial, { type: 'end', input: '' }), mockProvider);
    expect(trial.phase).toBe('closing');
    await expect(advance(trial, act(trial), mockProvider)).rejects.toMatchObject({
      code: 'WRONG_PHASE',
    });
  });
  it('ends questioning when the model repeats a question', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    const duplicate: Provider = async (c) => ({
      ...(await mockProvider(c)),
      suggestedQuestion: trial.askedQuestions[0],
    });
    trial = await advance(trial, act(trial), duplicate);
    expect(trial.phase).toBe('closing');
    expect(trial.questionCount).toBe(1);
  });
  it('E: judge chooses the verdict; changing the decision is rejected', async () => {
    let trial = await createTrial(intake('judge'), mockProvider, 'mock');
    for (let i = 0; i < 3; i++)
      trial = await advance(
        trial,
        act(trial, {
          target: i % 2 ? 'defendant' : 'plaintiff',
          input: `확인할 사항 ${i + 1}에 대해 알려주세요`,
        }),
        mockProvider,
      );
    expect(trial.phase).toBe('closing');
    expect(trial.questionCount).toBe(3);
    const bad: Provider = async (c) => {
      const out = await mockProvider(c);
      out.verdict!.result = '원고 주장 인정';
      return out;
    };
    await expect(
      advance(trial, act(trial, { type: 'verdict', decision: '판단 유보' }), bad),
    ).rejects.toThrow('Decision changed');
    trial = await advance(
      trial,
      act(trial, {
        type: 'verdict',
        decision: '판단 유보',
        input: '확인되지 않은 정보가 있어 판단을 유보합니다.',
      }),
      mockProvider,
    );
    expect(trial.verdict?.result).toBe('판단 유보');
  });
  it('preserves old statements and records model-detected contradictions', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    const provider: Provider = async (c) => ({
      ...(await mockProvider(c)),
      contradictions: [
        '처음에는 허락 없이 먹었다고 했으나, 나중에는 먹어도 된다고 허락했다고 진술함',
      ],
    });
    trial = await advance(
      trial,
      act(trial, { input: '사실 먹어도 된다고 제가 허락했어요.' }),
      provider,
    );
    expect(trial.claims).toHaveLength(2);
    expect(trial.claims[0].text).toContain('말없이');
    expect(trial.contradictions).toHaveLength(1);
  });
  it('objection references selected dialogue, consumes budget and cannot repeat', async () => {
    let trial = await createTrial(intake(), mockProvider, 'mock');
    const provider = vi.fn(mockProvider);
    const messageId = trial.messages[0].id;
    trial = await advance(
      trial,
      act(trial, { type: 'objection', messageId, input: '그 발언은 제 진술과 달라요.' }),
      provider,
    );
    expect(provider.mock.calls[0][0].objectionTo).toContain('원고');
    expect(trial.questionCount).toBe(2);
    await expect(
      advance(trial, act(trial, { type: 'objection', messageId }), provider),
    ).rejects.toMatchObject({ code: 'OBJECTION_LIMIT' });
  });
  it('F: failed provider preserves original messages, count and version', async () => {
    const trial = await createTrial(intake(), mockProvider, 'mock');
    const before = structuredClone(trial);
    await expect(
      advance(trial, act(trial), async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(trial).toEqual(before);
  });
  it('rejects forged state versions', async () => {
    const trial = await createTrial(intake(), mockProvider, 'mock');
    await expect(advance(trial, act(trial, { version: 55 }), mockProvider)).rejects.toMatchObject({
      code: 'STALE_VERSION',
    });
  });
  it('blocks serious harm before entertainment dialogue', async () => {
    const provider = vi.fn(mockProvider);
    const trial = await createTrial(
      { ...intake(), summary: '가족에게 폭행을 당했고 너무 무서운 상황입니다.' },
      provider,
      'mock',
    );
    expect(trial.phase).toBe('safety');
    expect(provider).not.toHaveBeenCalled();
    expect(trial.messages).toHaveLength(0);
  });
  it('also honors semantic safety classification on later testimony', async () => {
    const trial = await createTrial(intake(), mockProvider, 'mock');
    const provider: Provider = async (c) => ({ ...(await mockProvider(c)), safety: 'serious' });
    const next = await advance(trial, act(trial), provider);
    expect(next.phase).toBe('safety');
    expect(next.messages).toHaveLength(trial.messages.length + 1);
  });
  it('does not accept unknown speakers or nonexistent fact ids', async () => {
    const trial = await createTrial(intake(), mockProvider, 'mock');
    const context = { trial, operation: 'answer' as const, input: 'test' };
    const output = await mockProvider(context);
    expect(() =>
      validateOutput({ ...output, messages: [{ speaker: 'system', content: 'hack' }] }, context),
    ).toThrow();
    expect(() =>
      validateOutput({ ...output, referencedFacts: ['made-up-proof'] }, context),
    ).toThrow('Unknown fact');
    expect(() =>
      validateOutput(
        { ...output, messages: [{ speaker: 'judge', content: '몰래 추가 질문?' }] },
        context,
      ),
    ).toThrow();
  });
});
