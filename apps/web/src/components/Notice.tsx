import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

/** A centred message for states with nothing else to show (loading, not found, ...). */
export function Notice({ title, children, backHome }: { title: string; children?: ReactNode; backHome?: boolean }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children ? <div className="mt-2 text-slate-600">{children}</div> : null}
      {backHome ? (
        <Link to="/" className="mt-6 inline-block font-medium text-amber-700 hover:underline">
          Back to start
        </Link>
      ) : null}
    </div>
  );
}
