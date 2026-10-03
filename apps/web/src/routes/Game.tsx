import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { GameCodeSchema } from '@beer/game';
import { Board } from '../components/Board';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Lobby } from '../components/Lobby';
import { Notice } from '../components/Notice';
import { Results } from '../components/Results';
import { useGameSocket } from '../hooks/useGameSocket';
import { getToken, saveToken } from '../lib/session';

const gameRoute = getRouteApi('/game/$code');

export function GamePage() {
  const { code } = gameRoute.useParams();

  if (!GameCodeSchema.safeParse(code).success) {
    return (
      <Notice title="That is not a game code" backHome>
        Codes are six letters and digits, like ABC123.
      </Notice>
    );
  }
  // A new code means a new game: start with a fresh socket and token.
  return <GameScreen key={code} code={code} />;
}

function GameScreen({ code }: { code: string }) {
  const [token, setToken] = useState(() => getToken(code));
  const { view, connected, lastError, sendingOrder, placeOrder } = useGameSocket(code, token);

  function handleJoined(newToken: string) {
    saveToken(code, newToken);
    setToken(newToken);
  }

  if (!view) {
    return lastError ? (
      <Notice title="Cannot open this game" backHome>
        {lastError}
      </Notice>
    ) : (
      <Notice title="Connecting…">
        <LoaderCircle className="mx-auto size-6 animate-spin text-amber-600" aria-hidden />
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      {connected ? null : <ConnectionBanner />}
      {view.status === 'lobby' ? (
        <Lobby view={view} onJoined={handleJoined} />
      ) : view.status === 'playing' ? (
        <Board view={view} lastError={lastError} sendingOrder={sendingOrder} canOrder={connected} onOrder={placeOrder} />
      ) : (
        <Results view={view} />
      )}
    </div>
  );
}
