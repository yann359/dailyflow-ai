import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';
export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button
      type="button"
      className={cn('button', `button-${variant}`, className)}
      {...props}
    />
  );
}
