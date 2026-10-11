import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  aiStatus,
  validAccessCode,
  memoryLimit,
  issueSession,
  cookieName,
} from '@/lib/ai/security';
import { initialConfig, saveConfig, loadConfig } from '@/lib/ai/config';
import { createPlan, verifyPlan } from '@/lib/ai/routing';
import { preferencesSchema, resolveModel } from '@/lib/ai/catalog';
import { GET, POST } from '@/app/api/ai/route';
import { POST as adminPOST } from '@/app/api/ai/admin/route';
import { POST as loginPOST } from '@/app/api/ai/session/route';
import { claimRequest, reserve, usageSummary } from '@/lib/ai/budget';
import { providerError, AIError } from '@/lib/ai/errors';
import { publicIP, validateCustomURL } from '@/lib/ai/ssrf';
import { validateImage } from '@/lib/ai/service';
import { ensureCapabilities } from '@/lib/ai/provider';
import { mealResultSchema, labelResultSchema } from '@/lib/ai/contracts';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const origin = 'http://localhost:3000';
function enable() {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('AI_STORAGE_NAMESPACE', randomUUID());
  vi.stubEnv('OPENAI_API_KEY', 'secret-provider-key-never-public');
  vi.stubEnv('AI_ACCESS_CODE', 'u'.repeat(32));
  vi.stubEnv('AI_ADMIN_ACCESS_CODE', 'a'.repeat(32));
  vi.stubEnv('AI_SESSION_SECRET', randomUUID());
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
}
function request(
  body: unknown,
  role: 'user' | 'admin' | null = 'user',
  path = '/api/ai',
  site = origin,
) {
  return new NextRequest(origin + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: site,
      ...(role ? { cookie: `${cookieName}=${issueSession(role)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe('AI 安全、路由和预算', () => {
  it('无凭证本地降级，匿名状态不含密钥或管理配置', async () => {
    enable();
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(aiStatus().enabled).toBe(false);
    const response = await GET(new NextRequest(origin + '/api/ai'));
    const body = await response.json();
    expect(body.enabled).toBe(false);
    expect(body.config).toBeUndefined();
    expect(body.configured).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('secret-provider-key');
  });
  it('生产缺少 Redis 或弱口令不能启用付费 API', () => {
    enable();
    vi.stubEnv('VERCEL', '1');
    expect(aiStatus().enabled).toBe(false);
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('AI_ACCESS_CODE', 'short');
    expect(aiStatus().enabled).toBe(false);
    expect(validAccessCode('short')).toBe(false);
    vi.stubEnv('AI_ACCESS_CODE', 'u'.repeat(32));
    vi.stubEnv('AI_SESSION_SECRET', 'u'.repeat(32));
    expect(aiStatus().enabled).toBe(false);
  });
  it('匿名访问、普通身份管理和跨站调用均被拒绝', async () => {
    enable();
    expect((await POST(request({}, null))).status).toBe(401);
    expect(
      (await adminPOST(request({ action: 'models', provider: 'openai' })))
        .status,
    ).toBe(403);
    expect(
      (await POST(request({}, 'user', '/api/ai', 'https://attacker.example')))
        .status,
    ).toBe(403);
  });
  it('登录返回 HttpOnly 会话，响应无口令，角色隔离', async () => {
    enable();
    const r = await loginPOST(
      request({ code: 'u'.repeat(32), role: 'user' }, null, '/api/ai/session'),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await r.text()).not.toContain('u'.repeat(32));
    expect(
      (await loginPOST(request({ code: 'u'.repeat(32), role: 'admin' }, null)))
        .status,
    ).toBe(401);
  });
  it('无效任务、缺图、过长文本、超限请求被拒绝', async () => {
    enable();
    for (const body of [
      { task: 'delete-all' },
      { task: 'label' },
      { task: 'meal', text: '' },
      { task: 'coach', text: 'x'.repeat(1001) },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(
      (await POST(request({ task: 'coach', text: 'x'.repeat(2600000) })))
        .status,
    ).toBe(413);
  });
  it('模型切换即时生效，图像能力筛选，智能推荐只选一个', () => {
    enable();
    const config = initialConfig();
    const preferences = preferencesSchema.parse({
      chat: { provider: 'deepseek', model: 'deepseek-flash' },
    });
    vi.stubEnv('DEEPSEEK_API_KEY', 'mock');
    expect(
      createPlan(config, preferences, 'coach', false).selection.provider,
    ).toBe('deepseek');
    vi.stubEnv('DEEPSEEK_API_KEY', 'mock');
    expect(
      resolveModel(config, preferences, 'coach', { deepseek: true })?.id,
    ).toBe('deepseek-flash');
    preferences.image = preferences.chat;
    expect(
      resolveModel(config, preferences, 'photo', { deepseek: true }, true),
    ).toBeUndefined();
    config.models[0].inputPrice = 1;
    config.models[0].outputPrice = 2;
    expect(
      resolveModel(config, { ...preferences, mode: 'auto' }, 'coach', {
        openai: true,
      })?.provider,
    ).toBe('openai');
  });
  it('授权绑定服务商、任务、配置版本，禁止静默转发', () => {
    enable();
    const config = initialConfig();
    const plan = createPlan(
      config,
      preferencesSchema.parse({}),
      'coach',
      false,
    );
    expect(() => verifyPlan(plan.token, config, 'coach', false, [])).toThrow(
      '尚未授权',
    );
    expect(() =>
      verifyPlan(plan.token, config, 'weekly', false, ['openai']),
    ).toThrow('已变化');
    expect(
      verifyPlan(plan.token, config, 'coach', false, ['openai']),
    ).toHaveLength(1);
    expect(() =>
      verifyPlan(plan.token + 'tamper', config, 'coach', false, ['openai']),
    ).toThrow('无效');
  });
  it('模型能力和图片魔数检查阻止错误调用', async () => {
    expect(() =>
      ensureCapabilities(initialConfig().models[1], true, true, false),
    ).toThrow('不支持');
    await expect(validateImage('data:image/jpeg;base64,YWJj')).rejects.toThrow(
      '不符合',
    );
    await expect(validateImage('https://internal/image')).rejects.toThrow(
      '无效',
    );
  });
  it('错误区分无效密钥、余额、模型、限流，正文不泄露', () => {
    for (const [status, code] of [
      [401, 'auth'],
      [402, 'credit'],
      [404, 'model'],
      [429, 'rate'],
    ] as const) {
      const e = providerError(status, 'secret-from-provider');
      expect(e.code).toBe(code);
      expect(e.message).not.toContain('secret');
    }
  });
  it('同一请求编号不会重复执行', async () => {
    enable();
    const id = randomUUID();
    await claimRequest(id, 'private');
    await expect(claimRequest(id, 'private')).rejects.toMatchObject({
      status: 409,
    });
  });
  it('并发预算原子预留，超限停止；未知用量保留估算', async () => {
    enable();
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '0.01');
    const model = {
      ...initialConfig().models[0],
      inputPrice: 1,
      outputPrice: 1,
    };
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => reserve(model, 5000, 1000)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const successful = results.find((r) => r.status === 'fulfilled');
    if (successful?.status === 'fulfilled')
      await successful.value(undefined, 'network');
    const usage = await usageSummary();
    expect(usage.estimatedUSD).toBeGreaterThanOrEqual(0.006);
    expect(usage.entries[0].exact).toBe(false);
    expect(JSON.stringify(usage)).not.toContain('private');
  });
  it('缺失价格不能绕过费用保护', async () => {
    enable();
    await expect(
      reserve(initialConfig().models[0], 20, 20),
    ).rejects.toMatchObject({ code: 'budget' });
  });
  it('拒绝 SSRF 私网、映射 IPv6、元数据、非白名单和非 HTTPS', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      '100.64.0.1',
      '0.0.0.0',
    ])
      expect(publicIP(ip)).toBe(false);
    expect(publicIP('8.8.8.8')).toBe(true);
    for (const url of [
      'http://example.com/v1',
      'https://localhost/v1',
      'https://169.254.169.254/v1',
      'https://example.com/?key=x',
    ])
      await expect(validateCustomURL(url)).rejects.toBeInstanceOf(AIError);
  });
  it('配置支持保存及版本冲突检测，无密钥字段', async () => {
    enable();
    const before = await loadConfig();
    const next = await saveConfig({
      ...before,
      defaults: { ...before.defaults, chat: null },
    });
    expect((await loadConfig()).defaults.chat).toBeNull();
    await expect(saveConfig(before)).rejects.toMatchObject({ status: 409 });
    expect(next.revision).toBe(before.revision + 1);
  });
  it('输出校验拒绝负数营养和份量，原有限流过期后恢复', () => {
    expect(
      mealResultSchema.safeParse({
        items: [{ foodId: 'a', name: 'a', amount: -1, unit: 'g', note: '' }],
        warnings: [],
      }).success,
    ).toBe(false);
    expect(
      labelResultSchema.safeParse({
        name: 'a',
        unit: 'g',
        nutrition: { calories: -1, protein: 0, fat: 0, carbs: 0 },
        notes: [],
      }).success,
    ).toBe(false);
    const id = randomUUID();
    expect(memoryLimit(id, 1, 1000, 100)).toBe(true);
    expect(memoryLimit(id, 1, 1000, 101)).toBe(false);
    expect(memoryLimit(id, 1, 1000, 1101)).toBe(true);
  });
});
