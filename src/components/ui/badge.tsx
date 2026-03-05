import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'pending' | 'transcribing' | 'review' | 'approved' | 'failed';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
        variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
        variant === 'outline' && 'text-foreground',
        variant === 'pending' && 'border-transparent bg-muted text-muted-foreground',
        variant === 'transcribing' && 'border-transparent bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
        variant === 'review' && 'border-transparent bg-blue-500/20 text-blue-700 dark:text-blue-400',
        variant === 'approved' && 'border-transparent bg-green-500/20 text-green-700 dark:text-green-400',
        variant === 'failed' && 'border-transparent bg-destructive/20 text-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
