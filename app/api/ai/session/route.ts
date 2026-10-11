import { z } from 'zod';
import { NextRequest } from 'next/server';
import {
  cookieName,
  issueSession,
  namespace,
  rateLimit,
  readJSON,
  sameOrigin,
  securityReady,
  validAccessCode,
} from '@/lib/ai/security';
import { AIError } from '@/lib/ai/errors';
import { failure, json } from '@/lib/ai/http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const raw = await readJSON(request, 1000);
    if (!securityReady())
      throw new AIError(
        'config',
        '请先配置独立的访问口令、管理员口令、会话签名密钥和生产限流存储。',
        503,
      );
    // One global limit prevents IP header spoofing from bypassing protection on this personal app.
    await rateLimit(namespace() + ':login', 5);
    const parsed = z
      .object({
        code: z.string().min(1).max(256),
        role: z.enum(['user', 'admin']),
      })
      .safeParse(raw);
    if (
      !parsed.success ||
      !validAccessCode(parsed.data.code, parsed.data.role === 'admin')
    )
      throw new AIError('auth', '访问口令不正确。', 401);
    const response = json({
      authenticated: true,
      admin: parsed.data.role === 'admin',
    });
    response.cookies.set(cookieName, issueSession(parsed.data.role), {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 3600,
      path: '/api/ai',
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request);
    const response = json({ authenticated: false });
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 0,
      path: '/api/ai',
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
