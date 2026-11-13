import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isApiError } from '../api/client';
import { useCreateSearch, useDestinations, useInterestLabel, useMatches, useSearch } from '../api/hooks';
import type { GenderComposition, GenderPreference, Search } from '../api/types';
import { useMe } from '../session/SessionContext';
import { TopBar } from '../components/Layout';
import { InterestPicker } from '../components/InterestPicker';
import { MatchCardView } from '../components/MatchCardView';
import { ErrorBox, Field, Icon, Pager, Spinner } from '../components/ui';
import { addDays, fmtRange, plural } from '../lib/format';

const PAGE_SIZE = 12;

export function SearchPage() {
  const { searchId } = useParams();
  const search = useSearch(searchId);

  return (
    <>
      <section className="hero">
        <TopBar onDark />
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', ['--gap' as string]: '12px' }}>
          <h1>Find your travel crew</h1>
          <p className="lede">Only groups that pass every matching rule show up. Best matches first.</p>
        </div>
        {searchId && search.isLoading ? <div className="card"><Spinner label="Loading your search" /></div> : (
          // `key` resets the form when a different saved search loads.
          <SearchForm key={search.data?.searchId ?? 'new'} initial={search.data} />
        )}
      </section>

      {searchId && search.isError && <ErrorBox error={search.error} />}
      {searchId && search.data && <Results search={search.data} />}
    </>
  );
}

// ---------- Search form (M3) ----------
function SearchForm({ initial }: { initial?: Search }) {
  const me = useMe();
  const navigate = useNavigate();
  const destinations = useDestinations();
  const create = useCreateSearch();
  const win = destinations.data?.dataWindow;

  // Pre-fill from the saved search, or from the profile for a new one.
  const [homeCity, setHomeCity] = useState(initial?.homeCity ?? me.homeCity);
  const [city, setCity] = useState(initial?.city ?? '');
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? '');
  const [budget, setBudget] = useState(initial ? String(initial.budgetInr) : '');
  const [pref, setPref] = useState<GenderPreference>(initial?.genderPreference ?? me.genderPreference);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? me.interests);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const clear = (f: string) => setLocalErrors((e) => { if (!(f in e)) return e; const n = { ...e }; delete n[f]; return n; });

  const serverErrors = isApiError(create.error) ? create.error.fieldErrors() : {};
  const err = (f: string) => localErrors[f] ?? serverErrors[f];

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!city) errs.city = 'Choose a destination.';
    if (!checkIn) errs.checkIn = 'Choose check-in.';
    if (!checkOut) errs.checkOut = 'Choose check-out.';
    else if (checkIn && checkOut <= checkIn) errs.checkOut = 'Must be after check-in.';
    const b = Number(budget);
    if (!budget || !Number.isInteger(b) || b < 1000) errs.budgetInr = 'At least ₹1,000.';
    if (interests.length < 1) errs.interests = 'Pick at least one interest.';
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(
      { homeCity, city, checkIn, checkOut, interests, budgetInr: b, genderPreference: pref, limit: PAGE_SIZE },
      { onSuccess: ({ search }) => navigate(`/search/${search.searchId}`) },
    );
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate style={{ ['--gap' as string]: '18px', borderRadius: 24 }}>
      <div className="grid" style={{ ['--min' as string]: '170px', ['--grid-gap' as string]: '14px' }}>
        <Field label="Home city" error={err('homeCity')}>
          {(id, d) => (
            <select id={id} aria-describedby={d} className="input" value={homeCity} onChange={(e) => setHomeCity(e.target.value)}>
              {destinations.data?.departureCities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
            </select>
          )}
        </Field>
        <Field label="Destination" error={err('city')}>
          {(id, d) => (
            <select id={id} aria-describedby={d} aria-invalid={!!err('city')} className="input" value={city} onChange={(e) => { clear('city'); setCity(e.target.value); }}>
              <option value="" disabled>Choose</option>
              {destinations.data?.cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
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
        <Field label="Budget (₹ / person)" error={err('budgetInr')}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('budgetInr')} className="input" type="number"
            inputMode="numeric" min={1000} step={500} value={budget} onChange={(e) => { clear('budgetInr'); setBudget(e.target.value); }} placeholder="62000" />}
        </Field>
        <Field label="Travel with" error={err('genderPreference')}>
          {(id, d) => (
            <select id={id} aria-describedby={d} className="input" value={pref} onChange={(e) => setPref(e.target.value as GenderPreference)}>
              <option value="SAME_GENDER">{me.gender === 'FEMALE' ? 'Women only' : 'Men only'}</option>
              <option value="ANY">Anyone</option>
            </select>
          )}
        </Field>
      </div>
      <InterestPicker legend="Interests" size="sm" value={interests} onChange={(v) => { clear('interests'); setInterests(v); }} error={err('interests')} />
      {create.isError && !Object.keys(serverErrors).length && <ErrorBox error={create.error} />}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary lg" type="submit" disabled={create.isPending}>
          <Icon name="search" /> {create.isPending ? 'Searching…' : 'Search groups'}
        </button>
      </div>
    </form>
  );
}

// ---------- Results (M4 + G1 filters) ----------
function Results({ search }: { search: Search }) {
  const label = useInterestLabel();
  // Filters live in the URL, so a refresh keeps them.
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sharedInterest = params.getAll('sharedInterest');
  const genderComposition = (params.get('genderComposition') as GenderComposition | null) ?? undefined;

  const filters = {
    page,
    limit: PAGE_SIZE,
    ...(sharedInterest.length ? { sharedInterest } : {}),
    ...(genderComposition ? { genderComposition } : {}),
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useMatches(search.searchId, filters);

  const update = (fn: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    fn(next);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const toggleInterest = (id: string) => update((p) => {
    const cur = p.getAll('sharedInterest');
    p.delete('sharedInterest');
    (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]).forEach((x) => p.append('sharedInterest', x));
  });
  const setComposition = (v: string) => update((p) => { if (v) p.set('genderComposition', v); else p.delete('genderComposition'); });
  const filtered = sharedInterest.length > 0 || !!genderComposition;

  const total = data?.matches.total ?? 0;

  return (
    <section className="stack" style={{ ['--gap' as string]: '22px' }}>
      <div className="row between" style={{ padding: '0 8px', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: 34 }}>
            {isLoading ? 'Finding matches…' : <>{plural(total, 'group')} <span style={{ color: 'var(--seafoam)' }}>match your trip</span></>}
          </h2>
          <p className="muted">{search.city} · {fmtRange(search.checkIn, search.checkOut)} · sorted by best match{isFetching && !isLoading ? ' · updating…' : ''}</p>
        </div>
        <div className="row" style={{ ['--row-gap' as string]: '8px' }}>
          <span className="small muted">Filter</span>
          {search.interests.map((i) => (
            <button key={i} className="chip sm" aria-pressed={sharedInterest.includes(i)} onClick={() => toggleInterest(i)}>{label(i)}</button>
          ))}
          <label>
            <span className="sr-only">Group make-up</span>
            <select className="input" style={{ height: 34, width: 'auto', borderRadius: 999, fontSize: 14 }}
              value={genderComposition ?? ''} onChange={(e) => setComposition(e.target.value)}>
              <option value="">Any group make-up</option>
              <option value="ALL_FEMALE">All-female groups</option>
              <option value="ALL_MALE">All-male groups</option>
              <option value="MIXED">Mixed groups</option>
            </select>
          </label>
        </div>
      </div>

      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}

      {data && total === 0 && (
        <div className="empty">
          <h3>{filtered ? 'No groups match these filters' : 'No groups match yet'}</h3>
          {filtered ? (
            <button className="btn ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button>
          ) : data.emptyStateHints.length > 0 ? (
            <ul className="reason-list" style={{ textAlign: 'left' }}>
              {data.emptyStateHints.map((h, i) => (
                <li key={i}>
                  <span className="tick"><Icon name="arrow" size={12} stroke={3} /></span>
                  <span>{h.message}{h.groupId && <> · <Link to={`/groups/${h.groupId}?search=${search.searchId}`}>See why</Link></>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Try different dates, a wider budget or more interests — or create your own trip.</p>
          )}
          {!filtered && <Link to="/create" className="btn ocean">Create a trip instead</Link>}
        </div>
      )}

      {data && total > 0 && (
        <>
          <div className="grid-fill">
            {data.matches.items.map((m) => <MatchCardView key={m.groupId} m={m} searchId={search.searchId} />)}
          </div>
          <Pager page={data.matches.page} limit={data.matches.limit} total={total}
            onPage={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); setParams(n); }} />
        </>
      )}
    </section>
  );
}
