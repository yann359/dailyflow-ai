import { type AIRequest, type AIResult } from './contracts';
import type { ProviderId } from './catalog';
export type AIResponse = {
  result: AIResult;
  provider: ProviderId;
  model: string;
  usage: { input: number; output: number; exact: boolean };
  fallbackErrors: string[];
};
export async function aiFetch<T>(
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(55000),
    cache: 'no-store',
  });
  const output = await response.json();
  if (!response.ok) throw new Error(output.error || 'AI 服务暂不可用');
  return output;
}
export async function requestAIWithMeta(
  input: AIRequest,
  onProgress?: (text: string) => void,
): Promise<AIResponse> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      requestId: input.requestId || crypto.randomUUID(),
      stream: !!onProgress && input.task === 'coach',
    }),
    signal: AbortSignal.timeout(55000),
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI 服务暂不可用');
  }
  if (!onProgress || input.task !== 'coach') return response.json();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    text = '';
  let result: AIResponse | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      if (done && buffer.trim()) {
        lines.push(buffer);
        buffer = '';
      }
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'delta') {
          text += event.delta;
          onProgress(text);
        }
        if (event.type === 'result') result = event;
        if (event.type === 'error') throw new Error(event.error);
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!result) throw new Error('AI 没有返回完整结果，未保存对话。');
  return result;
}
export async function requestAI(
  input: AIRequest,
  _code = '',
): Promise<AIResult> {
  void _code;
  return (await requestAIWithMeta(input)).result;
}
