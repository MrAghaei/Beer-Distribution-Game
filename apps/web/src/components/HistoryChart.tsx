import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { ROLES, type PlayerView, type Role, type RoundRecord } from '@beer/game';
import { formatNumber } from '../lib/format';
import { ROLE_INFO } from '../lib/roles';

type History = NonNullable<PlayerView['results']>['history'];

const METRICS = {
  orders: {
    label: 'Orders',
    hint: 'What each role ordered from upstream. Dashed: customer demand.',
    value: (record: RoundRecord) => record.orderPlaced ?? 0,
  },
  inventory: {
    label: 'Inventory',
    hint: 'Stock left after shipping, at 0.5 per unit per round.',
    value: (record: RoundRecord) => record.inventory,
  },
  backlog: {
    label: 'Backlog',
    hint: 'Units owed downstream, at 1 per unit per round.',
    value: (record: RoundRecord) => record.backlog,
  },
};
type MetricId = keyof typeof METRICS;

// Full class names, so Tailwind finds them in the source.
const ROLE_COLORS: Record<Role, { stroke: string; fill: string; swatch: string }> = {
  retailer: { stroke: 'stroke-amber-600', fill: 'fill-amber-600', swatch: 'bg-amber-600' },
  wholesaler: { stroke: 'stroke-sky-600', fill: 'fill-sky-600', swatch: 'bg-sky-600' },
  distributor: { stroke: 'stroke-emerald-600', fill: 'fill-emerald-600', swatch: 'bg-emerald-600' },
  factory: { stroke: 'stroke-rose-600', fill: 'fill-rose-600', swatch: 'bg-rose-600' },
};

// Pixels. The width follows the container, so labels keep their size on a phone.
const HEIGHT = 260;
const PAD = { left: 36, right: 12, top: 12, bottom: 28 };
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

export function HistoryChart({ history, myRole }: { history: History; myRole: Role | null }) {
  const [metricId, setMetricId] = useState<MetricId>('orders');
  const [hoverRound, setHoverRound] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    setWidth(container.clientWidth);
    const observer = new ResizeObserver(() => setWidth(container.clientWidth));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - PAD.left - PAD.right;
  const metric = METRICS[metricId];
  const rounds = history.retailer.length;
  const series = ROLES.map((role) => ({ role, values: history[role].map(metric.value) }));
  const demand = metricId === 'orders' ? history.retailer.map((record) => record.incomingOrder) : null;
  const { top, step } = niceScale(Math.max(...series.flatMap((s) => s.values), ...(demand ?? [])));
  const shownRound = hoverRound ?? rounds;

  const x = (round: number) => PAD.left + ((round - 1) / Math.max(rounds - 1, 1)) * plotWidth;
  const y = (value: number) => PAD.top + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + 1)} ${y(v)}`).join(' ');
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const xTicks = Array.from({ length: rounds }, (_, i) => i + 1).filter((r) => r === 1 || r % 5 === 0);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * width;
    const round = Math.round(((viewX - PAD.left) / plotWidth) * (rounds - 1)) + 1;
    setHoverRound(Math.min(rounds, Math.max(1, round)));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Round by round</h2>
          <p className="text-sm text-slate-500">{metric.hint}</p>
        </div>
        <div role="group" aria-label="Show" className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
          {(Object.keys(METRICS) as MetricId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMetricId(id)}
              aria-pressed={id === metricId}
              className={`rounded-md px-3 py-1 font-medium ${
                id === metricId ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {METRICS[id].label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="mt-4">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block w-full"
          role="img"
          aria-label={`${metric.label} per role over ${rounds} rounds`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverRound(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-xs">
                {tick}
              </text>
            </g>
          ))}
          {xTicks.map((round) => (
            <text key={round} x={x(round)} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-xs">
              {round}
            </text>
          ))}
          {hoverRound !== null ? (
            <line x1={x(hoverRound)} x2={x(hoverRound)} y1={PAD.top} y2={PAD.top + PLOT_HEIGHT} className="stroke-slate-300" />
          ) : null}

          {demand ? (
            <path d={path(demand)} fill="none" strokeWidth={1.5} strokeDasharray="4 4" className="stroke-slate-400" />
          ) : null}
          {series.map(({ role, values }) => (
            <path
              key={role}
              d={path(values)}
              fill="none"
              strokeWidth={role === myRole ? 3 : 1.75}
              strokeLinejoin="round"
              className={ROLE_COLORS[role].stroke}
            />
          ))}
          {hoverRound !== null
            ? series.map(({ role, values }) => (
                <circle
                  key={role}
                  cx={x(hoverRound)}
                  cy={y(values[hoverRound - 1]!)}
                  r={3.5}
                  className={ROLE_COLORS[role].fill}
                />
              ))
            : null}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <span className="text-slate-500">Round {shownRound}</span>
        {series.map(({ role, values }) => (
          <span key={role} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${ROLE_COLORS[role].swatch}`} aria-hidden />
            <span className={role === myRole ? 'font-semibold' : ''}>{ROLE_INFO[role].label}</span>
            <span className="font-semibold tabular-nums">{formatNumber(values[shownRound - 1]!)}</span>
          </span>
        ))}
        {demand ? (
          <span className="flex items-center gap-2 text-slate-500">
            <span className="w-3 border-t-2 border-dashed border-slate-400" aria-hidden />
            Customer demand <span className="font-semibold text-slate-900 tabular-nums">{demand[shownRound - 1]}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** A round axis maximum and tick step for values up to `max`, e.g. 23 → 0–25 in steps of 5. */
function niceScale(max: number): { top: number; step: number } {
  const rough = Math.max(max, 1) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].find((n) => n * magnitude >= rough)! * magnitude);
  return { top: Math.ceil(Math.max(max, 1) / step) * step, step };
}
