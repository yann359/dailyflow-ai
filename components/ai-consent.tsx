'use client';
import { useEffect, useState } from 'react';
import { aiFetch } from '@/lib/ai/client';
import {
  preferencesSchema,
  selectionLabel,
  type AIPreferences,
} from '@/lib/ai/catalog';
import type { AIRequest } from '@/lib/ai/contracts';
import type { RoutePlan } from '@/lib/ai/routing';
export function useAIRoute(
  preferences: AIPreferences | undefined,
  task: AIRequest['task'],
  image: boolean,
  enabled: boolean,
) {
  const [resolved, setResolved] = useState<{
    key: string;
    plan?: RoutePlan;
    error?: string;
  }>();
  const [consentToken, setConsentToken] = useState('');
  const [version, setVersion] = useState(0);
  const key = JSON.stringify(preferencesSchema.parse(preferences || {}));
  const routeKey = `${key}:${task}:${image}:${enabled}:${version}`;
  const plan =
    enabled && resolved?.key === routeKey ? resolved.plan : undefined;
  const error =
    enabled && resolved?.key === routeKey ? resolved.error || '' : '';
  const consent = !!plan && consentToken === plan.token;
  const setConsent = (checked: boolean) =>
    setConsentToken(checked && plan ? plan.token : '');
  useEffect(() => {
    let active = true;
    if (enabled)
      aiFetch<RoutePlan>('/api/ai/resolve', {
        task,
        image,
        preferences: JSON.parse(key),
      })
        .then((value) => {
          if (active) setResolved({ key: routeKey, plan: value });
        })
        .catch((e) => {
          if (active) setResolved({ key: routeKey, error: e.message });
        });
    return () => {
      active = false;
    };
  }, [key, task, image, enabled, routeKey]);
  const authorization = () => {
    if (!plan) throw new Error(error || '正在确认模型，请稍后。');
    if (!consent) throw new Error('请先勾选本次第三方数据传输授权。');
    return {
      plan: plan.token,
      consent: [
        plan.selection.provider,
        ...plan.backups.map((b) => b.provider),
      ],
    };
  };
  return {
    plan,
    error,
    consent,
    setConsent,
    authorization,
    reload: () => setVersion((v) => v + 1),
  };
}
export function AIConsent({
  route,
  description,
}: {
  route: ReturnType<typeof useAIRoute>;
  description: string;
}) {
  if (route.error)
    return (
      <div>
        <p className="notice ai-error" role="status">
          {route.error} 本地记录不会被发送。
        </p>
        <button type="button" onClick={route.reload}>
          重新确认模型
        </button>
      </div>
    );
  if (!route.plan) return <p className="notice">正在确认模型能力…</p>;
  return (
    <div className="ai-consent">
      <p className="small muted">
        本次模型：{selectionLabel(route.plan.selection)}{' '}
        <button type="button" onClick={route.reload}>
          刷新模型授权
        </button>
      </p>
      <label className="check-field consent">
        <input
          type="checkbox"
          checked={route.consent}
          onChange={(e) => route.setConsent(e.target.checked)}
        />
        授权向 {selectionLabel(route.plan.selection)} 发送{description}。
      </label>
      {!!route.plan.backups.length && (
        <p className="notice">
          已开启故障切换。本次授权还包含备用服务：
          {route.plan.backups.map((b) => selectionLabel(b)).join('、')}
          。主模型失败时才会传输同一份必要数据，可能分别产生费用。
        </p>
      )}
    </div>
  );
}
