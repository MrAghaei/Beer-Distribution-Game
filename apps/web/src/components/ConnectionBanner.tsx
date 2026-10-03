import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <WifiOff className="size-5 shrink-0" aria-hidden />
      Connection lost. Reconnecting… The numbers below may be out of date.
    </div>
  );
}
