import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEvaluation, useGroup, useWithdrawRequest } from '../api/hooks';
import type { Group } from '../api/types';
import { errorMessage } from '../lib/errors';
import { fmtRange, inr, plural, ruleLabel } from '../lib/format';
import { TopBar } from '../components/Layout';
import { JoinRequestModal } from '../components/JoinRequestModal';
import { useToast } from '../components/Toasts';
import { Avatar, AvatarStack, ErrorBox, Icon, Spinner } from '../components/ui';
import { RequestsPanel } from './group/RequestsPanel';
import { HotelsPanel } from './group/HotelsPanel';
import { ShortlistPanel } from './group/ShortlistPanel';
import { BookingPanel } from './group/BookingPanel';

type Tab = 'overview' | 'requests' | 'hotels' | 'shortlist' | 'booking';

export function GroupPage() {
  const { groupId = '' } = useParams();
  const { data: group, isLoading, isError, error, refetch } = useGroup(groupId);

  if (isLoading) return <><TopBar /><Spinner label="Loading the group" /></>;
  if (isError || !group) return <><TopBar /><ErrorBox error={error} onRetry={() => refetch()} /></>;

  const isMember = group.viewer.relation === 'OWNER' || group.viewer.relation === 'MEMBER';
  return (
    <>
      <TopBar />
      <GroupHeader group={group} />
      {isMember ? <MemberView group={group} /> : <VisitorView group={group} />}
    </>
  );
}

function statusTag(g: Group) {
  if (g.status === 'BOOKED') return <span className="tag sun">Booked</span>;
  if (g.status === 'FULL') return <span className="tag sea">Group formed · {g.memberCount} of {g.maxSize}</span>;
  return <span className="tag sea">{plural(g.freeSpots, 'spot')} open · {g.memberCount} of {g.maxSize}</span>;
}

function GroupHeader({ group: g }: { group: Group }) {
  return (
    <section className="hero compact">
      <div className="stack" style={{ ['--gap' as string]: '10px' }}>
        <div className="row" style={{ ['--row-gap' as string]: '8px' }}>
          {statusTag(g)}
          {g.viewer.relation === 'OWNER' && <span className="tag" style={{ background: 'rgba(247,243,233,0.14)', color: 'var(--cream)' }}>You own this trip</span>}
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 4.5vw, 48px)' }}>{g.name}</h1>
        <span style={{ color: 'var(--seafoam-soft)', fontSize: 17 }}>
          {g.city}, {g.country} · {fmtRange(g.checkIn, g.checkOut)} {g.checkIn.slice(0, 4)} · {plural(g.nights, 'night')} · {inr(g.budgetInr)} / person
        </span>
      </div>
      <div className="row">
        <AvatarStack people={g.members} />
        <span style={{ color: 'var(--seafoam-soft)' }}>hosted by {g.owner.name}</span>
      </div>
    </section>
  );
}

// ---------- Members (owner + approved) ----------
function MemberView({ group }: { group: Group }) {
  const isOwner = group.viewer.relation === 'OWNER';
  const pending = group.viewer.pendingRequestCount ?? 0;
  const [params, setParams] = useSearchParams();
  const fallback: Tab = group.status === 'BOOKED' ? 'booking' : isOwner && pending > 0 ? 'requests' : 'hotels';
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && (raw !== 'requests' || isOwner) ? raw : fallback;
  const go = (t: Tab) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ...(isOwner ? [['requests', 'Join requests'] as [Tab, string]] : []),
    ['hotels', 'Hotels'],
    ['shortlist', 'Shortlist and votes'],
    ['booking', 'Booking and split'],
  ];

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Group sections">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)}>
            {l}{t === 'requests' && pending > 0 && <span className="badge">{pending}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <Overview group={group} />}
        {tab === 'requests' && isOwner && <RequestsPanel group={group} />}
        {tab === 'hotels' && <HotelsPanel group={group} onSaved={() => go('shortlist')} />}
        {tab === 'shortlist' && <ShortlistPanel group={group} onBooked={() => go('booking')} onBrowse={() => go('hotels')} />}
        {tab === 'booking' && <BookingPanel group={group} onShortlist={() => go('shortlist')} />}
      </div>
    </>
  );
}

function Overview({ group: g }: { group: Group }) {
  return (
    <div className="split">
      <section className="card main stack">
        <h2 style={{ fontSize: 26 }}>Itinerary</h2>
        {g.itinerary ? <p style={{ whiteSpace: 'pre-line' }}>{g.itinerary}</p> : <p className="muted">No itinerary yet.</p>}
        <hr className="divider" />
        <div className="facts">
          <div className="fact"><div className="k">Dates</div><div className="v">{fmtRange(g.checkIn, g.checkOut)} ({plural(g.nights, 'night')})</div></div>
          <div className="fact"><div className="k">Budget</div><div className="v">{inr(g.budgetInr)} / person</div></div>
          <div className="fact"><div className="k">Group size</div><div className="v">{g.memberCount} of {g.maxSize}</div></div>
          <div className="fact"><div className="k">Local time zone</div><div className="v">{g.timezone}</div></div>
        </div>
      </section>
      <section className="card side stack">
        <h2 style={{ fontSize: 24 }}>Members</h2>
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '12px' }}>
          {g.members.map((m) => (
            <li key={m.travellerId}>
              <Link to={`/travellers/${m.travellerId}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar id={m.travellerId} name={m.name} size="sm" />
                <span style={{ flex: 1 }}>{m.name}<br /><span className="tiny muted">from {m.homeCity}</span></span>
                {m.isOwner && <span className="tag">Owner</span>}
              </Link>
            </li>
          ))}
          {Array.from({ length: g.freeSpots }).map((_, i) => (
            <li key={`open-${i}`} className="row muted small"><span className="avatar sm" style={{ border: '1.5px dashed var(--seafoam)' }} />Open spot</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------- Visitors (seekers looking at a group) ----------
function VisitorView({ group: g }: { group: Group }) {
  const [params] = useSearchParams();
  const searchId = params.get('search') ?? undefined;
  const evaluation = useEvaluation(searchId, g.groupId);
  const withdraw = useWithdrawRequest();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const rel = g.viewer.relation;

  let action;
  if (g.status === 'BOOKED') action = <div className="alert info">This group has booked and is closed.</div>;
  else if (rel === 'PENDING') action = (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      <div className="alert warn"><Icon name="clock" size={16} /> Your request is waiting for {g.owner.name.split(' ')[0]}.</div>
      <button className="btn danger" disabled={withdraw.isPending || !g.viewer.requestId}
        onClick={() => withdraw.mutate(g.viewer.requestId!, {
          onSuccess: () => toast('Request withdrawn'), onError: (e) => toast(errorMessage(e), 'error'),
        })}>
        {withdraw.isPending ? 'Withdrawing…' : 'Withdraw request'}
      </button>
    </div>
  );
  else if (g.status === 'FULL') action = <div className="alert info">This group is full.</div>;
  else if (!searchId) action = (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      {rel === 'REJECTED' && <div className="alert info">Your last request was declined. You can search and ask again.</div>}
      <p className="small muted">To ask to join, find this group from a search with your dates and budget.</p>
      <Link to="/search" className="btn ocean">Search groups</Link>
    </div>
  );
  else action = (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      {rel === 'REJECTED' && <div className="alert info">Your last request was declined. You can ask again.</div>}
      <button className="btn ocean lg" disabled={evaluation.data ? !evaluation.data.eligible : false} onClick={() => setAsking(true)}>
        Request to join
      </button>
      {evaluation.data && !evaluation.data.eligible && <span className="small muted">You can only ask when every rule passes.</span>}
    </div>
  );

  return (
    <div className="split">
      <div className="main stack">
        <Overview group={g} />
      </div>
      <aside className="side stack">
        {searchId && (
          <section className="card stack" style={{ ['--gap' as string]: '12px' }}>
            <h2 style={{ fontSize: 24 }}>Does it fit your search?</h2>
            {evaluation.isLoading && <Spinner label="Checking the rules" />}
            {evaluation.isError && <ErrorBox error={evaluation.error} />}
            {evaluation.data && (
              <>
                <span className={`tag ${evaluation.data.eligible ? 'sea' : 'danger'}`} style={{ alignSelf: 'flex-start' }}>
                  {evaluation.data.eligible ? 'All 6 rules pass' : `${plural(evaluation.data.failed.length, 'rule')} not met`}
                </span>
                <ul className="reason-list">
                  {evaluation.data.checks.map((c) => (
                    <li key={c.rule}>
                      <span className={`tick ${c.passed ? '' : 'fail'}`}><Icon name={c.passed ? 'check' : 'x'} size={12} stroke={3} /></span>
                      <span><strong>{ruleLabel[c.rule]}</strong><br /><span className="small muted">{c.message}</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        <section className="card stack">{action}</section>
      </aside>
      {asking && searchId && (
        <JoinRequestModal groupId={g.groupId} groupName={g.name} ownerName={g.owner.name} searchId={searchId} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}
