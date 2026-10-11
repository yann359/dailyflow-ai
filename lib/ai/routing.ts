import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  preferencesSchema,
  resolveModel,
  selectionSchema,
  type AIConfig,
  type AIPreferences,
  type Selection,
} from './catalog';
import { configuredProviders, ensureCapabilities } from './provider';
import { AIError } from './errors';
export const resolveSchema = z.object({
  task: z.enum(['coach', 'weekly', 'meal', 'photo', 'label']),
  image: z.boolean().default(false),
  preferences: preferencesSchema.default({
    mode: 'manual',
    cost: 'balanced',
    chat: null,
    image: null,
    weekly: null,
    failover: false,
    backups: [],
  }),
});
const planSchema = z.object({
  selection: selectionSchema,
  backups: z.array(selectionSchema).max(3),
  revision: z.number(),
  expires: z.number(),
  task: resolveSchema.shape.task,
  image: z.boolean(),
});
export type RoutePlan = z.infer<typeof planSchema> & { token: string };
export function createPlan(
  config: AIConfig,
  preferences: AIPreferences,
  task: string,
  image: boolean,
): RoutePlan {
  const configured = configuredProviders();
  const model = resolveModel(config, preferences, task, configured, image);
  if (!model)
    throw new AIError(
      'model',
      preferences.mode === 'local'
        ? '当前选择本地规则模式。'
        : '所选服务商未配置或模型能力不适用，请在模型中心调整。',
      400,
    );
  const structured = task !== 'coach';
  ensureCapabilities(model, image, structured, false);
  const backups: Selection[] = preferences.failover
    ? preferences.backups
        .filter((s) => !(s.provider === model.provider && s.model === model.id))
        .filter((s) =>
          config.models.some(
            (m) =>
              m.provider === s.provider &&
              m.id === s.model &&
              configured[m.provider] &&
              m.capabilities.text &&
              (!image || m.capabilities.image) &&
              (!structured || m.capabilities.structured),
          ),
        )
    : [];
  const plan = planSchema.parse({
    selection: { provider: model.provider, model: model.id },
    backups,
    revision: config.revision,
    expires: Date.now() + 300000,
    task,
    image,
  });
  const payload = Buffer.from(JSON.stringify(plan)).toString('base64url');
  const signature = createHmac('sha256', process.env.AI_SESSION_SECRET!)
    .update(payload)
    .digest('base64url');
  return { ...plan, token: payload + '.' + signature };
}
export function verifyPlan(
  token: string,
  config: AIConfig,
  task: string,
  image: boolean,
  consent: string[],
) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature)
    throw new AIError('consent', '请重新确认模型和数据授权。', 400);
  const expected = createHmac('sha256', process.env.AI_SESSION_SECRET!)
    .update(payload)
    .digest('base64url');
  const hash = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(hash(signature), hash(expected)))
    throw new AIError('consent', '模型授权无效。', 400);
  let plan;
  try {
    plan = planSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString()),
    );
  } catch {
    throw new AIError('consent', '模型授权格式无效。', 400);
  }
  if (
    plan.expires <= Date.now() ||
    plan.revision !== config.revision ||
    plan.task !== task ||
    plan.image !== image
  )
    throw new AIError(
      'consent',
      '模型配置或授权已变化，请刷新并重新授权。',
      409,
    );
  const choices = [plan.selection, ...plan.backups];
  if (choices.some((s) => !consent.includes(s.provider)))
    throw new AIError('consent', '尚未授权向所选服务商传输数据。', 403);
  return choices;
}
