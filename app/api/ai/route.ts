import { NextRequest } from 'next/server';
import { aiRequestSchema } from '@/lib/ai/contracts';
import {
  aiStatus,
  rateLimit,
  readJSON,
  requireSession,
} from '@/lib/ai/security';
import { centerStatus, loadConfig } from '@/lib/ai/config';
import { verifyPlan } from '@/lib/ai/routing';
import { executeAI, validateImage } from '@/lib/ai/service';
import { claimRequest } from '@/lib/ai/budget';
import { AIError } from '@/lib/ai/errors';
import { failure, json } from '@/lib/ai/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    return json(await centerStatus(request));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const session = requireSession(request);
    if (!aiStatus().enabled)
      throw new AIError('config', aiStatus().reason, 503);
    await rateLimit(session.sub);
    const parsed = aiRequestSchema.safeParse(await readJSON(request));
    if (!parsed.success)
      throw new AIError('input', '内容格式无效，请检查输入和图片。', 400);
    const input = parsed.data;
    if (!input.requestId || !input.plan || !input.consent)
      throw new AIError('consent', '缺少请求编号或第三方数据授权。', 400);
    await validateImage(input.image);
    const config = await loadConfig();
    const choices = verifyPlan(
      input.plan,
      config,
      input.task,
      !!input.image,
      input.consent,
    );
    await claimRequest(input.requestId, JSON.stringify(input));
    if (input.stream && input.task === 'coach') {
      const encoder = new TextEncoder();
      let closed = false;
      const body = new ReadableStream({
        async start(controller) {
          const send = (event: unknown) => {
            if (!closed)
              try {
                controller.enqueue(
                  encoder.encode(JSON.stringify(event) + '\n'),
                );
              } catch {
                closed = true;
              }
          };
          try {
            const output = await executeAI(input, choices, config, (delta) =>
              send({ type: 'delta', delta }),
            );
            send({ type: 'result', ...output });
          } catch (error) {
            const response = await failure(error).json();
            send({ type: 'error', ...response });
          } finally {
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        },
        cancel() {
          closed = true;
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
    return json(await executeAI(input, choices, config));
  } catch (error) {
    return failure(error);
  }
}
