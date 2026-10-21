import { test, expect } from '@playwright/test';

test('A/C/G/H: plaintiff completes three questions and restores on refresh', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('이 정도 일로');
  await page.screenshot({ path: `artifacts/home-${testInfo.project.name}.png`, fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('link', { name: /내 억울함 재판받기/ }).click();
  await page.getByRole('button', { name: /사라진 마지막 치킨/ }).click();
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await expect(
    page.getByRole('heading', { name: '사라진 마지막 치킨', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const reply =
      i === 0
        ? '그게 중요한가요? 아직 상대방에게 물어보지 않았어요.'
        : i === 1
          ? '나는 형이니까 무조건 내 말이 맞다는 생각이 들었어요.'
          : '다음부터는 서로 먼저 물어봐 주었으면 좋겠습니다. '.repeat(60);
    await page.getByLabel('질문에 대한 진술').fill(reply);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.getByRole('button', { name: '진술하기' }).click();
    if (i < 2) await expect(page.getByText(`${i + 2} / 3`, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('heading', { name: '마지막으로 하고 싶은 말이 있나요?' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '진술하기', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '최후 진술 생략하고 판결받기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 재판을 마칩니다.' })).toBeVisible();
  await page.screenshot({ path: `artifacts/verdict-${testInfo.project.name}.png`, fullPage: true });
  const save = page.getByRole('button', { name: '판결문 이미지 저장 (SVG)' });
  await expect(save).toBeDisabled();
  await page.getByRole('checkbox').check();
  const downloadPromise = page.waitForEvent('download');
  await save.click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.svg$/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('E: judge questions both parties and retains chosen decision', async ({ page }) => {
  await page.goto('/intake/judge');
  await page.getByText('탕수육, 부어버린 자의 책임', { exact: true }).click();
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await expect(page.getByText('0 / 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '피고', exact: true }).click();
  await page.getByLabel('당사자에게 질문').fill('친구의 취향을 미리 알았나요?');
  await page.getByRole('button', { name: '질문하기', exact: true }).click();
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /충분히 들었어요/ }).click();
  await page.getByRole('radio', { name: '피고 주장 인정' }).check();
  await page.getByLabel('판결 이유').fill('확인된 자료의 범위에서 피고의 입장을 인정합니다.');
  await page.getByRole('button', { name: '이 판결로 확정하기' }).click();
  await expect(page.getByRole('heading', { name: '판사님의 판결이 내려졌습니다.' })).toBeVisible();
  await expect(page.locator('.verdict-result')).toHaveText('피고 주장 인정');
});

test('objection references a statement and cannot be repeated', async ({ page }) => {
  await page.goto('/intake/plaintiff');
  await page.getByRole('button', { name: /사라진 마지막 치킨/ }).click();
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await page.getByRole('button', { name: '이의 있습니다' }).first().click();
  await page.getByLabel('반박 내용').fill('제 진술은 확인된 사실과 구분해서 표현해 주세요.');
  await page.getByRole('button', { name: '이의 제출' }).click();
  await expect(page.getByText('2 / 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '이의 있습니다' })).toHaveCount(0);
});

test('serious harm goes to a safety screen', async ({ page }) => {
  await page.goto('/intake/plaintiff');
  await page
    .getByLabel('사건 내용')
    .fill('가족에게 폭행을 당했고 지금 너무 무서운 상황입니다. 어떻게 해야 할지 모르겠어요.');
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await expect(page.getByRole('heading', { name: /가볍게 다루기 어려운/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '진술하기' })).toHaveCount(0);
});

test('F: connection errors preserve the story and can be retried', async ({ page }) => {
  await page.goto('/intake/plaintiff');
  await page.getByRole('button', { name: /사라진 마지막 치킨/ }).click();
  await page.route('**/api/trials', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_NOT_CONFIGURED', message: 'AI 연결 설정이 필요합니다.' },
      }),
    }),
  );
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await expect(page.getByRole('alert')).toContainText('AI 연결 설정이 필요합니다.');
  await expect(page.getByLabel('사건 내용')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: '재판 시작하기' })).toBeEnabled();
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
test('photo evidence and voice input reach the record', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: '말로 덧붙인 이야기입니다' }], {
            isFinal: true,
          });
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
  });
  await page.goto('/intake/plaintiff');
  await page.getByRole('button', { name: /사라진 마지막 치킨/ }).click();
  await page.getByRole('button', { name: '음성 입력' }).click();
  await expect(page.getByLabel('사건 내용')).toHaveValue(/말로 덧붙인 이야기입니다$/);
  await page
    .getByLabel('사진 증거 첨부')
    .setInputFiles({ name: 'chicken.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: '첨부한 사진 1' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: '재판 시작하기' }).click();
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
  await page
    .getByLabel('사진 증거 첨부')
    .setInputFiles({ name: 'fridge.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('질문에 대한 진술').fill('냉장고에 이름표를 붙여 두었어요.');
  await page.getByRole('button', { name: '진술하기' }).click();
  await expect(page.getByText('사진 1장 제출')).toBeVisible();
  await expect(page.getByText(/1장 남음/)).toBeVisible();
  await page.getByRole('button', { name: /사건 기록 보기/ }).click();
  await expect(page.getByText(/^사진 2: /)).toBeVisible();
});
