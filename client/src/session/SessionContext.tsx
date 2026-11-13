import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { identity, isApiError, setUnauthenticatedHandler } from '../api/client';
import { getMe } from '../api/endpoints';
import type { Traveller } from '../api/types';

interface Session {
  status: 'loading' | 'signed-out' | 'signed-in';
  traveller: Traveller | null;
  signIn: (t: Traveller | string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [traveller, setTraveller] = useState<Traveller | null>(null);
  const [status, setStatus] = useState<Session['status']>(identity.get() ? 'loading' : 'signed-out');

  const signOut = useCallback(() => {
    identity.clear();
    qc.clear(); // never show one traveller's data to the next
    setTraveller(null);
    setStatus('signed-out');
  }, [qc]);

  // Pass a full Traveller (fresh sign-up) or just an ID ("Continue as").
  const signIn = useCallback(async (t: Traveller | string) => {
    qc.clear();
    if (typeof t !== 'string') {
      identity.set(t.travellerId);
      setTraveller(t);
      setStatus('signed-in');
      return;
    }
    identity.set(t);
    setStatus('loading');
    try {
      const { traveller } = await getMe();
      setTraveller(traveller);
      setStatus('signed-in');
    } catch (e) {
      identity.clear();
      setStatus('signed-out');
      throw e;
    }
  }, [qc]);

  // E07: restore the session on app load. 401 → the ID is gone (e.g. after a reset).
  useEffect(() => {
    if (!identity.get()) return;
    let cancelled = false;
    getMe()
      .then(({ traveller }) => { if (!cancelled) { setTraveller(traveller); setStatus('signed-in'); } })
      .catch((e) => {
        if (cancelled) return;
        if (isApiError(e) && e.code === 'UNAUTHENTICATED') identity.clear();
        setStatus('signed-out');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setUnauthenticatedHandler(signOut); }, [signOut]);

  const value = useMemo(() => ({ status, traveller, signIn, signOut }), [status, traveller, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/** For screens behind the sign-in guard, where a traveller always exists. */
export function useMe(): Traveller {
  const { traveller } = useSession();
  if (!traveller) throw new Error('useMe called while signed out');
  return traveller;
}
