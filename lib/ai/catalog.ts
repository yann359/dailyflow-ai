import { z } from 'zod';

export const providerIds = [
  'openai',
  'deepseek',
  'moonshot',
  'ark',
  'gemini',
  'anthropic',
  'custom',
] as const;
export type ProviderId = (typeof providerIds)[number];
export const providers: Record<
  ProviderId,
  { name: string; symbol: string; env: string; url: string }
> = {
  openai: {
    name: 'OpenAI GPT',
    symbol: '◎',
    env: 'OPENAI_API_KEY',
    url: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    name: 'DeepSeek',
    symbol: '≈',
    env: 'DEEPSEEK_API_KEY',
    url: 'https://platform.deepseek.com',
  },
  moonshot: {
    name: 'Kimi / Moonshot',
    symbol: 'K',
    env: 'MOONSHOT_API_KEY',
    url: 'https://platform.moonshot.cn',
  },
  ark: {
    name: '豆包 / 火山方舟',
    symbol: '豆',
    env: 'ARK_API_KEY',
    url: 'https://ark.volcengine.com/region:cn-beijing/apikey',
  },
  gemini: {
    name: 'Google Gemini',
    symbol: '✦',
    env: 'GEMINI_API_KEY',
    url: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    name: 'Anthropic Claude',
    symbol: '✳',
    env: 'ANTHROPIC_API_KEY',
    url: 'https://platform.claude.com',
  },
  custom: {
    name: '自定义兼容服务',
    symbol: '+',
    env: 'CUSTOM_AI_API_KEY',
    url: '',
  },
};
export const capabilitiesSchema = z.object({
  text: z.boolean(),
  image: z.boolean(),
  stream: z.boolean(),
  structured: z.boolean(),
  tools: z.boolean(),
});
export const modelSchema = z.object({
  provider: z.enum(providerIds),
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9._:/-]+$/),
  name: z.string().min(1).max(100),
  capabilities: capabilitiesSchema,
  source: z.enum(['official', 'discovered', 'admin']),
  inputPrice: z.number().min(0).max(10000).nullable(),
  outputPrice: z.number().min(0).max(10000).nullable(),
});
export type Model = z.infer<typeof modelSchema>;
export const selectionSchema = z.object({
  provider: z.enum(providerIds),
  model: modelSchema.shape.id,
});
export type Selection = z.infer<typeof selectionSchema>;
export const preferencesSchema = z.object({
  mode: z.enum(['manual', 'auto', 'local']).default('manual'),
  cost: z.enum(['economy', 'balanced', 'quality']).default('balanced'),
  chat: selectionSchema.nullable().default(null),
  image: selectionSchema.nullable().default(null),
  weekly: selectionSchema.nullable().default(null),
  failover: z.boolean().default(false),
  backups: z.array(selectionSchema).max(3).default([]),
});
export type AIPreferences = z.infer<typeof preferencesSchema>;
export const configSchema = z.object({
  revision: z.number().int().nonnegative(),
  models: z.array(modelSchema).max(150),
  defaults: z.object({
    chat: selectionSchema.nullable(),
    image: selectionSchema.nullable(),
    weekly: selectionSchema.nullable(),
  }),
  custom: z
    .object({
      name: z.string().min(1).max(60),
      baseURL: z.string().url().max(300),
      protocol: z.literal('openai-chat'),
    })
    .nullable(),
  connections: z
    .partialRecord(
      z.enum(providerIds),
      z.object({
        status: z.enum([
          'success',
          'auth',
          'credit',
          'model',
          'network',
          'error',
        ]),
        message: z.string().max(200),
        checkedAt: z.string(),
        model: z.string(),
      }),
    )
    .default({}),
});
export type AIConfig = z.infer<typeof configSchema>;
const caps = (image: boolean) => ({
  text: true,
  image,
  stream: true,
  structured: true,
  tools: true,
});
// IDs/capabilities verified against the official documentation, not a guarantee of account availability.
export const initialModels: Model[] = [
  {
    provider: 'openai',
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 mini',
    capabilities: caps(true),
    source: 'official',
    inputPrice: null,
    outputPrice: null,
  },
  {
    provider: 'deepseek',
    id: 'deepseek-flash',
    name: 'DeepSeek Flash',
    capabilities: caps(false),
    source: 'official',
    inputPrice: null,
    outputPrice: null,
  },
  {
    provider: 'moonshot',
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    capabilities: caps(true),
    source: 'official',
    inputPrice: null,
    outputPrice: null,
  },
  {
    provider: 'gemini',
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    capabilities: caps(true),
    source: 'official',
    inputPrice: null,
    outputPrice: null,
  },
  {
    provider: 'anthropic',
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    capabilities: caps(true),
    source: 'official',
    inputPrice: null,
    outputPrice: null,
  },
];
export type CenterStatus = {
  enabled: boolean;
  reason: string;
  provider: string;
  authenticated?: boolean;
  admin?: boolean;
  config?: AIConfig;
  configured?: Partial<Record<ProviderId, boolean>>;
  persistent?: boolean;
};
export function selectionLabel(
  selection?: Selection | null,
  config?: AIConfig,
) {
  return selection
    ? `${selection.provider === 'custom' ? config?.custom?.name || providers.custom.name : providers[selection.provider].name} · ${selection.model}`
    : '本地规则';
}
export function resolveModel(
  config: AIConfig,
  preferences: AIPreferences,
  task: string,
  configured: Partial<Record<ProviderId, boolean>>,
  hasImage = false,
): Model | undefined {
  if (preferences.mode === 'local') return;
  const key =
    hasImage || task === 'label' || task === 'photo'
      ? 'image'
      : task === 'weekly'
        ? 'weekly'
        : 'chat';
  const capable = (m: Model) =>
    !!configured[m.provider] &&
    (m.provider !== 'custom' || !!config.custom) &&
    m.capabilities.text &&
    (!hasImage || m.capabilities.image) &&
    (task === 'coach' || m.capabilities.structured);
  if (preferences.mode === 'manual') {
    const choice = preferences[key] || config.defaults[key];
    return config.models.find(
      (m) =>
        m.provider === choice?.provider && m.id === choice.model && capable(m),
    );
  }
  const candidates = config.models.filter(
    (m) => capable(m) && m.inputPrice !== null && m.outputPrice !== null,
  );
  const preferred = preferences[key] || config.defaults[key];
  return candidates.sort((a, b) => {
    if (preferences.cost !== 'economy') {
      const score = (m: Model) =>
        Number(m.provider === preferred?.provider && m.id === preferred.model);
      if (score(a) !== score(b)) return score(b) - score(a);
    }
    return a.inputPrice! + a.outputPrice! - (b.inputPrice! + b.outputPrice!);
  })[0];
}
