import { useEffect, useId, useRef, type ReactNode } from 'react';
import { avatarColour, initials } from '../lib/format';
import { errorLines, errorMessage } from '../lib/errors';

// ---------- Icons (inline stroke SVG, inherit colour) ----------
const paths = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  search: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM20 20l-4.5-4.5',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  flag: 'M4 21V4M4 4h12l-2 4 2 4H4',
  bookmark: 'M6 4h12v17l-6-4-6 4z',
  thumb: 'M7 11v9H4v-9h3zm0 0l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7',
  clock: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l3 2',
  star: 'M12 4l2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.6-.8z',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  users: 'M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5',
  bed: 'M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

export function LogoMark() {
  return (
    <span className="logo-mark">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F3138" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" />
        <path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5" />
      </svg>
    </span>
  );
}

// ---------- People ----------
export function Avatar({ id, name, size }: { id: string; name: string; size?: 'sm' | 'xs' }) {
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: avatarColour(id) }} title={name} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, size = 'sm' }: { people: { travellerId: string; name: string }[]; size?: 'sm' | 'xs' }) {
  return (
    <span className="avatars" aria-label={people.map((p) => p.name).join(', ')}>
      {people.map((p) => <Avatar key={p.travellerId} id={p.travellerId} name={p.name} size={size} />)}
    </span>
  );
}

// ---------- Feedback ----------
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="center-pad" role="status">
      <div className="spinner" />
      <span className="muted small">{label}…</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const lines = errorLines(error);
  return (
    <div className="alert error" role="alert">
      <div className="row between">
        <strong>{errorMessage(error)}</strong>
        {onRetry && <button className="btn sm danger" onClick={onRetry}>Try again</button>}
      </div>
      {lines.length > 0 && <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}

// ---------- Forms ----------
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, describedBy)}
      {hint && <span id={hintId} className="hint">{hint}</span>}
      {error && <span id={errId} className="field-error">{error}</span>}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, textarea, select, a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="row between">
          <h2 id={titleId} style={{ fontSize: 26 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Pagination ----------
export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="row" aria-label="Pages" style={{ justifyContent: 'center' }}>
      <button className="btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small muted">Page {page} of {pages}</span>
      <button className="btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
