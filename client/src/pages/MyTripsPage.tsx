import { Link } from 'react-router-dom';
import { useMyGroups, useMyJoinRequests, useWithdrawRequest } from '../api/hooks';
import type { Group, RequestStatus } from '../api/types';
import { errorMessage } from '../lib/errors';
import { fmtRange, inr, plural, requestStatusLabel } from '../lib/format';
import { TopBar } from '../components/Layout';
import { CityBanner } from '../components/CityArt';
import { useToast } from '../components/Toasts';
import { AvatarStack, ErrorBox, Spinner } from '../components/ui';

export function MyTripsPage() {
  const groups = useMyGroups();
  const requests = useMyJoinRequests();

  return (
    <>
      <TopBar />
      <div className="row between" style={{ padding: '0 8px' }}>
        <h1>My trips</h1>
        <div className="row"><Link to="/create" className="btn ghost">Create trip</Link><Link to="/search" className="btn ocean">Find groups</Link></div>
      </div>

      {groups.isLoading && <Spinner label="Loading your trips" />}
      {groups.isError && <ErrorBox error={groups.error} onRetry={() => groups.refetch()} />}
      {groups.data && (
        <>
          <TripSection title="Trips you host" groups={groups.data.owned} empty="You haven't posted a trip yet." />
          <TripSection title="Trips you've joined" groups={groups.data.memberOf} empty="You haven't joined a group yet." />
        </>
      )}

      <section className="stack">
        <h2 style={{ padding: '0 8px' }}>Your join requests</h2>
        {requests.isLoading && <Spinner label="Loading requests" />}
        {requests.isError && <ErrorBox error={requests.error} onRetry={() => requests.refetch()} />}
        {requests.data && requests.data.items.length === 0 && <p className="muted" style={{ padding: '0 8px' }}>No requests yet.</p>}
        {requests.data?.items.map(({ request: r, group: g }) => <RequestRow key={r.requestId} requestId={r.requestId} status={r.status}
          groupId={g.groupId} name={g.name} city={g.city} dates={fmtRange(g.checkIn, g.checkOut)} owner={g.owner.name} score={r.matchSnapshot.score} />)}
      </section>
    </>
  );
}

function TripSection({ title, groups, empty }: { title: string; groups: Group[]; empty: string }) {
  return (
    <section className="stack">
      <h2 style={{ padding: '0 8px' }}>{title}</h2>
      {groups.length === 0 ? <p className="muted" style={{ padding: '0 8px' }}>{empty}</p> : (
        <div className="grid-fill">
          {groups.map((g) => {
            const pending = g.viewer.pendingRequestCount ?? 0;
            return (
              <Link key={g.groupId} to={`/groups/${g.groupId}`} className="trip-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <CityBanner city={g.city} height={150}>
                  <span className="corner left tag">{g.status === 'BOOKED' ? 'Booked' : `${g.memberCount} of ${g.maxSize} filled`}</span>
                  {pending > 0 && <span className="corner right tag coral">{plural(pending, 'new request')}</span>}
                </CityBanner>
                <div className="trip-body">
                  <h3>{g.name}</h3>
                  <span className="small muted">{fmtRange(g.checkIn, g.checkOut)} · {plural(g.nights, 'night')} · {inr(g.budgetInr)} / person</span>
                  <AvatarStack people={g.members} size="xs" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

const statusTagClass: Record<RequestStatus, string> = {
  PENDING: 'coral', APPROVED: 'sea', REJECTED: 'danger', WITHDRAWN: 'outline', CLOSED: 'outline',
};

function RequestRow(p: { requestId: string; status: RequestStatus; groupId: string; name: string; city: string; dates: string; owner: string; score: number }) {
  const withdraw = useWithdrawRequest();
  const toast = useToast();
  return (
    <div className="card tight row between">
      <span>
        <Link to={`/groups/${p.groupId}`} className="strong">{p.name}</Link>
        <span className="small muted"> · {p.city} · {p.dates} · hosted by {p.owner} · {p.score}% match</span>
      </span>
      <span className="row" style={{ ['--row-gap' as string]: '10px' }}>
        <span className={`tag ${statusTagClass[p.status]}`}>{requestStatusLabel[p.status]}</span>
        {p.status === 'PENDING' && (
          <button className="btn sm danger" disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(p.requestId, { onSuccess: () => toast('Request withdrawn'), onError: (e) => toast(errorMessage(e), 'error') })}>
            Withdraw
          </button>
        )}
      </span>
    </div>
  );
}
