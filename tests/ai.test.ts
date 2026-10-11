import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { aiStatus, validAccessCode, memoryLimit } from '@/lib/ai/security';
import {
  coachResultSchema,
  mealResultSchema,
  labelResultSchema,
} from '@/lib/ai/contracts';
import { GET, POST } from '@/app/api/ai/route';
const mockGenerate = vi.fn();
const mockStream = vi.fn();
vi.mock('@/lib/ai/provider', () => ({
  createOpenAIProvider: () => ({
    name: 'openai',
    generate: mockGenerate,
    stream: mockStream,
  }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function enable() {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
  vi.stubEnv('AI_ACCESS_CODE', 'test-code');
  vi.stubEnv('VERCEL', '');
}
function request(
  body: unknown,
  code = 'test-code',
  origin = 'http://localhost:3000',
) {
  return new NextRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: origin,
      'x-ai-access-code': code,
    },
    body: JSON.stringify(body),
  });
}
describe('AI状态、模拟接口和安全降级', () => {
  it('无凭证安全降级，状态不包含秘密', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(aiStatus().enabled).toBe(false);
    expect((await GET()).status).toBe(200);
    expect((await POST(request({ task: 'coach', text: 'hi' }))).status).toBe(
      503,
    );
    expect(JSON.stringify(aiStatus())).not.toContain('API_KEY');
  });
  it('Vercel缺少分布式限流时关闭AI', () => {
    enable();
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(aiStatus().enabled).toBe(false);
  });
  it('安全验证口令', () => {
    enable();
    expect(validAccessCode('test-code')).toBe(true);
    expect(validAccessCode('wrong')).toBe(false);
    expect(validAccessCode('')).toBe(false);
  });
  it('拒绝跨站和错误口令', async () => {
    enable();
    expect((await POST(request({ task: 'coach' }, 'wrong'))).status).toBe(401);
    expect(
      (
        await POST(
          request({ task: 'coach' }, 'test-code', 'https://attacker.example'),
        )
      ).status,
    ).toBe(403);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
  it('拒绝无效任务、过长文本和缺失照片', async () => {
    enable();
    for (const body of [
      { task: 'delete-all' },
      { task: 'coach', text: 'x'.repeat(1001) },
      { task: 'label' },
      { task: 'meal', text: '' },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
  it('模拟结构化AI成功返回', async () => {
    enable();
    mockGenerate.mockResolvedValue({
      facts: ['已记录2餐'],
      estimates: ['蛋白质约30g'],
      advice: ['继续规律记录'],
    });
    const response = await POST(
      request({ task: 'coach', text: '蛋白质够吗？' }),
    );
    expect(response.status).toBe(200);
    expect(
      coachResultSchema.parse((await response.json()).result).facts[0],
    ).toBe('已记录2餐');
    expect(mockGenerate.mock.calls[0][0].text).toBe('蛋白质够吗？');
  });
  it('模拟失败不泄露提供方原始错误', async () => {
    enable();
    mockGenerate.mockRejectedValue(new Error('secret-key-not-to-leak'));
    const response = await POST(request({ task: 'coach', text: 'hi' }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret-key');
  });
  it('模拟流式响应包含增量和校验后结果', async () => {
    enable();
    mockStream.mockImplementation(async (_, delta) => {
      delta('{"facts":');
      return { facts: [], estimates: [], advice: ['记录一餐'] };
    });
    const response = await POST(
      request({ task: 'weekly', text: '复盘', stream: true }),
    );
    const text = await response.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('"type":"result"');
  });
  it('输出校验拒绝不合理营养与份量', () => {
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
  });
  it('限流达到上限拒绝，过期后恢复', () => {
    const key = crypto.randomUUID();
    expect(memoryLimit(key, 2, 1000, 100)).toBe(true);
    expect(memoryLimit(key, 2, 1000, 101)).toBe(true);
    expect(memoryLimit(key, 2, 1000, 102)).toBe(false);
    expect(memoryLimit(key, 2, 1000, 1101)).toBe(true);
  });
});
