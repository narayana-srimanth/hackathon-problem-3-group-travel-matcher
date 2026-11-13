import { Link } from 'react-router-dom';
import { useDecideRequest, useGroupJoinRequests, useInterestLabel } from '../../api/hooks';
import type { Group } from '../../api/types';
import { errorMessage } from '../../lib/errors';
import { fmtDate, inr, plural, preferenceLabel } from '../../lib/format';
import { useToast } from '../../components/Toasts';
import { Avatar, ErrorBox, Spinner } from '../../components/ui';

/** M5 owner inbox (E16) with approve / reject (E18, E19). */
export function RequestsPanel({ group }: { group: Group }) {
  const { data, isLoading, isError, error, refetch } = useGroupJoinRequests(group.groupId, true);
  const decide = useDecideRequest(group.groupId);
  const label = useInterestLabel();
  const toast = useToast();

  if (isLoading) return <Spinner label="Loading requests" />;
  if (isError) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="empty">
        <h3>No pending requests</h3>
        <p className="muted">
          {group.status === 'OPEN'
            ? `${plural(group.freeSpots, 'spot')} still open. New requests show up here and in the badge on My trips.`
            : 'This group is no longer taking requests.'}
        </p>
      </div>
    );
  }

  const act = (requestId: string, name: string, action: 'approve' | 'reject') =>
    decide.mutate({ requestId, action }, {
      onSuccess: (d) => {
        toast(action === 'approve' ? `${name} joined the group` : `Declined ${name}'s request`);
        if (d.closedRequestIds.length) toast(`Group is full — ${plural(d.closedRequestIds.length, 'other request')} closed`);
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    });

  return (
    <div className="stack">
      <p className="muted small">Oldest first. {plural(group.freeSpots, 'spot')} left in your group.</p>
      {items.map(({ request: r, seeker: s }) => {
        const busy = decide.isPending && decide.variables?.requestId === r.requestId;
        return (
          <article key={r.requestId} className="card stack" style={{ ['--gap' as string]: '14px' }}>
            <div className="row between">
              <Link to={`/travellers/${s.travellerId}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar id={s.travellerId} name={s.name} />
                <span>
                  <strong className="display" style={{ fontSize: 20 }}>{s.name}</strong><br />
                  <span className="small muted">
                    {s.age ? `${s.age} · ` : ''}from {s.homeCity} · {preferenceLabel(s.genderPreference, s.gender)} · asked {fmtDate(r.createdAt.slice(0, 10))}
                  </span>
                </span>
              </Link>
              <span className="tag sun" style={{ fontSize: 15 }}>{r.matchSnapshot.score}% match</span>
            </div>

            <div className="chips">
              {s.interests.map((i) => (
                <span key={i} className={`tag ${r.matchSnapshot.sharedInterests.includes(i) ? 'sea' : 'outline'}`}>{label(i)}</span>
              ))}
            </div>
            <p className="small">
              {plural(r.matchSnapshot.sharedNights, 'shared night')} · {plural(r.matchSnapshot.sharedInterests.length, 'shared interest')} · budgets {inr(r.matchSnapshot.budgetDiffInr)} apart
            </p>
            {r.message && <blockquote className="card tight sea" style={{ margin: 0 }}>“{r.message}”</blockquote>}

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" disabled={busy} onClick={() => act(r.requestId, s.name, 'reject')}>Decline</button>
              <button className="btn ocean" disabled={busy || group.freeSpots === 0} onClick={() => act(r.requestId, s.name, 'approve')}>
                {busy ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
