import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
