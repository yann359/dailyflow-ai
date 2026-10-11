import { NextRequest } from 'next/server';
import { readJSON, requireSession, rateLimit } from '@/lib/ai/security';
import { loadConfig } from '@/lib/ai/config';
import { resolveSchema, createPlan } from '@/lib/ai/routing';
import { failure, json } from '@/lib/ai/http';
import { AIError } from '@/lib/ai/errors';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const session = requireSession(request);
    await rateLimit(session.sub + ':resolve', 30);
    const parsed = resolveSchema.safeParse(await readJSON(request, 12000));
    if (!parsed.success) throw new AIError('input', '模型选择格式无效。', 400);
    const { preferences, task, image } = parsed.data;
    return json(createPlan(await loadConfig(), preferences, task, image));
  } catch (error) {
    return failure(error);
  }
}
