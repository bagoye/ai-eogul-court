import type { Trial } from './types.js';
import { CASES } from './cases.js';

// Real Gemini output saved during the docs/AI_EVALUATION.md runs on 2026-10-22.
// Plaintiff: final configuration (gemini-3.5-flash-lite). Judge: first run
// (gemini-3.8-flash / gemini-3.5-flash-lite); the result is the user's choice either way.
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
    createdAt: '2026-10-22T02:30:32.909Z',
    messages: [
      {
        id: 'example-plaintiff-1',
        speaker: 'defender',
        content:
          '원고 주장에 따르면 남겨둔 치킨 한 조각을 동생이 먹었다고 하나, 이에 대한 동생의 입장은 아직 확인되지 않았습니다.',
      },
      {
        id: 'example-plaintiff-2',
        speaker: 'prosecutor',
        content:
          '원고가 먹으려고 남겨 둔 것이라는 주장은 일방적이며, 냉장고에 보관된 음식에 대한 명확한 사전 합의가 있었는지 증거가 부족합니다.',
      },
      {
        id: 'example-plaintiff-3',
        speaker: 'judge',
        content: '냉장고에 남겨둔 치킨을 드시겠다고 동생에게 미리 말씀하셨나요?',
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
          '원고 주장에 따르면 별도의 약속은 없었으나 평소 남은 음식을 주로 먹었다고 하나, 이는 원고의 일방적 주장입니다.',
      },
      {
        id: 'example-plaintiff-6',
        speaker: 'prosecutor',
        content:
          '사전 약속이나 명시적인 소유 표시가 없었다면 상대방이 이를 인지하기 어려웠을 수 있습니다.',
      },
      {
        id: 'example-plaintiff-7',
        speaker: 'judge',
        content: '그 뒤 동생분과 이 일에 대해 어떤 이야기를 나누셨나요?',
        kind: 'question',
      },
      {
        id: 'example-plaintiff-8',
        speaker: 'user',
        content: '동생은 아무 말도 안 했어요.',
      },
      {
        id: 'example-plaintiff-9',
        speaker: 'defender',
        content:
          '원고 주장에 따르면 동생과 이 일에 대해 아무 말을 나누지 않았다고 하나, 상대방의 정확한 입장은 여전히 확인되지 않았습니다.',
      },
      {
        id: 'example-plaintiff-10',
        speaker: 'prosecutor',
        content: '상대방과 대화나 소통이 없었다면 상대방이 원고의 의도를 알기 어려웠을 것입니다.',
      },
      {
        id: 'example-plaintiff-11',
        speaker: 'judge',
        content: '이번 일로 어떤 점이 가장 속상하셨나요?',
        kind: 'question',
      },
      {
        id: 'example-plaintiff-12',
        speaker: 'user',
        content: '다음부터는 먹기 전에 물어봐 줬으면 해요.',
      },
      {
        id: 'example-plaintiff-13',
        speaker: 'defender',
        content:
          '원고 주장에 따르면 다음부터는 먹기 전에 물어봐 주기를 바란다고 하나, 상대방의 입장은 아직 확인되지 않았습니다.',
      },
      {
        id: 'example-plaintiff-14',
        speaker: 'prosecutor',
        content:
          '원고가 바라는 해결책이 제시되었으나, 사전 약속 부재 속에서 상대방에게만 책임을 묻기는 어렵습니다.',
      },
      {
        id: 'example-plaintiff-15',
        speaker: 'user',
        content: '서운했지만 화해하고 싶어요.',
      },
    ],
    questionCount: 3,
    askedQuestions: [
      '냉장고에 남겨둔 치킨을 드시겠다고 동생에게 미리 말씀하셨나요?',
      '그 뒤 동생분과 이 일에 대해 어떤 이야기를 나누셨나요?',
      '이번 일로 어떤 점이 가장 속상하셨나요?',
    ],
    askedQuestionTopics: ['agreement', 'communication', 'impact'],
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
        id: 'claim-2',
        text: '동생은 아무 말도 안 했어요.',
        source: 'plaintiff',
      },
      {
        id: 'claim-3',
        text: '다음부터는 먹기 전에 물어봐 줬으면 해요.',
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
    unresolvedIssues: ['상대방 진술 및 의도 미확인', '치킨 보관 및 취식에 대한 사전 합의 여부'],
    contradictions: [],
    evidence: [],
    finalStatement: '서운했지만 화해하고 싶어요.',
    verdict: {
      title: '남은 치킨 실종 사건 판결',
      result: '판단 유보',
      reasons: [
        '원고 주장에 따르면 냉장고에 남겨둔 치킨을 동생이 먹었으나 별도의 사전 약속은 없었다.',
        '상대방의 입장이 확인되지 않아 일방의 주장만으로 책임을 단정하기 어렵다.',
      ],
      unresolved: ['상대방 진술 및 의도 미확인', '치킨 보관 및 취식에 대한 사전 합의 여부'],
      reconciliation:
        '앞으로는 냉장고에 남은 음식에 이름을 적어두거나 간단히 메모를 남겨 서로의 몫을 존중해 보세요.',
      lastWord: '서운한 마음은 이해하지만, 확실한 소통을 통해 오해를 줄여나가길 바랍니다.',
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
