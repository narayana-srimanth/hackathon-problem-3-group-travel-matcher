import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createTraveller } from '../api/endpoints';
import { isApiError } from '../api/client';
import { useDestinations, useTravellers } from '../api/hooks';
import type { Gender, GenderPreference } from '../api/types';
import { useSession } from '../session/SessionContext';
import welcomePhoto from '../assets/welcome.jpg';
import { InterestPicker } from '../components/InterestPicker';
import { Logo } from '../components/Layout';
import { Avatar, ErrorBox, Field, Icon } from '../components/ui';
import { errorMessage } from '../lib/errors';

export function WelcomePage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const destinations = useDestinations();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [homeCity, setHomeCity] = useState('');
  const [genderPreference, setPref] = useState<GenderPreference | ''>('');
  const [interests, setInterests] = useState<string[]>([]);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const clear = (f: string) => setLocalErrors((e) => { if (!(f in e)) return e; const n = { ...e }; delete n[f]; return n; });

  const signUp = useMutation({
    mutationFn: createTraveller,
    onSuccess: async ({ traveller }) => { await signIn(traveller); navigate(from, { replace: true }); },
  });
  const serverErrors = isApiError(signUp.error) ? signUp.error.fieldErrors() : {};
  const err = (f: string) => localErrors[f] ?? serverErrors[f];

  function submit(e: FormEvent) {
    e.preventDefault();
    // Quick checks so people get instant feedback; the server still validates everything.
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Enter your name (at least 2 letters).';
    if (!gender) errs.gender = 'Choose your gender.';
    if (!homeCity) errs.homeCity = 'Choose your home city.';
    if (!genderPreference) errs.genderPreference = 'Choose who you are comfortable travelling with.';
    if (interests.length < 1) errs.interests = 'Pick at least one interest.';
    if (age && (Number(age) < 18 || Number(age) > 99)) errs.age = 'Age must be between 18 and 99.';
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    signUp.mutate({
      name: name.trim(), gender: gender as Gender, homeCity, interests,
      genderPreference: genderPreference as GenderPreference,
      ...(age ? { age: Number(age) } : {}),
    });
  }

  return (
    <div className="welcome" style={{ ['--photo' as string]: `url(${welcomePhoto})` }}>
      <section className="welcome-inner">
        <header className="topbar on-dark">
          <Logo />
          <span className="tag" style={{ background: 'rgba(247,243,233,0.14)', color: 'var(--cream)' }}>Step 1 of 2 · Your profile</span>
        </header>
        <div className="stack" style={{ maxWidth: 680, ['--gap' as string]: '14px' }}>
          <span className="pill-label">Travel solo, never alone</span>
          <h1>Find your people first. Then find your place.</h1>
          <p className="lede">Tell us a little about you. We match you with groups going to the same city, on the same dates, with the same vibe.</p>
        </div>

        <form className="card welcome-card" onSubmit={submit} noValidate>
          <div className="stack" style={{ ['--gap' as string]: '22px' }}>
            <div className="row between">
              <h2>Tell us about you</h2>
              <span className="small muted">No password needed. Your profile stays saved on this device.</span>
            </div>

            <div className="grid" style={{ ['--min' as string]: '210px' }}>
              <Field label="Full name" error={err('name')}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('name')} className="input" value={name}
                  onChange={(e) => { clear('name'); setName(e.target.value); }} placeholder="Priya Nair" autoComplete="name" maxLength={60} />}
              </Field>
              <Field label="Age (optional)" error={err('age')}>
                {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!err('age')} className="input" type="number"
                  min={18} max={99} value={age} onChange={(e) => { clear('age'); setAge(e.target.value); }} placeholder="26" />}
              </Field>
              <Field label="Gender" error={err('gender')}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} aria-invalid={!!err('gender')} className="input" value={gender}
                    onChange={(e) => { clear('gender'); setGender(e.target.value as Gender); }}>
                    <option value="" disabled>Choose</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                  </select>
                )}
              </Field>
              <Field label="Home city" error={err('homeCity')}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} aria-invalid={!!err('homeCity')} className="input" value={homeCity}
                    onChange={(e) => { clear('homeCity'); setHomeCity(e.target.value); }} disabled={!destinations.data}>
                    <option value="" disabled>{destinations.isLoading ? 'Loading…' : 'Choose'}</option>
                    {destinations.data?.departureCities.map((c) => (
                      <option key={c.city} value={c.city}>{c.city} ({c.airport})</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="I'm comfortable travelling with" error={err('genderPreference')}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} aria-invalid={!!err('genderPreference')} className="input" value={genderPreference}
                    onChange={(e) => { clear('genderPreference'); setPref(e.target.value as GenderPreference); }}>
                    <option value="" disabled>Choose</option>
                    <option value="SAME_GENDER">{gender === 'MALE' ? 'Men only' : gender === 'FEMALE' ? 'Women only' : 'My gender only'}</option>
                    <option value="ANY">Anyone</option>
                  </select>
                )}
              </Field>
            </div>

            <InterestPicker legend="Your interests" value={interests} onChange={(v) => { clear('interests'); setInterests(v); }} error={err('interests')} />

            {signUp.isError && !Object.keys(serverErrors).length && <ErrorBox error={signUp.error} />}

            <hr className="divider" />
            <div className="row between">
              <span className="small muted">Already have a profile? Pick it below.</span>
              <button className="btn primary lg" type="submit" disabled={signUp.isPending}>
                {signUp.isPending ? 'Creating profile…' : 'Continue'} <Icon name="arrow" />
              </button>
            </div>
          </div>
        </form>
        <ContinueAs onPicked={() => navigate(from, { replace: true })} />
      </section>
    </div>
  );
}

/** E05: "Continue as…" picker for existing travellers (seeded personas and earlier sign-ups). */
function ContinueAs({ onPicked }: { onPicked: () => void }) {
  const { signIn } = useSession();
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error } = useTravellers(q.trim());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  async function pick(id: string) {
    setBusyId(id);
    setPickError(null);
    try { await signIn(id); onPicked(); }
    catch (e) { setPickError(errorMessage(e)); }
    finally { setBusyId(null); }
  }

  return (
    <section className="card stack">
      <div className="row between">
        <h2 style={{ fontSize: 26 }}>Continue as</h2>
        <label className="row" style={{ ['--row-gap' as string]: '8px' }}>
          <span className="sr-only">Search travellers by name</span>
          <input className="input" style={{ width: 260, height: 42 }} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {isError && <ErrorBox error={error} />}
      {pickError && <div className="alert error">{pickError}</div>}
      {isLoading ? <span className="muted small">Loading travellers…</span> : (
        <div className="chips">
          {data?.items.map((t) => (
            <button key={t.travellerId} className="chip" style={{ height: 48, paddingLeft: 5 }} onClick={() => pick(t.travellerId)} disabled={busyId !== null}>
              <Avatar id={t.travellerId} name={t.name} size="sm" />
              <span>{t.name}</span>
              <span className="tiny muted">· {t.homeCity}</span>
            </button>
          ))}
          {data && data.items.length === 0 && <span className="muted small">No travellers match “{q}”.</span>}
        </div>
      )}
      {data && data.total > data.items.length && <span className="tiny muted">Showing {data.items.length} of {data.total}. Search by name to find others.</span>}
    </section>
  );
}
