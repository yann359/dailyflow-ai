'use client';
import { LoaderCircle, Sprout } from 'lucide-react';
import { Button } from './ui/button';
import { useState, useRef } from 'react';
export type Notify = (message: string) => void;
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Sprout size={26} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Submit({
  busy,
  children = '保存记录',
}: {
  busy: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={busy} className="full">
      {busy ? (
        <>
          <LoaderCircle size={17} className="spin" />
          保存中…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
export function useAction(notify: Notify) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  return {
    busy,
    run: async (action: () => Promise<void>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        notify(error instanceof Error ? error.message : '操作失败，请重试');
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
  };
}
export function MiniBar({
  value,
  max,
  color = 'green',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  return (
    <div
      className={`mini-bar ${color}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, value)}
    >
      <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
