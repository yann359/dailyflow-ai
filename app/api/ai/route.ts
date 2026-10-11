import { NextRequest, NextResponse } from 'next/server';
import { aiRequestSchema } from '@/lib/ai/contracts';
import { createOpenAIProvider } from '@/lib/ai/provider';
import { aiStatus, validAccessCode, consumeBudget } from '@/lib/ai/security';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json(aiStatus(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function POST(request: NextRequest) {
  const fail = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status });
  if (!aiStatus().enabled) return fail(aiStatus().reason, 503);
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin)
    return fail('请求来源不正确', 403);
  if (!validAccessCode(request.headers.get('x-ai-access-code') || ''))
    return fail('AI访问口令不正确', 401);
  if (!request.headers.get('content-type')?.includes('application/json'))
    return fail('只接受JSON请求', 415);
  if (Number(request.headers.get('content-length') || 0) > 2500000)
    return fail('图片或数据过大', 413);
  try {
    const raw = await request.text();
    if (raw.length > 2500000) return fail('图片或数据过大', 413);
    const input = aiRequestSchema.safeParse(JSON.parse(raw));
    if (!input.success) return fail('内容格式无效，请检查输入和图片', 400);
    if (!(await consumeBudget()))
      return fail('已达到调用上限，请稍后或明天再试', 429);
    const provider = createOpenAIProvider();
    if (input.data.stream) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          const send = (data: unknown) =>
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          try {
            const result = await provider.stream(input.data, (delta) =>
              send({ type: 'delta', delta }),
            );
            send({ type: 'result', result });
          } catch {
            send({
              type: 'error',
              error:
                'AI暂时不可用，可能是超时、配额或模型设置问题；记录未被修改。',
            });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return NextResponse.json({ result: await provider.generate(input.data) });
  } catch {
    return fail(
      'AI请求失败，请检查服务配置、网络或额度；本地记录未被修改。',
      502,
    );
  }
}
