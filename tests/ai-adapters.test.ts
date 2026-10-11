import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { createProvider, keyNames, consumeSSE } from '@/lib/ai/provider';
import { initialConfig } from '@/lib/ai/config';
import { providerIds } from '@/lib/ai/catalog';
const mocks = vi.hoisted(() => ({
  openai: vi.fn(),
  google: vi.fn(),
  googleStream: vi.fn(),
}));
vi.mock('openai', () => {
  class APIError extends Error {}
  return {
    default: class {
      static APIError = APIError;
      responses = { create: mocks.openai };
      models = { list: async () => ({ data: [{ id: 'official-id' }] }) };
    },
  };
});
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mocks.google,
      generateContentStream: mocks.googleStream,
      list: async function* () {
        yield {
          name: 'models/gemini-3.8-flash',
          displayName: 'Flash',
          supportedActions: ['generateContent'],
        };
      },
    };
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const input = { model: 'test-model', instructions: 'system', text: 'hello' };
const image = 'data:image/jpeg;base64,/9j/';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const sse = (items: unknown[]) =>
  new Response(
    items.map((x) => `data: ${JSON.stringify(x)}\n\n`).join('') +
      'data: [DONE]\n\n',
  );
describe('六家官方接口的 Mock 合同验证（没有真实凭证）', () => {
  it('OpenAI 使用 Responses，不存储响应，支持流与官方用量', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock');
    mocks.openai.mockResolvedValueOnce({
      status: 'completed',
      output_text: '回答',
      usage: { input_tokens: 5, output_tokens: 3 },
    });
    const p = createProvider('openai');
    expect((await p.generateText(input)).usage.exact).toBe(true);
    expect(mocks.openai.mock.calls[0][0]).toMatchObject({
      store: false,
      input: [{ role: 'user' }],
    });
    mocks.openai.mockResolvedValueOnce(
      (async function* () {
        yield { type: 'response.output_text.delta', delta: '你好' };
        yield {
          type: 'response.completed',
          response: { usage: { input_tokens: 5, output_tokens: 2 } },
        };
      })(),
    );
    const delta = vi.fn();
    const result = await p.streamText(input, delta);
    expect(delta).toHaveBeenCalledWith('你好');
    expect(result.text).toBe('你好');
  });
  it('Gemini 使用 Google GenAI SDK，图片 inlineData，JSON 原生输出', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'mock');
    mocks.google.mockResolvedValue({
      text: '{"answer":"ok"}',
      usageMetadata: {
        promptTokenCount: 4,
        candidatesTokenCount: 2,
        thoughtsTokenCount: 3,
      },
    });
    const p = createProvider('gemini');
    const result = await p.generateStructuredData(
      { ...input, image },
      z.object({ answer: z.string() }),
    );
    expect(result.data.answer).toBe('ok');
    expect(result.usage.output).toBe(5);
    expect(
      mocks.google.mock.calls[0][0].contents[0].parts[1].inlineData,
    ).toEqual({ mimeType: 'image/jpeg', data: '/9j/' });
    expect(mocks.google.mock.calls[0][0].config.responseMimeType).toBe(
      'application/json',
    );
    mocks.googleStream.mockResolvedValue(
      (async function* () {
        yield { text: 'a' };
        yield {
          text: 'b',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
        };
      })(),
    );
    expect((await p.streamText(input, () => {})).text).toBe('ab');
  });
  it.each(['deepseek', 'moonshot', 'ark'] as const)(
    '%s 使用独立 Chat Completions 方言，获取 JSON 和 Token',
    async (id) => {
      vi.stubEnv(keyNames[id], 'mock');
      const fetcher = vi.fn().mockResolvedValue(
        json({
          choices: [
            {
              message: { content: '{"answer":"ok"}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
      );
      vi.stubGlobal('fetch', fetcher);
      const p = createProvider(id);
      const result = await p.generateStructuredData(
        { ...input, model: id === 'moonshot' ? 'kimi-k2.5' : input.model },
        z.object({ answer: z.string() }),
      );
      const url = fetcher.mock.calls[0][0];
      const body = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(url).toContain('/chat/completions');
      expect(body.response_format.type).toBe('json_object');
      expect(body.messages[0].content).toContain('JSON');
      if (id === 'moonshot') expect(body.thinking.type).toBe('disabled');
      if (id === 'ark') {
        expect(body.max_completion_tokens).toBe(1800);
        expect(body.max_tokens).toBeUndefined();
        expect(body.thinking.type).toBe('disabled');
      }
      expect(result.usage).toEqual({ input: 10, output: 4, exact: true });
    },
  );
  it('Claude 使用 Messages、独立头与原生 JSON Schema，图片 base64', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'mock');
    const fetcher = vi.fn().mockResolvedValue(
      json({
        content: [{ type: 'text', text: '{"answer":"ok"}' }],
        usage: { input_tokens: 5, output_tokens: 4 },
        stop_reason: 'end_turn',
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    await createProvider('anthropic').generateStructuredData(
      { ...input, image },
      z.object({ answer: z.string().max(100) }),
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(options.body);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content[1].source.type).toBe('base64');
    expect(
      body.output_config.format.schema.properties.answer.maxLength,
    ).toBeUndefined();
  });
  it.each(['deepseek', 'moonshot', 'ark', 'anthropic'] as const)(
    '%s 的 SSE 流式回复保留准确用量',
    async (id) => {
      vi.stubEnv(keyNames[id], 'mock');
      const events =
        id === 'anthropic'
          ? [
              {
                type: 'message_start',
                message: { usage: { input_tokens: 5, output_tokens: 0 } },
              },
              {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'ok' },
              },
              {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn' },
                usage: { output_tokens: 2 },
              },
              { type: 'message_stop' },
            ]
          : [
              { choices: [{ delta: { content: 'ok' }, finish_reason: null }] },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
              {
                choices: [],
                usage: { prompt_tokens: 5, completion_tokens: 2 },
              },
            ];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(events)));
      const delta = vi.fn();
      const r = await createProvider(id).streamText(input, delta);
      expect(r.text).toBe('ok');
      expect(r.usage).toEqual({ input: 5, output: 2, exact: true });
    },
  );
  it.each([
    [401, 'auth'],
    [402, 'credit'],
    [404, 'model'],
  ] as const)('HTTP %s 失败转换为明确错误，隐藏密钥', async (status, code) => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'mock');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: { message: 'secret' } }, status)),
    );
    await expect(
      createProvider('deepseek').generateText(input),
    ).rejects.toMatchObject({ code });
  });
  it('网络超时转换为明确错误且不重试', async () => {
    vi.stubEnv('ARK_API_KEY', 'mock');
    const fetcher = vi
      .fn()
      .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      createProvider('ark').generateText(input),
    ).rejects.toMatchObject({ code: 'network', status: 504 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('JSON 错误拒绝保存；流式错误/截断拒绝伪成功', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'mock');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({ choices: [{ message: { content: '{"answer":1}' } }] }),
      )
      .mockResolvedValueOnce(
        sse([
          {
            choices: [
              { delta: { content: 'partial' }, finish_reason: 'length' },
            ],
          },
        ]),
      );
    vi.stubGlobal('fetch', fetcher);
    const p = createProvider('deepseek');
    await expect(
      p.generateStructuredData(input, z.object({ answer: z.string() })),
    ).rejects.toMatchObject({ code: 'structure' });
    await expect(p.streamText(input, () => {})).rejects.toThrow('未完成');
    await expect(
      consumeSSE(
        sse([{ type: 'error', error: { type: 'insufficient_balance' } }]),
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'credit' });
  });
  it('各服务商未配置密钥时全部关闭', () => {
    for (const id of providerIds) {
      vi.stubEnv(keyNames[id], '');
      expect(() => createProvider(id, initialConfig())).toThrow('尚未配置');
    }
  });
});
