import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { NextRequest } from 'next/server';
import { AIError } from './errors';
import { configuredProviders } from './provider';
export type Session = { role: 'user' | 'admin'; sub: string; expires: number };
export const cookieName = 'dailyflow_ai_session';
const hash = (s: string) => createHash('sha256').update(s).digest();
export function validAccessCode(value: string, admin = false) {
  const expected =
    process.env[admin ? 'AI_ADMIN_ACCESS_CODE' : 'AI_ACCESS_CODE'];
  return (
    !!expected &&
    expected.length >= 32 &&
    value.length <= 256 &&
    timingSafeEqual(hash(value), hash(expected))
  );
}
export function distributed() {
  return (
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
export function securityReady() {
  return (
    (process.env.AI_SESSION_SECRET?.length || 0) >= 32 &&
    (process.env.AI_ACCESS_CODE?.length || 0) >= 32 &&
    (process.env.AI_ADMIN_ACCESS_CODE?.length || 0) >= 32 &&
    process.env.AI_ADMIN_ACCESS_CODE !== process.env.AI_ACCESS_CODE &&
    process.env.AI_SESSION_SECRET !== process.env.AI_ACCESS_CODE &&
    process.env.AI_SESSION_SECRET !== process.env.AI_ADMIN_ACCESS_CODE &&
    (!process.env.VERCEL || distributed())
  );
}
export function aiStatus() {
  const enabled =
    process.env.AI_ENABLED === 'true' &&
    securityReady() &&
    Object.values(configuredProviders()).some(Boolean);
  return {
    enabled,
    provider: enabled ? 'multiple' : 'none',
    reason: enabled
      ? '服务端已配置；登录 AI 访问身份后可调用模型'
      : 'AI尚未启用或访问保护未配置完整，本地功能仍可使用',
    chatgptSignIn: false,
  };
}
export function issueSession(role: Session['role']) {
  const payload = Buffer.from(
    JSON.stringify({ role, sub: randomUUID(), expires: Date.now() + 3600000 }),
  ).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', process.env.AI_SESSION_SECRET!)
      .update(payload)
      .digest('base64url')
  );
}
export function getSession(request: NextRequest): Session | undefined {
  if (!securityReady()) return;
  const token = request.cookies.get(cookieName)?.value;
  if (!token || token.length > 1000) return;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return;
  const expected = createHmac('sha256', process.env.AI_SESSION_SECRET!)
    .update(payload)
    .digest('base64url');
  if (!timingSafeEqual(hash(signature), hash(expected))) return;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      !['admin', 'user'].includes(parsed.role) ||
      typeof parsed.sub !== 'string' ||
      parsed.expires <= Date.now()
    )
      return;
    return parsed as Session;
  } catch {
    return;
  }
}
export function requireSession(request: NextRequest, admin = false) {
  const session = getSession(request);
  if (!session)
    throw new AIError('auth', '请先在 AI 模型中心登录访问身份。', 401);
  if (admin && session.role !== 'admin')
    throw new AIError('auth', '此操作仅允许管理员执行。', 403);
  return session;
}
export function sameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    throw new AIError('auth', '请求来源不正确。', 403);
}
export async function readJSON(
  request: NextRequest,
  max = 2500000,
): Promise<unknown> {
  sameOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AIError('input', '只接受 JSON 请求。', 415);
  if (Number(request.headers.get('content-length') || 0) > max)
    throw new AIError('input', '请求超过大小限制。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AIError('input', '缺少请求内容。', 400);
  let raw = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AIError('input', '图片或数据过大。', 413);
    }
    raw += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(raw + decoder.decode());
  } catch {
    throw new AIError('input', 'JSON 内容无效。', 400);
  }
}
export async function redis(command: (string | number)[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  if (!url.startsWith('https://'))
    throw new AIError('config', 'Redis 必须使用 HTTPS。', 503);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok)
    throw new AIError(
      'budget',
      '服务端配置/预算存储暂不可用，已停止付费请求。',
      503,
    );
  const output = await response.json();
  if (output.error)
    throw new AIError('budget', '服务端存储异常，已停止付费请求。', 503);
  return output.result;
}
export function namespace() {
  return (
    'dailyflow:ai:' +
    (process.env.AI_STORAGE_NAMESPACE || 'dailyflow-ai')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) +
    ':' +
    (process.env.VERCEL_ENV || 'local')
  );
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
export async function rateLimit(key: string, limit = 5) {
  const period = Math.floor(Date.now() / 60000);
  const name = `${namespace()}:rate:${key}:${period}`;
  const ok = distributed()
    ? (await redis([
        'EVAL',
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
        1,
        name,
      ])) <= limit
    : !process.env.VERCEL && memoryLimit(name, limit, 60000);
  if (!ok) throw new AIError('rate', '操作过于频繁，请一分钟后再试。', 429);
}
