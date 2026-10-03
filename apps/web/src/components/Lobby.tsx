import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, Check, Copy, LoaderCircle, User } from 'lucide-react';
import { ROLES, type PlayerView, type Role } from '@beer/game';
import { joinGame } from '../lib/api';
import { gameUrl } from '../lib/format';
import { ROLE_INFO } from '../lib/roles';

type Props = {
  view: PlayerView;
  lastError: string | null;
  canFillWithBots: boolean;
  onJoined: (token: string) => void;
  onFillWithBots: () => boolean;
};

export function Lobby({ view, lastError, canFillWithBots, onJoined, onFillWithBots }: Props) {
  const join = useMutation({
    mutationFn: (role: Role) => joinGame(view.code, role),
    onSuccess: ({ token }) => onJoined(token),
  });
  // Stays set until the game starts and the lobby goes away, so a double click sends one request.
  const [botsRequested, setBotsRequested] = useState(false);

  const missing = ROLES.filter((role) => !view.rolesTaken[role]).length;
  const joiningRole = join.isPending ? join.variables : null;
  // After a successful join the view only shows our role once the socket has said hello
  // with the new token; a second claim in that gap would orphan the first role.
  const canTake = view.myRole === null && (join.isIdle || join.isError);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm text-slate-500">Game code</p>
          <p className="font-mono text-3xl font-bold tracking-widest">{view.code}</p>
        </div>
        <CopyLinkButton code={view.code} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{view.myRole ? 'Your role' : 'Pick a role'}</h2>
          <p className="text-slate-600">
            Waiting for {missing} {missing === 1 ? 'player' : 'players'}…
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <RoleCard
              key={role}
              role={role}
              taken={view.rolesTaken[role]}
              mine={view.myRole === role}
              canTake={canTake}
              joining={joiningRole === role}
              onTake={() => join.mutate(role)}
            />
          ))}
        </ul>

        {join.error ? <p className="text-sm text-red-600">{join.error.message}</p> : null}
        {view.myRole ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="max-w-md text-sm text-slate-600">
              Playing all four roles yourself? Open the link in three more tabs and take a role in each. Or let bots
              play the free roles and start now.
            </p>
            <button
              type="button"
              onClick={() => setBotsRequested(onFillWithBots())}
              disabled={!canFillWithBots || botsRequested}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {botsRequested ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Bot className="size-4" aria-hidden />
              )}
              Fill {missing} {missing === 1 ? 'role' : 'roles'} with bots
            </button>
          </div>
        ) : null}
        {lastError ? <p className="text-sm text-red-600">{lastError}</p> : null}
      </section>
    </div>
  );
}

type RoleCardProps = {
  role: Role;
  taken: boolean;
  mine: boolean;
  canTake: boolean;
  joining: boolean;
  onTake: () => void;
};

function RoleCard({ role, taken, mine, canTake, joining, onTake }: RoleCardProps) {
  const { label, description } = ROLE_INFO[role];

  return (
    <li
      className={`flex items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-sm ${
        mine ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-200'
      }`}
    >
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      {mine ? (
        <span className="flex shrink-0 items-center gap-1 font-medium text-amber-700">
          <Check className="size-4" aria-hidden /> You
        </span>
      ) : taken ? (
        <span className="flex shrink-0 items-center gap-1 text-slate-500">
          <User className="size-4" aria-hidden /> Taken
        </span>
      ) : (
        <button
          type="button"
          onClick={onTake}
          disabled={!canTake}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {joining ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Take
        </button>
      )}
    </li>
  );
}

function CopyLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(gameUrl(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the code is still on screen.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
    >
      {copied ? <Check className="size-4 text-green-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? 'Copied' : 'Copy invite link'}
    </button>
  );
}
