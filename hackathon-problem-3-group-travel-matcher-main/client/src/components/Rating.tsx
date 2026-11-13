import { useId } from 'react';
import type { RatingSummary } from '../api/types';
import { plural } from '../lib/format';

/** Five stars filled to `value` (0–5, fractions allowed). Decorative: always pair with text. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span className="stars" aria-hidden="true" style={{ fontSize: size }}>
      <span className="stars-empty">★★★★★</span>
      <span className="stars-full" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

/** "★ 4.5 · 2 reviews", or "New · no reviews yet". All numbers come from the server. */
export function RatingBadge({ rating, compact = false }: { rating: RatingSummary | undefined; compact?: boolean }) {
  if (!rating || rating.count === 0 || rating.average === null) {
    return <span className="rating-badge none" title="No co-traveller reviews yet">{compact ? 'New' : 'No reviews yet'}</span>;
  }
  const label = `Rated ${rating.average.toFixed(1)} out of 5 by ${plural(rating.count, 'co-traveller')}`;
  return (
    <span className="rating-badge" title={label} aria-label={label}>
      <span className="star" aria-hidden="true">★</span>
      <strong>{rating.average.toFixed(1)}</strong>
      <span className="muted">{compact ? `(${rating.count})` : `· ${plural(rating.count, 'review')}`}</span>
    </span>
  );
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Pick 1–5 whole stars. A real radio group, so it works with the keyboard and screen readers. */
export function StarInput({ value, onChange, label, disabled }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="star-input" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? 'on' : ''} title={WORDS[n]}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{plural(n, 'star')} – {WORDS[n]}</span>
        </label>
      ))}
      <span className="small muted star-word" aria-hidden="true">{WORDS[value] ?? ''}</span>
    </fieldset>
  );
}
