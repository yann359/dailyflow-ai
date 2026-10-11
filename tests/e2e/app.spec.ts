import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '今天，也好好照顾自己。' }),
  ).toBeVisible();
});
async function navigate(page: import('@playwright/test').Page, hash: string) {
  await page.goto(`/#${hash}`);
  await expect(
    page.getByRole('heading', { name: '今天，也好好照顾自己。' }),
  ).not.toBeVisible();
}
test('饮食CRUD、刷新持久化与零溢出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '记录我的一餐' }).click();
  await page.getByLabel('选择食物').selectOption('food-0');
  await page.getByLabel('实际食用量', { exact: true }).fill('100');
  await page.getByRole('button', { name: '保存这一餐', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await navigate(page, 'meals');
  await expect(page.getByText('100g · 蛋白质 13.3g')).toBeVisible();
  await page.reload();
  await expect(page.getByText('100g · 蛋白质 13.3g')).toBeVisible();
  await page.getByRole('button', { name: '编辑鸡蛋记录' }).click();
  await page.getByLabel('实际食用量', { exact: true }).fill('50');
  await page.getByRole('button', { name: '保存这一餐', exact: true }).click();
  await expect(page.getByText('50g · 蛋白质 6.7g')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '删除鸡蛋记录' }).click();
  await expect(page.getByText('50g · 蛋白质 6.7g')).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('自然语言待确认、习惯打卡和本地周报', async ({ page }) => {
  await page.getByRole('button', { name: '记录我的一餐' }).click();
  await page.getByRole('button', { name: '一句话记录' }).click();
  await page.getByLabel('饮食描述').fill('2个鸡蛋、2片吐司、250ml牛奶');
  await page.getByRole('button', { name: '本地规则解析' }).click();
  await expect(
    page.getByRole('button', { name: '确认并保存 3 项' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '确认并保存 3 项' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '完成好好喝水', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: '取消好好喝水', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '聊聊今天' }).click();
  await expect(page.getByText('本地规则 · AI未连接')).toBeVisible();
  await page.getByRole('button', { name: '生成7天复盘' }).click();
  await expect(
    page.getByText(/这是本地规则复盘，没有调用AI模型/),
  ).toBeVisible();
});
test('体重趋势、主题与备份下载', async ({ page }) => {
  await navigate(page, 'trends');
  await page.getByRole('button', { name: '记录身体数据' }).click();
  await page.getByLabel('体重 kg', { exact: true }).fill('74.5');
  await page.getByLabel('腰围 cm', { exact: true }).fill('80');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(
    page.getByText('74.5 kg', { exact: false }).last(),
  ).toBeVisible();
  await expect(
    page.getByText('已有1个数据点，再记录一次即可绘图。'),
  ).toBeVisible();
  await navigate(page, 'settings');
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出JSON备份' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/dailyflow-backup-.*json/);
  await page.screenshot({
    path: `artifacts/${test.info().project.name}-settings-dark.png`,
    fullPage: true,
  });
});
test('训练实际组记录与休息计时', async ({ page }) => {
  await navigate(page, 'workouts');
  await page.getByLabel('俯卧撑第1组次数', { exact: true }).fill('8');
  await page.getByLabel('俯卧撑第1组完成', { exact: true }).check();
  await page.getByRole('button', { name: '休息 60 秒' }).click();
  await expect(page.getByRole('button', { name: '暂停倒计时' })).toBeVisible();
  await page.getByRole('button', { name: '完成并保存训练' }).click();
  await expect(page.getByText('今天的训练已记录，辛苦了')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('俯卧撑第1组次数', { exact: true })).toHaveValue(
    '8',
  );
  await expect(
    page.getByLabel('俯卧撑第1组完成', { exact: true }),
  ).toBeChecked();
});
test('PWA注册、离线刷新与移动布局', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '今天，也好好照顾自己。' }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/${test.info().project.name}-home.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '今天，也好好照顾自己。' }),
  ).toBeVisible();
  await expect(page.getByText('离线 · 本机可用')).toBeVisible();
  await context.setOffline(false);
});
