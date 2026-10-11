import { test, expect, type Page } from '@playwright/test';
import { initialConfig } from '../../lib/ai/config';
import { resolveModel, preferencesSchema } from '../../lib/ai/catalog';
import sharp from 'sharp';
const fakePassword = 'mock-access-code-for-browser-test-only';
async function mockAI(page: Page) {
  let authenticated = false,
    admin = false;
  let config = initialConfig();
  const sent: Record<string, unknown>[] = [];
  config.models.forEach((m) => {
    m.inputPrice = 0.4;
    m.outputPrice = 1.6;
  });
  await page.route('**/api/ai/session', async (route) => {
    const body = route.request().postDataJSON();
    authenticated = true;
    admin = body.role === 'admin';
    await route.fulfill({ json: { authenticated, admin } });
  });
  await page.route(/\/api\/ai$/, (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          enabled: true,
          reason: 'Mock 服务已配置，仅用于界面测试',
          provider: 'multiple',
          authenticated,
          admin,
          persistent: true,
          ...(authenticated
            ? {
                config,
                configured: {
                  openai: true,
                  deepseek: true,
                  moonshot: true,
                  gemini: true,
                  anthropic: true,
                },
              }
            : {}),
        },
      });
    const body = route.request().postDataJSON();
    sent.push(body);
    let result: unknown;
    if (body.task === 'coach')
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          [
            { type: 'delta', delta: '【事实】记录不足。' },
            { type: 'delta', delta: '\n【建议】规律训练。' },
            {
              type: 'result',
              result: { answer: '【事实】记录不足。\n【建议】规律训练。' },
              provider: 'deepseek',
              model: 'deepseek-flash',
              usage: { input: 10, output: 5, exact: true },
              fallbackErrors: [],
            },
          ]
            .map((e) => JSON.stringify(e))
            .join('\n') + '\n',
      });
    if (body.task === 'photo')
      result = {
        items: [
          {
            name: '估算米饭',
            amount: 150,
            unit: 'g',
            nutrition: { calories: 116, protein: 2.6, carbs: 25.6, fat: 0.3 },
            note: '照片份量估算',
          },
        ],
        warnings: ['油量与重量无法准确判断'],
      };
    else if (body.task === 'weekly')
      result = {
        diet: '记录不足',
        training: '完成次数以记录为准',
        habits: '习惯统计来自最近7天',
        body: '暂无足够身体趋势',
        missingData: ['饮食日期缺失'],
        advice: ['记录一餐', '规律训练', '保持睡眠'],
      };
    else
      result = {
        name: '标签牛奶',
        unit: 'ml',
        nutrition: { calories: 60, protein: 3, carbs: 5, fat: 3 },
        notes: ['人工核对标签'],
      };
    return route.fulfill({
      json: {
        result,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        usage: { input: 10, output: 5, exact: true },
        fallbackErrors: [],
      },
    });
  });
  await page.route('**/api/ai/resolve', async (route) => {
    const body = route.request().postDataJSON();
    const model = resolveModel(
      config,
      preferencesSchema.parse(body.preferences),
      body.task,
      {
        openai: true,
        deepseek: true,
        gemini: true,
        moonshot: true,
        anthropic: true,
      },
      body.image,
    );
    if (!model)
      return route.fulfill({
        status: 400,
        json: { error: '所选模型不支持图像输入' },
      });
    await route.fulfill({
      json: {
        selection: { provider: model.provider, model: model.id },
        backups: [],
        task: body.task,
        image: body.image,
        revision: config.revision,
        expires: Date.now() + 300000,
        token: 'mock-signed-plan',
      },
    });
  });
  await page.route('**/api/ai/admin', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          calls: 0,
          estimatedUSD: 0,
          providers: {},
          entries: [],
          limits: { daily: 30, monthly: 300, usd: 5 },
        },
      });
    const body = route.request().postDataJSON();
    if (body.action === 'save') {
      config = body.config;
      config.revision++;
      return route.fulfill({ json: { config } });
    }
    return route.fulfill({
      json: { connection: { message: 'Mock 测试通过' }, config },
    });
  });
  return sent;
}
async function login(page: Page, admin = false) {
  await page.goto('/#settings');
  await page
    .getByLabel('AI访问身份', { exact: true })
    .selectOption(admin ? 'admin' : 'user');
  await page.getByLabel('AI访问口令', { exact: true }).fill(fakePassword);
  await page.getByRole('button', { name: '登录 AI 身份' }).click();
  await expect(
    page.getByText(admin ? '管理员已登录' : '访问身份已登录', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('允许使用 AI 功能', { exact: true }).check();
}
test('模型中心六家卡片、手机/桌面和深色模式，口令不进入备份', async ({
  page,
}) => {
  await mockAI(page);
  await login(page, true);
  await expect(
    page.getByRole('heading', { name: 'AI 模型中心' }),
  ).toBeVisible();
  expect(await page.locator('.ai-provider').count()).toBe(6);
  await page.getByText('管理员配置', { exact: true }).click();
  await expect(
    page.getByText('API Base URL', { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole('button', { name: '添加自定义服务商', exact: true })
    .click();
  await expect(page.getByLabel('API Base URL')).toBeVisible();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/${test.info().project.name}-ai-center-dark.png`,
    fullPage: true,
  });
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain(fakePassword);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出JSON备份' }).click();
  const download = await promise;
  const fs = await import('node:fs/promises');
  expect(await fs.readFile((await download.path())!, 'utf8')).not.toContain(
    fakePassword,
  );
});
test('模型切换、明确授权后流式聊天和独立周报模型', async ({ page }) => {
  const sent = await mockAI(page);
  await login(page);
  await page
    .getByLabel('聊天模型', { exact: true })
    .selectOption('deepseek|deepseek-flash');
  await page
    .getByLabel('总结模型', { exact: true })
    .selectOption('openai|gpt-4.1-mini');
  await page.getByRole('button', { name: '保存我的模型偏好' }).click();
  await expect(page.getByText('模型偏好已保存，无需重新部署')).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '聊聊今天' }).click();
  await expect(
    page.getByText('本次模型：DeepSeek · deepseek-flash', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('向教练提问').fill('下次训练怎么安排？');
  await page.getByRole('button', { name: '发送问题' }).click();
  expect(sent).toHaveLength(0);
  await page.getByRole('checkbox', { name: /授权向 DeepSeek/ }).check();
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(
    page.getByText('【事实】记录不足。\n【建议】规律训练。', { exact: true }),
  ).toBeVisible();
  expect(sent[0].consent).toEqual(['deepseek']);
  expect(sent[0].stream).toBe(true);
  await page.getByText('每周总结的数据授权', { exact: true }).click();
  await page.getByRole('checkbox', { name: /授权向 OpenAI/ }).check();
  await page.getByRole('button', { name: '生成7天复盘' }).click();
  await expect(page.getByText(/【下周3项建议】/)).toBeVisible();
  expect(sent[1].task).toBe('weekly');
  expect(sent[1].consent).toEqual(['openai']);
});
test('照片估算必须确认保存，图像授权明确标出服务商', async ({ page }) => {
  const sent = await mockAI(page);
  await login(page);
  await page.goto('/');
  await page.getByRole('button', { name: '记录我的一餐' }).click();
  await page.getByRole('button', { name: '照片识别', exact: true }).click();
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('食物照片', { exact: true })
    .setInputFiles({ name: 'food.png', mimeType: 'image/png', buffer: png });
  await expect(
    page.getByText(
      '照片已在本机压缩并移除元数据。仅在勾选授权并点击识别后上传。',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '识别食物并生成草稿' }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: /授权向 OpenAI/ }).check();
  await page.getByRole('button', { name: '识别食物并生成草稿' }).click();
  await expect(page.getByLabel('照片食物1名称')).toHaveValue('估算米饭');
  await page.getByLabel('照片食物1份量').fill('200');
  expect(sent[0].task).toBe('photo');
  expect(sent[0].image).toMatch(/^data:image\/jpeg;base64,/);
  await page
    .getByRole('button', { name: '我已核对估算，确认保存 1 项' })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/#meals');
  await expect(page.getByText('200g · 蛋白质 5.2g')).toBeVisible();
  await expect(page.getByText(/AI照片估算，用户已核对/)).toBeVisible();
});
