import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCreateReview, useGroupReviews } from '../../api/hooks';
import type { RatedTraveller, Review } from '../../api/types';
import { errorMessage } from '../../lib/errors';
import { fmtDateLong } from '../../lib/format';
import { useToast } from '../../components/Toasts';
import { Avatar, ErrorBox, Spinner } from '../../components/ui';
import { RatingBadge, StarInput, Stars } from '../../components/Rating';

const COMMENT_MAX = 500;

/**
 * Members rate each co-traveller once, from the trip's check-out date (E30, E31).
 * The server decides when reviews open; the client only shows what it says.
 */
export function ReviewsPanel({ groupId }: { groupId: string }) {
  const { data, isLoading, isError, error, refetch } = useGroupReviews(groupId);

  return (
    <section className="card stack" aria-labelledby="rate-heading" style={{ marginTop: 20 }}>
      <div>
        <h2 id="rate-heading" style={{ fontSize: 24 }}>Rate your co-travellers</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Ratings appear on each traveller's profile, so future groups know who they're travelling with.
        </p>
      </div>
      {isLoading && <Spinner label="Loading reviews" />}
      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
      {data && !data.open && (
        <div className="alert info">
          Ratings open on <strong>{fmtDateLong(data.opensOn)}</strong>, when this trip ends. You'll be able to rate everyone you travelled with.
        </div>
      )}
      {data && data.open && data.coTravellers.length === 0 && (
        <p className="muted small">Nobody else was on this trip, so there's no one to rate.</p>
      )}
      {data && data.open && data.coTravellers.length > 0 && (
        <ul className="review-list">
          {data.coTravellers.map(({ traveller, myReview }) => (
            <li key={traveller.travellerId}>
              <ReviewRow groupId={groupId} traveller={traveller} myReview={myReview} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewRow({ groupId, traveller: t, myReview }: { groupId: string; traveller: RatedTraveller; myReview: Review | null }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const create = useCreateReview(groupId);
  const toast = useToast();
  const first = t.name.split(' ')[0];

  const submit = () => {
    if (rating < 1) return;
    create.mutate(
      { revieweeId: t.travellerId, rating, comment: comment.trim() || undefined },
      { onSuccess: () => toast(`Thanks! Your rating of ${first} is on their profile.`), onError: (e) => toast(errorMessage(e), 'error') },
    );
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      <div className="row between">
        <Link to={`/travellers/${t.travellerId}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Avatar id={t.travellerId} name={t.name} size="sm" />
          <span><span className="strong">{t.name}</span><br /><span className="tiny muted">from {t.homeCity}</span></span>
        </Link>
        <RatingBadge rating={t.rating} />
      </div>

      {myReview ? (
        <div className="small">
          <span className="muted">You rated {first} </span>
          <Stars value={myReview.rating} size={15} />
          <span className="sr-only">{myReview.rating} out of 5</span>
          {myReview.comment && <p style={{ margin: '6px 0 0' }}>“{myReview.comment}”</p>}
        </div>
      ) : (
        <form className="stack" style={{ ['--gap' as string]: '8px' }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <StarInput value={rating} onChange={setRating} label={`Your rating for ${t.name}`} disabled={create.isPending} />
          <textarea className="input" rows={2} maxLength={COMMENT_MAX} value={comment} disabled={create.isPending}
            aria-label={`Comment about ${t.name} (optional)`} placeholder={`What was ${first} like to travel with? (optional)`}
            onChange={(e) => setComment(e.target.value)} />
          <div className="row between">
            <span className="tiny muted">You can rate each person once per trip.</span>
            <button className="btn ocean" type="submit" disabled={rating < 1 || create.isPending}>
              {create.isPending ? 'Saving…' : 'Submit rating'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
