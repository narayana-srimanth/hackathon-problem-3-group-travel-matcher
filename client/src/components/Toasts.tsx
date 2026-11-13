import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; kind: 'info' | 'error' };
const Ctx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

let next = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = next++;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]); // keep at most 3 on screen
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
