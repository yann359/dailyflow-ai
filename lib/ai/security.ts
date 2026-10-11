import { createHash, timingSafeEqual } from 'node:crypto';
export function aiStatus() {
  const configured =
    process.env.AI_ENABLED === 'true' &&
    !!process.env.OPENAI_API_KEY &&
    !!process.env.AI_ACCESS_CODE;
  const distributed =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;
  const enabled = configured && (!process.env.VERCEL || distributed);
  return {
    enabled,
    provider: enabled ? 'openai' : 'none',
    reason: enabled
      ? '服务已配置，输入访问口令后可使用'
      : process.env.VERCEL && configured && !distributed
        ? '缺少生产环境分布式限流配置'
        : 'AI未配置或未启用，所有本地功能仍可使用',
    chatgptSignIn: false,
  };
}
export function validAccessCode(value: string) {
  const expected = process.env.AI_ACCESS_CODE;
  if (!expected || !value) return false;
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(value), hash(expected));
}
const memory = new Map<string, { count: number; reset: number }>();
export function memoryLimit(
  key: string,
  limit: number,
  period: number,
  now = Date.now(),
) {
  const old = memory.get(key);
  const entry =
    !old || old.reset <= now ? { count: 0, reset: now + period } : old;
  if (entry.count >= limit) return false;
  entry.count++;
  memory.set(key, entry);
  if (memory.size > 5000)
    for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
  return true;
}
export async function consumeBudget() {
  const daily = Math.max(1, Number(process.env.AI_DAILY_REQUEST_LIMIT || 30));
  const monthly = Math.max(
    1,
    Number(process.env.AI_MONTHLY_REQUEST_LIMIT || 300),
  );
  if (!Number.isFinite(daily) || !Number.isFinite(monthly))
    throw new Error('调用上限配置无效');
  const date = new Date().toISOString();
  const namespace = createHash('sha256')
    .update(process.env.AI_ACCESS_CODE || 'local')
    .digest('hex')
    .slice(0, 16);
  const keys = [
    `dailyflow:${namespace}:minute:${date.slice(0, 16)}`,
    `dailyflow:${namespace}:day:${date.slice(0, 10)}`,
    `dailyflow:${namespace}:month:${date.slice(0, 7)}`,
  ];
  const limits = [5, daily, monthly];
  const periods = [60, 86400, 2678400];
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    // Lua保证所有配额同时检查、同时增加，避免并发越限。
    const script =
      "for i=1,3 do if tonumber(redis.call('GET',KEYS[i]) or '0') >= tonumber(ARGV[i]) then return 0 end end for i=1,3 do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[i+3]) end end return 1";
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['EVAL', script, 3, ...keys, ...limits, ...periods]),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('调用预算服务暂不可用');
    const output = await response.json();
    if (output.error) throw new Error('调用预算服务暂不可用');
    return output.result === 1;
  }
  return keys.every((key, i) => memoryLimit(key, limits[i], periods[i] * 1000));
}
