import { useState, type FormEvent } from 'react';
import { Bot, CircleCheck, Clock, LoaderCircle } from 'lucide-react';
import { MAX_ORDER, OrderQuantitySchema, ROLES, type PlayerView } from '@beer/game';
import { formatNumber } from '../lib/format';
import { ROLE_INFO } from '../lib/roles';

type Me = NonNullable<PlayerView['me']>;

type Props = {
  view: PlayerView;
  lastError: string | null;
  sendingOrder: boolean;
  canOrder: boolean;
  onOrder: (quantity: number) => void;
};

export function Board({ view, lastError, sendingOrder, canOrder, onOrder }: Props) {
  const { me, myRole } = view;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          Round {view.round} <span className="text-slate-400">/ {view.totalRounds}</span>
        </h1>
        <p className="text-slate-600">
          {myRole ? (
            <>
              You are the <span className="font-semibold text-slate-900">{ROLE_INFO[myRole].label}</span>
            </>
          ) : (
            'You are watching this game'
          )}
        </p>
      </section>

      {me ? (
        <>
          <Stats me={me} />
          <OrderForm
            // A new round gets a fresh form.
            key={view.round}
            me={me}
            lastRound={view.round === view.totalRounds}
            disabled={sendingOrder || !canOrder}
            sending={sendingOrder}
            error={lastError}
            onOrder={onOrder}
          />
        </>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          Every role is taken. Each player sees only their own numbers, so there is nothing to show here until the
          game ends.
        </p>
      )}

      <SubmissionStatus view={view} />
    </div>
  );
}

function Stats({ me }: { me: Me }) {
  const tiles: { label: string; value: number; hint: string; alert?: boolean }[] = [
    { label: 'Inventory', value: me.inventory, hint: 'in stock after shipping' },
    { label: 'Backlog', value: me.backlog, hint: 'owed downstream', alert: me.backlog > 0 },
    { label: 'Shipment arrived', value: me.shipmentArrived, hint: 'received this round' },
    { label: 'Order arrived', value: me.incomingOrder, hint: 'requested this round' },
    { label: 'Shipped', value: me.shipped, hint: 'sent downstream' },
    { label: 'Last order', value: me.lastOrder, hint: 'you placed last round' },
    { label: 'Round cost', value: me.roundCost, hint: '0.5 × stock + 1 × backlog' },
    { label: 'Total cost', value: me.totalCost, hint: 'so far' },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">{tile.label}</p>
          <p className={`text-2xl font-bold tabular-nums ${tile.alert ? 'text-red-600' : ''}`}>
            {formatNumber(tile.value)}
          </p>
          <p className="text-xs text-slate-400">{tile.hint}</p>
        </div>
      ))}
    </section>
  );
}

type OrderFormProps = {
  me: Me;
  lastRound: boolean;
  disabled: boolean;
  sending: boolean;
  error: string | null;
  onOrder: (quantity: number) => void;
};

function OrderForm({ me, lastRound, disabled, sending, error, onOrder }: OrderFormProps) {
  const [value, setValue] = useState(String(me.lastOrder));
  const [invalid, setInvalid] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const quantity = OrderQuantitySchema.safeParse(value.trim() === '' ? NaN : Number(value));
    setInvalid(!quantity.success);
    if (quantity.success) onOrder(quantity.data);
  }

  if (me.pendingOrder !== null) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-6 text-green-900">
        <CircleCheck className="size-6 shrink-0" aria-hidden />
        <p>
          You ordered <span className="font-semibold">{me.pendingOrder}</span> this round.{' '}
          {lastRound ? 'The game ends' : 'The next round starts'} once everyone has ordered.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <label htmlFor="order-quantity" className="block font-medium">
        How many units do you order from upstream?
      </label>
      <div className="mt-3 flex gap-2">
        <input
          id="order-quantity"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_ORDER}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid}
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-lg tabular-nums focus:border-amber-500 focus:outline-none disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={disabled}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Place order
        </button>
      </div>
      {invalid ? (
        <p className="mt-2 text-sm text-red-600">Enter a whole number between 0 and {formatNumber(MAX_ORDER)}.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}

function SubmissionStatus({ view }: { view: PlayerView }) {
  const waiting = ROLES.filter((role) => !view.submitted[role]).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold">
        Orders this round <span className="font-normal text-slate-500">· waiting for {waiting}</span>
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-4">
        {ROLES.map((role) => (
          <li key={role} className="flex items-center gap-2">
            {view.submitted[role] ? (
              <CircleCheck className="size-5 text-green-600" aria-label="ordered" />
            ) : (
              <Clock className="size-5 text-slate-400" aria-label="waiting" />
            )}
            <span className={view.myRole === role ? 'font-semibold' : ''}>{ROLE_INFO[role].label}</span>
            {view.bots[role] ? <Bot className="size-4 text-slate-400" aria-label="bot" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
