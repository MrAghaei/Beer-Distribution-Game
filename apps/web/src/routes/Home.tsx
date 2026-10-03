import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, LoaderCircle, Plus } from 'lucide-react';
import { GameCodeSchema, TOTAL_ROUNDS } from '@beer/game';
import { createGame } from '../lib/api';

const NOT_CODE_CHARS = /[^A-Z0-9]/g;

export function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const codeIsValid = GameCodeSchema.safeParse(code).success;

  const create = useMutation({
    mutationFn: createGame,
    onSuccess: ({ code }) => navigate({ to: '/game/$code', params: { code } }),
  });

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (codeIsValid) navigate({ to: '/game/$code', params: { code } });
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">The Beer Game</h1>
        <p className="text-slate-600">
          Four players run one supply chain for {TOTAL_ROUNDS} rounds. Keep stock low, keep customers served.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {create.isPending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
          Create game
        </button>
        {create.error ? <p className="mt-3 text-sm text-red-600">{create.error.message}</p> : null}
      </section>

      <form onSubmit={handleJoin} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="game-code" className="block font-medium">
          Join with a code
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="game-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(NOT_CODE_CHARS, '').slice(0, 6))}
            placeholder="ABC123"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg tracking-widest uppercase focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!codeIsValid}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Join
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
