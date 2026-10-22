import type { Trial } from './types.js';
import { CASES } from './cases.js';

// Real Gemini output saved during the docs/AI_EVALUATION.md run on 2026-10-22
// (models gemini-3.8-flash / gemini-3.5-flash-lite; most answers came from the fallback).
// Shown when visitors want to see a full trial without spending AI quota.
// Keep the dialogue and verdict text verbatim: the page labels them as real AI responses.
const chicken = CASES.find((c) => c.id === 'chicken')!;

export const EXAMPLE_TRIALS: Trial[] = [
  {
    id: 'example-plaintiff',
    version: 3,
    mode: 'plaintiff',
    phase: 'completed',
    title: '남은 치킨 실종 사건',
    summary:
      '어제 저녁에 시킨 치킨이 한 조각 남아서 냉장고에 넣어 뒀는데, 아침에 보니 동생이 먹어 버렸습니다. 저는 제가 먹으려고 남겨 둔 거라고 생각했어요.',
    createdAt: '2026-10-22T00:04:03.066Z',
    messages: [
      {
        id: 'example-plaintiff-1',
        speaker: 'defender',
        content:
          '원고가 치킨을 남겨 둔 것은 사실이나, 명시적으로 본인의 것이라고 표시하거나 남겨 두었다는 말을 한 적이 없습니다.',
      },
      {
        id: 'example-plaintiff-2',
        speaker: 'prosecutor',
        content:
          '동생이 냉장고의 남은 음식을 먹기 전에 원고에게 확인을 거치지 않은 점은 명백한 소통 부족입니다.',
      },
      {
        id: 'example-plaintiff-3',
        speaker: 'judge',
        content: '치킨을 냉장고에 넣을 때 동생에게 따로 남겨둔 것이라고 말씀하셨나요?',
        kind: 'question',
      },
      {
        id: 'example-plaintiff-4',
        speaker: 'user',
        content: '따로 약속은 없었지만 평소에 남은 건 제가 먹었어요.',
      },
      {
        id: 'example-plaintiff-5',
        speaker: 'defender',
        content:
          '사전 약속이나 표시가 없었으므로 피고가 냉장고의 남은 음식을 먹은 것을 고의적인 침해로 보기 어렵습니다.',
      },
      {
        id: 'example-plaintiff-6',
        speaker: 'prosecutor',
        content:
          '공동으로 사용하는 냉장고의 음식이라도 상대방의 식습관 패턴을 고려했다면 최소한의 확인이 필요했습니다.',
      },
      {
        id: 'example-plaintiff-7',
        speaker: 'user',
        content: '서운했지만 화해하고 싶어요.',
      },
    ],
    questionCount: 1,
    askedQuestions: ['치킨을 냉장고에 넣을 때 동생에게 따로 남겨둔 것이라고 말씀하셨나요?'],
    askedQuestionTopics: [],
    confirmedFacts: [],
    claims: [
      {
        id: 'claim-0',
        text: '어제 저녁에 시킨 치킨이 한 조각 남아서 냉장고에 넣어 뒀는데, 아침에 보니 동생이 먹어 버렸습니다. 저는 제가 먹으려고 남겨 둔 거라고 생각했어요.',
        source: 'plaintiff',
      },
      {
        id: 'claim-1',
        text: '따로 약속은 없었지만 평소에 남은 건 제가 먹었어요.',
        source: 'plaintiff',
      },
      {
        id: 'claim-final',
        text: '서운했지만 화해하고 싶어요.',
        source: 'plaintiff',
      },
    ],
    opposingClaims: [],
    disputedClaims: ['원고의 진술에 대한 상대방의 확인이 없습니다.'],
    unresolvedIssues: [
      '상대방 진술 및 의도 미확인',
      '동생이 치킨을 먹을 당시 원고의 메모나 사전 고지가 있었는지 여부',
      '피고의 입장 및 당시 상황에 대한 진술 미확인',
    ],
    contradictions: [],
    evidence: [],
    finalStatement: '서운했지만 화해하고 싶어요.',
    verdict: {
      title: '남은 치킨 실종 사건 판결',
      result: '원고 일부 승소 및 화해 권고',
      reasons: [
        '원고 진술에 따르면 냉장고에 남겨둔 치킨을 동생이 먹었으나, 사전 합의나 명시적 표시는 없었음.',
        '공동 냉장고의 음식이라도 소통 부족으로 인한 오해의 소지가 있음.',
      ],
      unresolved: [
        '상대방 진술 및 의도 미확인',
        '동생이 치킨을 먹을 당시 원고의 메모나 사전 고지가 있었는지 여부',
        '피고의 입장 및 당시 상황에 대한 진술 미확인',
        '피고의 정확한 변명이나 당시 상황은 확인되지 않음.',
      ],
      reconciliation: '다음에는 냉장고에 남은 음식에 포스트잇으로 이름을 써두기로 합의하세요.',
      lastWord: '사소한 치킨 한 조각으로 상한 마음을 풀고 사이좋게 지내시길 바랍니다.',
    },
    aiMode: 'gemini',
  } as Trial,
  {
    ...{
      id: 'example-judge',
      version: 2,
      mode: 'judge',
      phase: 'completed',
      title: '사라진 마지막 치킨의 행방',
      caseId: 'chicken',
      createdAt: '2026-10-22T00:04:03.066Z',
      messages: [
        {
          id: 'example-judge-1',
          speaker: 'plaintiff',
          content:
            '동생이 제가 먹으려고 남겨둔 마지막 치킨을 말도 없이 먹었어요. 한마디는 물어봤어야죠.',
        },
        {
          id: 'example-judge-2',
          speaker: 'defendant',
          content: '같이 먹던 치킨이고 따로 이름도 안 써 있었어요. 남겨둔 줄은 몰랐어요.',
        },
      ],
      questionCount: 0,
      askedQuestions: [],
      askedQuestionTopics: [],
      claims: [
        {
          id: 'claim-0',
          text: '동생이 제가 먹으려고 남겨둔 마지막 치킨을 말도 없이 먹었어요. 한마디는 물어봤어야죠.',
          source: 'plaintiff',
        },
      ],
      unresolvedIssues: [
        '치킨 구매자와 비용 분담',
        '남기기로 한 사전 약속',
        '동생이 원고의 의도를 알고 있었는지',
        '치킨 구매자와 비용 분담 여부',
        '남기기로 한 사전 약속 여부',
      ],
      contradictions: [],
      evidence: [],
      finalStatement: '',
      decision: '양측 일부 책임',
      verdict: {
        title: '사라진 마지막 치킨 사건 판결',
        result: '양측 일부 책임',
        reasons: [
          '확인된 사실에 따르면 남매가 함께 치킨을 먹은 후 냉장고에 남은 마지막 한 조각을 동생이 먹었다.',
          '남은 치킨에 이름이나 별도의 표시가 없어 동생이 이를 원고가 남겨둔 것인지 알기 어려웠던 점이 인정된다.',
          '다만 가족 간의 공유 음식이라도 마지막 남은 음식에 대해서는 최소한의 소통이 아쉽다는 점에서 양측 모두에게 일부 책임이 있다.',
        ],
        unresolved: [
          '치킨 구매자와 비용 분담',
          '남기기로 한 사전 약속',
          '동생이 원고의 의도를 알고 있었는지',
          '치킨 구매자와 비용 분담 여부',
          '남기기로 한 사전 약속 여부',
          '치킨의 정확한 구매자와 비용 분담 관계',
          '먹기 전 사전 합의나 소통이 있었는지 여부',
        ],
        reconciliation:
          '다음부터 냉장고에 남기는 음식에는 포스트잇으로 이름을 남기거나 미리 말해두기로 합의하세요.',
        lastWord: '가족 간의 사소한 음식 갈등은 충분한 대화로 해결할 수 있습니다.',
      },
      aiMode: 'gemini',
    },
    summary: chicken.description,
    confirmedFacts: chicken.facts.map((text, i) => ({ id: `fact-${i}`, text, source: 'record' })),
    opposingClaims: [{ id: 'opposing-0', text: chicken.defendant, source: 'defendant' }],
    disputedClaims: [chicken.plaintiff, chicken.defendant],
  } as Trial,
];
