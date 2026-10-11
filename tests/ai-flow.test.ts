import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { initialConfig, saveConfig } from '@/lib/ai/config';
import { preferencesSchema } from '@/lib/ai/catalog';
import { createPlan, verifyPlan } from '@/lib/ai/routing';
import { executeAI, validateImage } from '@/lib/ai/service';
import { POST } from '@/app/api/ai/route';
import { cookieName, issueSession } from '@/lib/ai/security';
import { usageSummary } from '@/lib/ai/budget';
beforeEach(() => {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('AI_ACCESS_CODE', 'u'.repeat(32));
  vi.stubEnv('AI_ADMIN_ACCESS_CODE', 'a'.repeat(32));
  vi.stubEnv('AI_SESSION_SECRET', randomUUID());
  vi.stubEnv('AI_STORAGE_NAMESPACE', randomUUID());
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('DEEPSEEK_API_KEY', 'mock-deepseek-key');
  vi.stubEnv('MOONSHOT_API_KEY', 'mock-kimi-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function config() {
  const c = initialConfig();
  c.models.forEach((m) => {
    m.inputPrice = 0.4;
    m.outputPrice = 1.6;
  });
  c.defaults.chat = { provider: 'deepseek', model: 'deepseek-flash' };
  return c;
}
function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      cookie: `${cookieName}=${issueSession('user')}`,
    },
    body: JSON.stringify(body),
  });
}
function response(text = '真实记录不足，请继续记录。') {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }),
  );
}
it('签名授权 → 服务商 → 正确用量 → 去重的完整路由链', async () => {
  const c = await saveConfig(config());
  const plan = createPlan(c, preferencesSchema.parse({}), 'coach', false);
  const fetcher = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetcher);
  const body = {
    task: 'coach',
    text: '怎么训练？',
    plan: plan.token,
    consent: ['deepseek'],
    requestId: randomUUID(),
  };
  const r = await POST(request(body));
  expect(r.status).toBe(200);
  const output = await r.json();
  expect(output.provider).toBe('deepseek');
  expect(output.result.answer).toContain('真实记录不足');
  expect((await usageSummary()).entries[0]).toMatchObject({
    exact: true,
    input: 20,
    output: 10,
  });
  expect((await POST(request(body))).status).toBe(409);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('没有授权备用服务商时绝不转发，明确授权后才切换', async () => {
  const c = config();
  const preferences = preferencesSchema.parse({
    failover: true,
    backups: [{ provider: 'moonshot', model: 'kimi-k2.5' }],
  });
  const plan = createPlan(c, preferences, 'coach', false);
  expect(() => verifyPlan(plan.token, c, 'coach', false, ['deepseek'])).toThrow(
    '尚未授权',
  );
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
    .mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetcher);
  const result = await executeAI(
    { task: 'coach', text: '怎么训练？' },
    verifyPlan(plan.token, c, 'coach', false, ['deepseek', 'moonshot']),
    c,
  );
  expect(result.provider).toBe('moonshot');
  expect(result.fallbackErrors).toHaveLength(1);
  expect((await usageSummary()).calls).toBe(2);
  expect(fetcher.mock.calls[1][0]).toContain('api.moonshot.cn');
});
it('默认关闭故障切换，失败不会偷偷调用其他厂商', async () => {
  const c = config();
  const plan = createPlan(
    c,
    preferencesSchema.parse({
      backups: [{ provider: 'moonshot', model: 'kimi-k2.5' }],
    }),
    'coach',
    false,
  );
  expect(plan.backups).toHaveLength(0);
  const fetcher = vi
    .fn()
    .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    executeAI({ task: 'coach', text: 'hi' }, [plan.selection], c),
  ).rejects.toMatchObject({ code: 'network' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('结构化 JSON 校验失败也记录准确 Token，用量不能丢失', async () => {
  const c = config();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"diet":1}')));
  await expect(
    executeAI({ task: 'weekly', text: '复盘' }, [c.defaults.chat!], c),
  ).rejects.toMatchObject({ code: 'structure' });
  expect((await usageSummary()).entries[0]).toMatchObject({
    input: 20,
    output: 10,
    exact: true,
    outcome: 'structure',
  });
});
it('流开始后失败不会跨厂商再次传输，未知 Token 保守预留', async () => {
  const c = config();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'),
    );
  vi.stubGlobal('fetch', fetcher);
  const delta = vi.fn();
  await expect(
    executeAI(
      { task: 'coach', text: 'hi' },
      [
        { provider: 'deepseek', model: 'deepseek-flash' },
        { provider: 'moonshot', model: 'kimi-k2.5' },
      ],
      c,
      delta,
    ),
  ).rejects.toThrow('未完成');
  expect(delta).toHaveBeenCalledWith('部分');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await usageSummary()).entries[0].exact).toBe(false);
});
it('图片限制同时验证字节类型和解码尺寸', async () => {
  const small = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
  await expect(
    validateImage('data:image/jpeg;base64,' + small.toString('base64')),
  ).resolves.toBeUndefined();
  const large = await sharp({
    create: { width: 2000, height: 2, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await expect(
    validateImage('data:image/png;base64,' + large.toString('base64')),
  ).rejects.toMatchObject({ status: 400 });
});
