import { NextResponse } from 'next/server';
import { AIError, safeError } from './errors';
export function failure(error: unknown) {
  const e = error instanceof AIError ? error : safeError(error);
  return NextResponse.json(
    { error: e.message, code: e.code },
    { status: e.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
