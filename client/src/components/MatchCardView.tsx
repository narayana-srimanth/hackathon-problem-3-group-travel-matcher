import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchCard } from '../api/types';
import { useInterestLabel } from '../api/hooks';
import { fmtRange, inr, plural } from '../lib/format';
import { CityBanner } from './CityArt';
import { JoinRequestModal } from './JoinRequestModal';
import { Icon } from './ui';

/** One search result. Every number and reason comes from the server's MatchCard. */
export function MatchCardView({ m, searchId }: { m: MatchCard; searchId: string }) {
  const label = useInterestLabel();
  const [asking, setAsking] = useState(false);
  const r = m.reasons;
  const status = m.viewerRequestStatus;

  return (
    <article className="trip-card">
      <CityBanner city={m.city}>
        <span className="corner left tag sun" style={{ fontSize: 15, padding: '7px 14px' }}>{m.score}% match</span>
        <span className="corner right tag">{m.memberCount} of {m.maxSize} filled</span>
      </CityBanner>
      <div className="trip-body">
        <div>
          <h3>{m.name}</h3>
          <span className="small muted">by {m.owner.name} · {fmtRange(m.checkIn, m.checkOut)} · {inr(m.budgetInr)} / person</span>
        </div>

        <ul className="reason-list" aria-label="Why this matches">
          <li><span className="tick"><Icon name="check" size={12} stroke={3} /></span>
            {plural(r.sharedNights, 'night')} together ({fmtRange(r.sharedFrom, r.sharedTo)})</li>
          <li><span className="tick"><Icon name="check" size={12} stroke={3} /></span>
            You both like {r.sharedInterests.map(label).join(', ')}</li>
          <li><span className="tick"><Icon name="check" size={12} stroke={3} /></span>
            Budgets {inr(r.budgetDiffInr)} apart (limit {inr(r.budgetLimitInr)})</li>
          <li><span className="tick"><Icon name="check" size={12} stroke={3} /></span>{r.gender}</li>
          <li><span className="tick"><Icon name="check" size={12} stroke={3} /></span>
            {r.spotsAfterJoin === 0 ? 'You would take the last spot' : `${plural(r.spotsAfterJoin, 'spot')} left after you join`}</li>
        </ul>

        <div className="row" style={{ marginTop: 'auto', paddingTop: 6 }}>
          <Link to={`/groups/${m.groupId}?search=${searchId}`} className="btn ghost" style={{ flex: 1 }}>View details</Link>
          {status === 'PENDING' ? (
            <span className="btn coral" style={{ flex: 1, cursor: 'default' }}><Icon name="clock" /> Requested</span>
          ) : status === 'APPROVED' ? (
            <Link to={`/groups/${m.groupId}`} className="btn primary" style={{ flex: 1 }}>You're in</Link>
          ) : (
            <button className="btn ocean" style={{ flex: 1 }} onClick={() => setAsking(true)}>
              {status === 'REJECTED' || status === 'WITHDRAWN' || status === 'CLOSED' ? 'Ask again' : 'Request to join'}
            </button>
          )}
        </div>
      </div>
      {asking && (
        <JoinRequestModal groupId={m.groupId} groupName={m.name} ownerName={m.owner.name} searchId={searchId} onClose={() => setAsking(false)} />
      )}
    </article>
  );
}
