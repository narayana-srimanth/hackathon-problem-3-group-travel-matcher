import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isApiError } from '../api/client';
import { useCreateGroup, useDestinations, useInterestLabel } from '../api/hooks';
import { useMe } from '../session/SessionContext';
import { TopBar } from '../components/Layout';
import { CityBanner } from '../components/CityArt';
import { ErrorBox, Field } from '../components/ui';
import { addDays, fmtRange, inr, nightsBetween, plural, preferenceLabel } from '../lib/format';

const SIZES = [1, 2, 3, 4]; // spec: maxSize 1–4, total people including the owner

export function CreateGroupPage() {
  const me = useMe();
  const navigate = useNavigate();
  const destinations = useDestinations();
  const label = useInterestLabel();
  const create = useCreateGroup();

  const win = destinations.data?.dataWindow;
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [maxSize, setMaxSize] = useState(3);
  const [budget, setBudget] = useState('');
  const [itinerary, setItinerary] = useState('');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const clear = (f: string) => setLocalErrors((e) => { if (!(f in e)) return e; const n = { ...e }; delete n[f]; return n; });

  const serverErrors = isApiError(create.error) ? create.error.fieldErrors() : {};
  const err = (f: string) => localErrors[f] ?? serverErrors[f];
  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 3) errs.name = 'Give your trip a name (at least 3 characters).';
    if (!city) errs.city = 'Choose a destination.';
    if (!checkIn) errs.checkIn = 'Choose a check-in date.';
    if (!checkOut) errs.checkOut = 'Choose a check-out date.';
    else if (checkIn && checkOut <= checkIn) errs.checkOut = 'Check-out must be after check-in.';
    const b = Number(budget);
    if (!budget || !Number.isInteger(b) || b < 1000) errs.budgetInr = 'Enter a budget of at least ₹1,000 per person.';
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(
      { name: name.trim(), city, checkIn, checkOut, maxSize, budgetInr: b, itinerary: itinerary.trim() },
      { onSuccess: ({ group }) => navigate(`/groups/${group.groupId}`) },
    );
  }

  return (
    <>
      <TopBar />
      <div className="stack" style={{ padding: '0 8px', ['--gap' as string]: '8px' }}>
        <h1>Post your trip</h1>
        <p className="muted" style={{ fontSize: 18 }}>Seekers whose dates, budget, interests and preferences fit will find it.</p>
      </div>

      <div className="split">
        <form className="card main stack" onSubmit={submit} noValidate style={{ ['--gap' as string]: '24px' }}>
          <Field label="Group name" error={err('name')}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('name')} className="input" value={name}
              maxLength={80} onChange={(e) => { clear('name'); setName(e.target.value); }} placeholder="Kyoto Spring Temples" />}
          </Field>

          <div className="grid" style={{ ['--min' as string]: '180px' }}>
            <Field label="Destination" error={err('city')}>
              {(id, d) => (
                <select id={id} aria-describedby={d} aria-invalid={!!err('city')} className="input" value={city} onChange={(e) => { clear('city'); setCity(e.target.value); }}>
                  <option value="" disabled>{destinations.isLoading ? 'Loading…' : 'Choose a city'}</option>
                  {destinations.data?.cities.map((c) => <option key={c.name} value={c.name}>{c.name}, {c.country}</option>)}
                </select>
              )}
            </Field>
            <Field label="Check-in" error={err('checkIn')}>
              {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('checkIn')} className="input" type="date"
                min={win?.from} max={win ? addDays(win.to, -1) : undefined} value={checkIn}
                onChange={(e) => { clear('checkIn'); setCheckIn(e.target.value); if (checkOut && e.target.value >= checkOut) setCheckOut(''); }} />}
            </Field>
            <Field label="Check-out" error={err('checkOut')}>
              {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('checkOut')} className="input" type="date"
                min={checkIn ? addDays(checkIn, 1) : win?.from} max={win?.to} value={checkOut} onChange={(e) => { clear('checkOut'); setCheckOut(e.target.value); }} />}
            </Field>
          </div>
          {win && (
            <p className="hint" style={{ marginTop: -14 }}>
              Trips run between {fmtRange(win.from, win.to)} {win.to.slice(0, 4)}{nights > 0 && ` · ${plural(nights, 'night')} selected`}
            </p>
          )}

          <div className="grid" style={{ ['--min' as string]: '220px' }}>
            <Field label="Budget per person (₹)" error={err('budgetInr')} hint="Approximate, for the whole stay">
              {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('budgetInr')} className="input" type="number"
                inputMode="numeric" min={1000} step={500} value={budget} onChange={(e) => { clear('budgetInr'); setBudget(e.target.value); }} placeholder="60000" />}
            </Field>
            <fieldset>
              <legend>Total group size (including you)</legend>
              <div className="segmented">
                {SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={maxSize === n} onClick={() => { clear('maxSize'); setMaxSize(n); }}>{n}</button>
                ))}
              </div>
              {err('maxSize') && <p className="field-error">{err('maxSize')}</p>}
            </fieldset>
          </div>

          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <span className="small strong muted">Matching uses your profile</span>
            <div className="chips">
              {me.interests.map((i) => <span key={i} className="tag">{label(i)}</span>)}
              <span className="tag outline">{preferenceLabel(me.genderPreference, me.gender)}</span>
            </div>
            <span className="hint">Seekers need at least 2 of these interests in common with you.</span>
          </div>

          <Field label="Proposed itinerary (optional)" error={err('itinerary')}>
            {(id, d) => <textarea id={id} aria-describedby={d} className="input" rows={5} maxLength={2000} value={itinerary}
              onChange={(e) => setItinerary(e.target.value)} placeholder={'Day 1 – Fushimi Inari at sunrise\nDay 2 – Nishiki Market and Gion walk'} />}
          </Field>

          {create.isError && <ErrorBox error={create.error} />}

          <hr className="divider" />
          <div className="row between">
            <Link to="/" className="small">Cancel</Link>
            <button className="btn primary lg" type="submit" disabled={create.isPending}>
              {create.isPending ? 'Publishing…' : 'Publish trip'}
            </button>
          </div>
        </form>

        <aside className="side stack" style={{ ['--gap' as string]: '14px' }}>
          <span className="small strong muted" style={{ paddingLeft: 6 }}>Live preview · how seekers see it</span>
          <article className="trip-card">
            <CityBanner city={city || 'Your destination'}>
              <span className="corner left tag">1 of {maxSize} filled</span>
            </CityBanner>
            <div className="trip-body">
              <div>
                <h3>{name.trim() || 'Your trip name'}</h3>
                <span className="small muted">by {me.name} · from {me.homeCity}</span>
              </div>
              <div className="facts">
                <div className="fact"><div className="k">Dates</div><div className="v">{checkIn && checkOut && checkOut > checkIn ? fmtRange(checkIn, checkOut) : '—'}</div></div>
                <div className="fact"><div className="k">Budget</div><div className="v">{budget ? `${inr(Number(budget))} / person` : '—'}</div></div>
              </div>
            </div>
          </article>
          <div className="card tight sun small">
            Join requests show up in <strong>My trips</strong> with a badge. You approve or decline each one.
          </div>
        </aside>
      </div>
    </>
  );
}
