import {
  configSchema,
  initialModels,
  type AIConfig,
  type CenterStatus,
  type ProviderId,
} from './catalog';
import {
  aiStatus,
  distributed,
  getSession,
  namespace,
  redis,
} from './security';
import { configuredProviders } from './provider';
import { AIError } from './errors';
import type { NextRequest } from 'next/server';
const memory = new Map<string, AIConfig>();
export function initialConfig(): AIConfig {
  const models = initialModels.map((m) => ({
    ...m,
    capabilities: { ...m.capabilities },
  }));
  const selection = {
    provider: 'openai' as const,
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  };
  if (!models.some((m) => m.provider === 'openai' && m.id === selection.model))
    models.push({
      ...models[0],
      id: selection.model,
      name: selection.model,
      source: 'admin',
      capabilities: {
        text: true,
        image: false,
        stream: false,
        structured: false,
        tools: false,
      },
    });
  return {
    revision: 0,
    models,
    defaults: { chat: selection, image: selection, weekly: selection },
    custom: null,
    connections: {},
  };
}
export async function loadConfig(): Promise<AIConfig> {
  if (distributed()) {
    const raw = await redis(['GET', namespace() + ':config']);
    return raw ? configSchema.parse(JSON.parse(raw)) : initialConfig();
  }
  if (process.env.VERCEL) return initialConfig();
  return memory.get(namespace()) || initialConfig();
}
export async function saveConfig(value: AIConfig) {
  const config = configSchema.parse(value);
  const next = { ...config, revision: config.revision + 1 };
  if (distributed()) {
    const script =
      "local raw=redis.call('GET',KEYS[1]); local rev=0; if raw then rev=cjson.decode(raw).revision end; if rev~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
    if (
      (await redis([
        'EVAL',
        script,
        1,
        namespace() + ':config',
        config.revision,
        JSON.stringify(next),
      ])) !== 1
    )
      throw new AIError('conflict', '配置已被更新，请刷新后再保存。', 409);
  } else {
    if (process.env.VERCEL)
      throw new AIError('config', '线上模型配置需要 Redis 持久化存储。', 503);
    if ((memory.get(namespace())?.revision || 0) !== config.revision)
      throw new AIError('conflict', '配置已更新，请刷新。', 409);
    memory.set(namespace(), next);
  }
  return next;
}
export async function centerStatus(
  request: NextRequest,
): Promise<CenterStatus> {
  const session = getSession(request);
  const status = {
    ...aiStatus(),
    authenticated: !!session,
    admin: session?.role === 'admin',
    persistent: distributed(),
  };
  if (!session) return status;
  const config = await loadConfig();
  // Custom proxy URL is administrator-only. Ordinary callers select approved IDs, never addresses.
  return {
    ...status,
    config:
      session.role === 'admin'
        ? config
        : {
            ...config,
            custom: config.custom
              ? { ...config.custom, baseURL: 'https://configured.invalid' }
              : null,
          },
    configured: configuredProviders(),
  };
}
export async function connectionStatus(
  provider: ProviderId,
  model: string,
  status: NonNullable<AIConfig['connections'][ProviderId]>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const config = await loadConfig();
    try {
      return await saveConfig({
        ...config,
        connections: {
          ...config.connections,
          [provider]: { ...status, model },
        },
      });
    } catch (e) {
      if (!(e instanceof AIError) || e.code !== 'conflict') throw e;
    }
  }
}
