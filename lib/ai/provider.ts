export { portableSchema } from './schema';
import {
  openAIRequest,
  geminiRequest,
  claudeRequest,
  compatibleRequests,
} from './adapters/requests';
import OpenAI from 'openai';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { z } from 'zod';
import { type Model, type ProviderId, type AIConfig } from './catalog';
import { AIError, providerError, safeError } from './errors';
import { customFetch } from './ssrf';
export type Usage = { input: number; output: number; exact: boolean };
export type Generation = { text: string; usage: Usage };
export type ProviderInput = {
  model: string;
  instructions: string;
  text: string;
  image?: string;
  maxOutput?: number;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
};
export interface AIProvider {
  name: ProviderId;
  generateText(input: ProviderInput): Promise<Generation>;
  streamText(
    input: ProviderInput,
    onDelta: (text: string) => void,
  ): Promise<Generation>;
  analyzeImage(input: ProviderInput): Promise<Generation>;
  generateStructuredData<T>(
    input: ProviderInput,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; usage: Usage }>;
  testConnection(model: string): Promise<Generation>;
  getModels(): Promise<{ id: string; name: string }[]>;
}
export const keyNames: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  ark: 'ARK_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  custom: 'CUSTOM_AI_API_KEY',
};
export function configuredProviders() {
  return Object.fromEntries(
    Object.entries(keyNames).map(([id, env]) => [id, !!process.env[env]]),
  ) as Record<ProviderId, boolean>;
}
type Wire = {
  type?: string;
  error?: { type?: string };
  delta?: { text?: string; type?: string; stop_reason?: string };
  message?: { usage?: Tokens };
  usage?: Tokens;
  choices?: {
    message?: { content?: string };
    delta?: { content?: string };
    finish_reason?: string;
  }[];
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  data?: { id: string; display_name?: string }[];
};
type Tokens = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
const emptyUsage = (): Usage => ({ input: 0, output: 0, exact: false });
function usageNumbers(input: unknown, output: unknown): Usage {
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return {
    input: valid(input) ? input : 0,
    output: valid(output) ? output : 0,
    exact: valid(input) && valid(output),
  };
}
function readUsage(w: Wire, previous = emptyUsage()): Usage {
  const u = w.message?.usage || w.usage;
  if (!u) return previous;
  const input = u.prompt_tokens ?? u.input_tokens,
    output = u.completion_tokens ?? u.output_tokens;
  const cached =
    (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  return usageNumbers(
    input === undefined
      ? previous.exact
        ? previous.input
        : undefined
      : input + cached,
    output === undefined
      ? previous.exact
        ? previous.output
        : undefined
      : output,
  );
}
async function boundedJSON(r: Response): Promise<Wire> {
  const reader = r.body?.getReader();
  if (!reader) throw new AIError('error', '模型没有返回数据。');
  let result = '';
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
    if (result.length > 2000000) {
      await reader.cancel();
      throw new AIError('error', '模型响应超过限制。');
    }
  }
  return JSON.parse(result + decoder.decode()) as Wire;
}
export async function consumeSSE(r: Response, onEvent: (data: Wire) => void) {
  const reader = r.body?.getReader();
  if (!reader) throw new AIError('error', '没有流式响应。');
  const decoder = new TextDecoder();
  let buffer = '';
  let size = 0;
  const process = (block: string) => {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (data && data !== '[DONE]') {
      const event = JSON.parse(data) as Wire;
      if (event.type === 'error' || event.error)
        throw providerError(502, JSON.stringify(event.error));
      onEvent(event);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      size += value?.byteLength || 0;
      if (size > 2000000) throw new AIError('error', '流式响应超过限制。');
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        process(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
      }
      if (done) {
        if (buffer.trim()) process(buffer);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function createProvider(id: ProviderId, config?: AIConfig): AIProvider {
  const key = process.env[keyNames[id]];
  if (!key) throw new AIError('config', '此服务商尚未配置服务端密钥。', 503);
  if (id === 'custom' && !config?.custom)
    throw new AIError('config', '自定义服务商已停用或尚未保存配置。', 400);
  if (!Number.isFinite(Number(process.env.AI_TIMEOUT_MS || 25000)))
    throw new AIError('config', 'AI_TIMEOUT_MS 必须是有效毫秒数。', 503);
  const timeout = Math.min(
    45000,
    Math.max(1000, Number(process.env.AI_TIMEOUT_MS || 25000)),
  );
  const bases: Partial<Record<ProviderId, string>> = {
    deepseek: 'https://api.deepseek.com',
    moonshot:
      process.env.MOONSHOT_REGION === 'global'
        ? 'https://api.moonshot.ai/v1'
        : 'https://api.moonshot.cn/v1',
    ark: 'https://ark.cn-beijing.volces.com/api/v3',
    anthropic: 'https://api.anthropic.com/v1',
    custom: config?.custom?.baseURL.replace(/\/$/, ''),
  };
  const request = async (
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ) => {
    const base = bases[id];
    if (!base) throw new AIError('config', '接口地址未配置。', 400);
    const headers: Record<string, string> =
      id === 'anthropic'
        ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${key}` };
    headers['Content-Type'] = 'application/json';
    const init: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
      redirect: 'error',
      cache: 'no-store',
    };
    try {
      const r = await (id === 'custom'
        ? customFetch(base + path, init)
        : fetch(base + path, init));
      if (!r.ok) {
        const error = await boundedJSON(r).catch(() => ({}));
        throw providerError(r.status, JSON.stringify(error));
      }
      return r;
    } catch (error) {
      throw safeError(error);
    }
  };
  const openai =
    id === 'openai'
      ? new OpenAI({ apiKey: key, maxRetries: 0, timeout })
      : undefined;
  const google =
    id === 'gemini'
      ? new GoogleGenAI({
          apiKey: key,
          httpOptions: { timeout, retryOptions: { attempts: 1 } },
        })
      : undefined;
  const generate = async (
    input: ProviderInput,
    onDelta?: (delta: string) => void,
  ): Promise<Generation> => {
    input = {
      ...input,
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    };
    try {
      if (openai) {
        const params = openAIRequest(input);
        if (onDelta) {
          const stream = await openai.responses.create(
            { ...params, stream: true },
            { signal: input.signal },
          );
          let text = '';
          let usage = emptyUsage();
          let complete = false;
          for await (const event of stream) {
            if (event.type === 'response.output_text.delta') {
              text += event.delta;
              onDelta(event.delta);
            }
            if (event.type === 'response.completed') {
              complete = true;
              usage = usageNumbers(
                event.response.usage?.input_tokens,
                event.response.usage?.output_tokens,
              );
            }
            if (
              event.type === 'response.failed' ||
              event.type === 'response.incomplete' ||
              event.type === 'error'
            )
              throw new AIError('error', '模型未完成输出。');
          }
          if (!complete || !text)
            throw new AIError('error', '流式回复没有完整结束。');
          return { text, usage };
        }
        const r = await openai.responses.create(params, {
          signal: input.signal,
        });
        if (r.status !== 'completed' || !r.output_text)
          throw new AIError('error', '模型未完成输出。');
        return {
          text: r.output_text,
          usage: usageNumbers(r.usage?.input_tokens, r.usage?.output_tokens),
        };
      }
      if (google) {
        const params = geminiRequest(input);
        let text = '';
        let last: GenerateContentResponse | undefined;
        if (onDelta) {
          for await (const chunk of await google.models.generateContentStream(
            params,
          )) {
            last = chunk;
            const delta = chunk.text || '';
            text += delta;
            if (delta) onDelta(delta);
          }
        } else {
          last = await google.models.generateContent(params);
          text = last.text || '';
        }
        if (
          !text ||
          last?.candidates?.some(
            (c) => c.finishReason && c.finishReason !== 'STOP',
          )
        )
          throw new AIError('error', 'Gemini 未返回完整结果。');
        const u = last?.usageMetadata;
        return {
          text,
          usage: usageNumbers(
            u?.promptTokenCount,
            u?.candidatesTokenCount === undefined
              ? undefined
              : u.candidatesTokenCount + (u.thoughtsTokenCount || 0),
          ),
        };
      }
      const body =
        id === 'anthropic'
          ? claudeRequest(input, !!onDelta)
          : compatibleRequests[id as keyof typeof compatibleRequests](
              input,
              !!onDelta,
            );
      const r = await request(
        id === 'anthropic' ? '/messages' : '/chat/completions',
        body,
        input.signal,
      );
      if (!onDelta) {
        const w = await boundedJSON(r);
        if (
          w.stop_reason === 'max_tokens' ||
          w.choices?.[0]?.finish_reason === 'length'
        )
          throw new AIError('error', '输出被截断，请缩短问题。');
        const text =
          id === 'anthropic'
            ? w.content
                ?.filter((c) => c.type === 'text')
                .map((c) => c.text || '')
                .join('')
            : w.choices?.[0]?.message?.content;
        if (!text) throw new AIError('error', '模型未返回文字。');
        return { text, usage: readUsage(w) };
      }
      let text = '';
      let usage = emptyUsage();
      let complete = false;
      let truncated = false;
      await consumeSSE(r, (w) => {
        const delta =
          id === 'anthropic'
            ? w.delta?.type === 'text_delta'
              ? w.delta.text
              : undefined
            : w.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        usage = readUsage(w, usage);
        if (w.type === 'message_stop' || w.choices?.[0]?.finish_reason)
          complete = true;
        if (
          w.delta?.stop_reason === 'max_tokens' ||
          w.choices?.[0]?.finish_reason === 'length'
        )
          truncated = true;
      });
      if (!complete || truncated || !text)
        throw new AIError('error', '流式回复未完成或被截断。');
      return { text, usage };
    } catch (error) {
      if (error instanceof OpenAI.APIError)
        throw providerError(error.status || 502, error.code || '');
      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        !(error instanceof AIError)
      )
        throw providerError(
          Number(error.status),
          error instanceof Error ? error.message : '',
        );
      throw safeError(error);
    }
  };
  return {
    name: id,
    generateText: (input) => generate(input),
    streamText: (input, delta) => generate(input, delta),
    analyzeImage: (input) => {
      if (!input.image) throw new AIError('input', '请上传图片。', 400);
      return generate(input);
    },
    async generateStructuredData(input, schema) {
      const r = await generate({ ...input, schema: z.toJSONSchema(schema) });
      let data;
      try {
        data = schema.parse(JSON.parse(r.text));
      } catch {
        throw new AIError('structure', 'JSON 不符合结构，未保存记录。');
      }
      return { data, usage: r.usage };
    },
    testConnection: (model) =>
      generate({
        model,
        instructions: '请只回复 OK，不调用工具。',
        text: '连接测试',
        maxOutput: 64,
      }),
    async getModels() {
      if (openai) {
        const list = await openai.models.list();
        return list.data.slice(0, 150).map((m) => ({ id: m.id, name: m.id }));
      }
      if (google) {
        const pager = await google.models.list({ config: { pageSize: 100 } });
        const models: { id: string; name: string }[] = [];
        for await (const m of pager) {
          if (m.supportedActions?.includes('generateContent') && m.name)
            models.push({
              id: m.name.replace(/^models\//, ''),
              name: m.displayName || m.name,
            });
          if (models.length >= 150) break;
        }
        return models;
      }
      if (id === 'ark')
        return (config?.models || [])
          .filter((m) => m.provider === id)
          .map((m) => ({ id: m.id, name: m.name }));
      const w = await boundedJSON(await request('/models'));
      return (w.data || [])
        .slice(0, 150)
        .map((m) => ({ id: m.id, name: m.display_name || m.id }));
    },
  };
}
export function ensureCapabilities(
  model: Model,
  image: boolean,
  structured: boolean,
  stream: boolean,
) {
  if (
    !model.capabilities.text ||
    (image && !model.capabilities.image) ||
    (structured && !model.capabilities.structured) ||
    (stream && !model.capabilities.stream)
  )
    throw new AIError(
      'capability',
      '模型不支持本次任务，请选择具有相应能力的模型。',
      400,
    );
}
