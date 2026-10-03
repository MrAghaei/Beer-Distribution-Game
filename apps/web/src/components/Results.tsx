import { Link } from '@tanstack/react-router';
import { Trophy } from 'lucide-react';
import { ROLES, type PlayerView } from '@beer/game';
import { formatNumber } from '../lib/format';
import { ROLE_INFO } from '../lib/roles';

export function Results({ view }: { view: PlayerView }) {
  const { results } = view;
  if (!results) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <section className="text-center">
        <Trophy className="mx-auto size-10 text-amber-600" aria-hidden />
        <h1 className="mt-2 text-2xl font-bold">Game over</h1>
        <p className="text-slate-600">
          After {view.totalRounds} rounds the supply chain cost {formatNumber(results.total)} in total.
        </p>
      </section>

      <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <thead className="bg-slate-100 text-left text-sm text-slate-600">
          <tr>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => {
            const mine = view.myRole === role;
            return (
              <tr key={role} className={`border-t border-slate-200 ${mine ? 'bg-amber-50 font-semibold' : ''}`}>
                <td className="px-4 py-2">
                  {ROLE_INFO[role].label}
                  {mine ? <span className="ml-2 text-sm font-normal text-amber-700">(you)</span> : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(results.costs[role])}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-bold">
            <td className="px-4 py-2">Total</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatNumber(results.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="text-center">
        <Link to="/" className="font-medium text-amber-700 hover:underline">
          Start a new game
        </Link>
      </div>
    </div>
  );
}
