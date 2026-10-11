import { createHash } from 'node:crypto';
import { distributed, namespace, redis } from './security';
import type { Model } from './catalog';
import type { Usage } from './provider';
import { AIError } from './errors';
export type UsageEntry = {
  at: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  exact: boolean;
  estimatedUSD: number;
  outcome: string;
};
type Month = {
  reserved: number;
  calls: number;
  providers: Record<string, number>;
  entries: UsageEntry[];
};
const months = new Map<string, Month>();
const days = new Map<string, number>();
const requests = new Set<string>();
export function limits() {
  const daily = Number(process.env.AI_DAILY_REQUEST_LIMIT || 30),
    monthly = Number(process.env.AI_MONTHLY_REQUEST_LIMIT || 300),
    usd = Number(process.env.AI_MONTHLY_BUDGET_USD || 5);
  if (
    ![daily, monthly, usd].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isInteger(daily) ||
    !Number.isInteger(monthly)
  )
    throw new AIError('config', '服务端请求上限或预算配置无效。', 503);
  return { daily, monthly, usd };
}
export function estimate(model: Model, input: number, output: number) {
  if (model.inputPrice === null || model.outputPrice === null)
    throw new AIError(
      'budget',
      '管理员需先填写该模型的每百万 Token 单价；费用估算缺失时暂停调用。',
      403,
    );
  return (input * model.inputPrice + output * model.outputPrice) / 1000000;
}
export async function claimRequest(id: string, payload: string) {
  const key = `${namespace()}:request:${id}`;
  // No prompt, image or answer is persisted in the server ledger.
  const value = createHash('sha256').update(payload).digest('hex');
  const ok = distributed()
    ? (await redis(['SET', key, value, 'NX', 'EX', 2678400])) === 'OK'
    : !process.env.VERCEL && !requests.has(key);
  if (!ok)
    throw new AIError(
      'duplicate',
      '这次请求已提交，已阻止重复调用和重复扣费；请查看当前结果。',
      409,
    );
  requests.add(key);
}
export async function reserve(
  model: Model,
  inputTokens: number,
  maxOutput: number,
) {
  const date = new Date().toISOString(),
    month = date.slice(0, 7),
    day = date.slice(0, 10),
    base = namespace();
  const caps = limits();
  const hold = Math.ceil(estimate(model, inputTokens, maxOutput) * 1000000); // micro-USD, conservative reservation.
  const keys = [
    `${base}:calls:${day}`,
    `${base}:calls:${month}`,
    `${base}:cost:${month}`,
    `${base}:providers:${month}`,
  ];
  if (distributed()) {
    const script =
      "if tonumber(redis.call('GET',KEYS[1]) or '0')>=tonumber(ARGV[1]) or tonumber(redis.call('GET',KEYS[2]) or '0')>=tonumber(ARGV[2]) or tonumber(redis.call('GET',KEYS[3]) or '0')+tonumber(ARGV[3])>tonumber(ARGV[4]) then return 0 end; for i=1,2 do redis.call('INCR',KEYS[i]); redis.call('EXPIRE',KEYS[i],2678400) end; redis.call('INCRBY',KEYS[3],ARGV[3]); redis.call('EXPIRE',KEYS[3],2678400); redis.call('HINCRBY',KEYS[4],ARGV[5],1); redis.call('EXPIRE',KEYS[4],2678400); return 1";
    if (
      (await redis([
        'EVAL',
        script,
        4,
        ...keys,
        caps.daily,
        caps.monthly,
        hold,
        Math.floor(caps.usd * 1000000),
        model.provider,
      ])) !== 1
    )
      throw new AIError(
        'budget',
        '已达到每日请求、月度次数或应用侧费用预算上限。',
        429,
      );
  } else {
    if (process.env.VERCEL)
      throw new AIError('budget', '缺少分布式费用保护，已停止付费请求。', 503);
    const m = months.get(keys[1]) || {
      reserved: 0,
      calls: 0,
      providers: {},
      entries: [],
    };
    if (
      (days.get(keys[0]) || 0) >= caps.daily ||
      m.calls >= caps.monthly ||
      m.reserved + hold > caps.usd * 1000000
    )
      throw new AIError('budget', '已达到应用侧调用或费用上限。', 429);
    m.reserved += hold;
    m.calls++;
    m.providers[model.provider] = (m.providers[model.provider] || 0) + 1;
    months.set(keys[1], m);
    days.set(keys[0], (days.get(keys[0]) || 0) + 1);
  }
  let finished = false;
  return async (usage: Usage | undefined, outcome: string) => {
    if (finished) return;
    finished = true;
    // Unknown usage (including timeouts) keeps the full hold; never pretend a failed call was free.
    const cost = usage?.exact
      ? Math.ceil(estimate(model, usage.input, usage.output) * 1000000)
      : hold;
    const entry: UsageEntry = {
      at: date,
      provider: model.provider,
      model: model.id,
      input: usage?.input || 0,
      output: usage?.output || 0,
      exact: usage?.exact || false,
      estimatedUSD: cost / 1000000,
      outcome,
    };
    if (distributed()) {
      const script =
        "redis.call('INCRBY',KEYS[1],ARGV[1]); redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,99); redis.call('EXPIRE',KEYS[2],2678400); return 1";
      await redis([
        'EVAL',
        script,
        2,
        keys[2],
        `${base}:usage:${month}`,
        cost - hold,
        JSON.stringify(entry),
      ]);
    } else {
      const m = months.get(keys[1])!;
      m.reserved += cost - hold;
      m.entries.unshift(entry);
      m.entries = m.entries.slice(0, 100);
    }
  };
}
export async function usageSummary() {
  const month = new Date().toISOString().slice(0, 7);
  const base = namespace();
  if (!distributed()) {
    const m = months.get(`${base}:calls:${month}`);
    return {
      month,
      estimatedUSD: (m?.reserved || 0) / 1000000,
      calls: m?.calls || 0,
      providers: m?.providers || {},
      entries: m?.entries || [],
      limits: limits(),
    };
  }
  const [cost, calls, providers, entries] = await Promise.all([
    redis(['GET', `${base}:cost:${month}`]),
    redis(['GET', `${base}:calls:${month}`]),
    redis(['HGETALL', `${base}:providers:${month}`]),
    redis(['LRANGE', `${base}:usage:${month}`, 0, 99]),
  ]);
  const counts = Array.isArray(providers)
    ? Object.fromEntries(
        Array.from({ length: providers.length / 2 }, (_, i) => [
          providers[i * 2],
          Number(providers[i * 2 + 1]),
        ]),
      )
    : providers || {};
  return {
    month,
    estimatedUSD: Number(cost || 0) / 1000000,
    calls: Number(calls || 0),
    providers: counts,
    entries: (entries || []).map((s: string) => JSON.parse(s) as UsageEntry),
    limits: limits(),
  };
}
