import { type AIRequest, type AIResult } from './contracts';
export async function requestAI(
  input: AIRequest,
  code: string,
  onProgress?: (count: number) => void,
): Promise<AIResult> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ai-access-code': code },
    body: JSON.stringify({ ...input, stream: !!onProgress }),
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'AI服务暂不可用');
  }
  if (!onProgress) return (await response.json()).result;
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    count = 0;
  let result: AIResult | undefined;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === 'delta') {
        count += event.delta.length;
        onProgress(count);
      }
      if (event.type === 'result') result = event.result;
      if (event.type === 'error') throw new Error(event.error);
    }
    if (done) break;
  }
  if (!result) throw new Error('AI没有返回完整结果');
  return result;
}
