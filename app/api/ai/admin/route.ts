import { z } from 'zod';
import { NextRequest } from 'next/server';
import { configSchema, modelSchema, providerIds } from '@/lib/ai/catalog';
import { connectionStatus, loadConfig, saveConfig } from '@/lib/ai/config';
import {
  aiStatus,
  rateLimit,
  readJSON,
  requireSession,
} from '@/lib/ai/security';
import { createProvider } from '@/lib/ai/provider';
import { claimRequest, reserve, usageSummary } from '@/lib/ai/budget';
import { validateCustomURL } from '@/lib/ai/ssrf';
import { AIError, safeError } from '@/lib/ai/errors';
import { failure, json } from '@/lib/ai/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), config: configSchema }),
  z.object({ action: z.literal('models'), provider: z.enum(providerIds) }),
  z.object({
    action: z.literal('test'),
    provider: z.enum(providerIds),
    model: z.string().min(1).max(160),
    requestId: z.string().uuid(),
    consent: z.literal(true),
  }),
]);
export async function GET(request: NextRequest) {
  try {
    requireSession(request, true);
    return json(await usageSummary());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const session = requireSession(request, true);
    await rateLimit(session.sub + ':admin', 10);
    const parsed = actionSchema.safeParse(await readJSON(request, 100000));
    if (!parsed.success) throw new AIError('input', '管理配置格式无效。', 400);
    const action = parsed.data;
    const config = await loadConfig();
    if (action.action === 'save') {
      if (action.config.custom)
        await validateCustomURL(action.config.custom.baseURL);
      for (const [task, selection] of Object.entries(action.config.defaults)) {
        if (!selection) continue;
        const model = action.config.models.find(
          (m) => m.provider === selection.provider && m.id === selection.model,
        );
        if (
          !model ||
          !model.capabilities.text ||
          (task === 'image' && !model.capabilities.image) ||
          (task !== 'chat' && !model.capabilities.structured)
        )
          throw new AIError('capability', '默认模型能力不符合所选任务。', 400);
      }
      const ids = action.config.models.map((m) => `${m.provider}/${m.id}`);
      if (new Set(ids).size !== ids.length)
        throw new AIError('input', '模型不能重复。', 400);
      return json({
        config: await saveConfig({
          ...action.config,
          connections: config.connections,
        }),
      });
    }
    const provider = createProvider(action.provider, config);
    if (action.action === 'models') {
      const available = await provider.getModels();
      // Discovery is not capability verification. New IDs stay text-only until an administrator verifies them.
      const newModels = available
        .filter(
          (m) =>
            !config.models.some(
              (old) => old.provider === action.provider && old.id === m.id,
            ),
        )
        .map((m) =>
          modelSchema.parse({
            provider: action.provider,
            id: m.id,
            name: m.name.slice(0, 100),
            capabilities: {
              text: true,
              image: false,
              stream: false,
              structured: false,
              tools: false,
            },
            source: 'discovered',
            inputPrice: null,
            outputPrice: null,
          }),
        );
      return json({
        config: await saveConfig({
          ...config,
          models: [...config.models, ...newModels].slice(0, 150),
        }),
        count: available.length,
      });
    }
    if (!aiStatus().enabled)
      throw new AIError('config', aiStatus().reason, 503);
    const model = config.models.find(
      (m) => m.provider === action.provider && m.id === action.model,
    );
    if (!model) throw new AIError('model', '请先保存这个模型。', 400);
    await claimRequest(action.requestId, JSON.stringify(action));
    const finish = await reserve(model, 1000, 64);
    let outcome;
    try {
      const result = await provider.testConnection(model.id);
      await finish(result.usage, 'test-success');
      outcome = {
        status: 'success' as const,
        message: '真实连接测试通过',
        checkedAt: new Date().toISOString(),
        model: model.id,
      };
    } catch (e) {
      const error = safeError(e);
      await finish(undefined, error.code);
      outcome = {
        status: (['auth', 'credit', 'model', 'network'].includes(error.code)
          ? error.code
          : 'error') as 'auth' | 'credit' | 'model' | 'network' | 'error',
        message: error.message,
        checkedAt: new Date().toISOString(),
        model: model.id,
      };
    }
    await connectionStatus(action.provider, model.id, outcome);
    return json({ connection: outcome });
  } catch (error) {
    return failure(error);
  }
}
