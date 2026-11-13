import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInterestLabel, useTraveller, useTravellerReviews } from '../api/hooks';
import type { RatingSummary } from '../api/types';
import { avatarColour, fmtDate, fmtRange, genderLabel, initials, plural, preferenceLabel } from '../lib/format';
import { TopBar } from '../components/Layout';
import { Avatar, ErrorBox, Pager, Spinner } from '../components/ui';
import { RatingBadge, Stars } from '../components/Rating';

/** G2: a traveller's profile — interests, home city, age, co-traveller rating, reviews and groups (E06, E32). */
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
        <div className="main stack" style={{ ['--gap' as string]: '20px' }}>
          <section className="card stack" style={{ ['--gap' as string]: '20px' }}>
            <div className="row">
              <span className="avatar" aria-hidden="true" style={{ width: 72, height: 72, fontSize: 26, background: avatarColour(t.travellerId) }}>{initials(t.name)}</span>
              <div>
                <h1 style={{ fontSize: 40 }}>{t.name}</h1>
                <span className="muted">
                  {t.age ? `${t.age} · ` : ''}{genderLabel(t.gender)} · from {t.homeCity} ({t.homeAirport}) · travels with {preferenceLabel(t.genderPreference, t.gender).toLowerCase()}
                </span>
                <div style={{ marginTop: 6 }}><RatingBadge rating={data.rating} /></div>
              </div>
            </div>
            <div className="stack" style={{ ['--gap' as string]: '10px' }}>
              <span className="small strong muted">Interests</span>
              <div className="chips">{t.interests.map((i) => <span key={i} className="tag">{label(i)}</span>)}</div>
            </div>
          </section>
          <ReviewsSection travellerId={t.travellerId} firstName={t.name.split(' ')[0]} rating={data.rating} />
        </div>
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

/** What past co-travellers said (E32), newest first. */
function ReviewsSection({ travellerId, firstName, rating }: { travellerId: string; firstName: string; rating: RatingSummary }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useTravellerReviews(travellerId, page);

  return (
    <section className="card stack" aria-labelledby="reviews-heading">
      <div className="row between">
        <h2 id="reviews-heading" style={{ fontSize: 24 }}>Reviews from co-travellers</h2>
        {rating.count > 0 && rating.average !== null && (
          <span className="row" style={{ ['--row-gap' as string]: '8px' }}>
            <Stars value={rating.average} size={18} />
            <span className="small"><strong>{rating.average.toFixed(1)}</strong> <span className="muted">from {plural(rating.count, 'review')}</span></span>
          </span>
        )}
      </div>
      {isLoading && <Spinner label="Loading reviews" />}
      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
      {data && data.total === 0 && (
        <p className="muted small">
          No reviews yet. People who travel with {firstName} can rate them once their trip ends.
        </p>
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="review-list">
            {data.items.map(({ review: r, reviewer, trip }) => (
              <li key={r.reviewId} className="stack" style={{ ['--gap' as string]: '6px' }}>
                <div className="row between">
                  <span className="row" style={{ ['--row-gap' as string]: '10px' }}>
                    {reviewer ? (
                      <Link to={`/travellers/${reviewer.travellerId}`} className="row" style={{ textDecoration: 'none', color: 'inherit', ['--row-gap' as string]: '8px' }}>
                        <Avatar id={reviewer.travellerId} name={reviewer.name} size="xs" />
                        <span className="strong small">{reviewer.name}</span>
                      </Link>
                    ) : <span className="small muted">A former traveller</span>}
                    <Stars value={r.rating} size={15} />
                    <span className="sr-only">{r.rating} out of 5</span>
                  </span>
                  <span className="tiny muted">{fmtDate(r.createdAt.slice(0, 10))}</span>
                </div>
                {r.comment && <p style={{ margin: 0 }}>“{r.comment}”</p>}
                {trip && (
                  <span className="tiny muted">
                    Travelled together on <Link to={`/groups/${trip.groupId}`}>{trip.name}</Link> · {trip.city} · {fmtRange(trip.checkIn, trip.checkOut)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
