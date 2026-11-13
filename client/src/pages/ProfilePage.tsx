import { Link, useParams } from 'react-router-dom';
import { useInterestLabel, useTraveller } from '../api/hooks';
import { avatarColour, fmtRange, genderLabel, initials, preferenceLabel } from '../lib/format';
import { TopBar } from '../components/Layout';
import { ErrorBox, Spinner } from '../components/ui';

/** G2: a traveller's profile — interests, home city, age and the groups they're in (E06). */
export function ProfilePage() {
  const { travellerId = '' } = useParams();
  const { data, isLoading, isError, error, refetch } = useTraveller(travellerId);
  const label = useInterestLabel();

  if (isLoading) return <><TopBar /><Spinner label="Loading profile" /></>;
  if (isError || !data) return <><TopBar /><ErrorBox error={error} onRetry={() => refetch()} /></>;
  const t = data.traveller;

  return (
    <>
      <TopBar />
      <div className="split">
        <section className="card main stack" style={{ ['--gap' as string]: '20px' }}>
          <div className="row">
            <span className="avatar" aria-hidden="true" style={{ width: 72, height: 72, fontSize: 26, background: avatarColour(t.travellerId) }}>{initials(t.name)}</span>
            <div>
              <h1 style={{ fontSize: 40 }}>{t.name}</h1>
              <span className="muted">
                {t.age ? `${t.age} · ` : ''}{genderLabel(t.gender)} · from {t.homeCity} ({t.homeAirport}) · travels with {preferenceLabel(t.genderPreference, t.gender).toLowerCase()}
              </span>
            </div>
          </div>
          <div className="stack" style={{ ['--gap' as string]: '10px' }}>
            <span className="small strong muted">Interests</span>
            <div className="chips">{t.interests.map((i) => <span key={i} className="tag">{label(i)}</span>)}</div>
          </div>
        </section>
        <section className="card side stack">
          <h2 style={{ fontSize: 24 }}>Groups</h2>
          {data.groups.length === 0 ? <p className="muted small">Not in any group yet.</p> : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '10px' }}>
              {data.groups.map((g) => (
                <li key={g.groupId} className="row between">
                  <Link to={`/groups/${g.groupId}`}>{g.name}</Link>
                  <span className="tiny muted">{g.city} · {fmtRange(g.checkIn, g.checkOut)} · {g.role === 'OWNER' ? 'Owner' : 'Member'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
