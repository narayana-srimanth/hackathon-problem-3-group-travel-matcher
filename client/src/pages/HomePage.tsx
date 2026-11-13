import { Link } from 'react-router-dom';
import { useMyGroups, useMyJoinRequests } from '../api/hooks';
import { useMe } from '../session/SessionContext';
import { TopBar } from '../components/Layout';
import { Icon } from '../components/ui';
import { fmtRange, plural } from '../lib/format';

/** Step 2: choose a role. People can always switch, so this is also the home screen. */
export function HomePage() {
  const me = useMe();
  const groups = useMyGroups();
  const requests = useMyJoinRequests();

  const pendingMine = requests.data?.items.filter((r) => r.request.status === 'PENDING') ?? [];
  const upcoming = [...(groups.data?.owned ?? []), ...(groups.data?.memberOf ?? [])]
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  const inbox = groups.data?.totalPendingRequests ?? 0;

  return (
    <>
      <TopBar />
      <div className="stack" style={{ padding: '0 8px', ['--gap' as string]: '10px' }}>
        <h1>Hi {me.name.split(' ')[0]}, how do you want to travel?</h1>
        <p className="muted" style={{ fontSize: 18 }}>You can switch any time. Lots of people do both.</p>
      </div>

      <div className="grid" style={{ ['--min' as string]: '320px', ['--grid-gap' as string]: '20px' }}>
        <Link to="/create" className="choice ocean">
          <div className="row between">
            <span className="icon" style={{ background: 'var(--sun)', color: 'var(--ink)' }}><Icon name="flag" size={30} /></span>
            <span className="tag" style={{ background: 'rgba(247,243,233,0.14)', color: 'var(--cream)' }}>Creator</span>
          </div>
          <div className="stack" style={{ ['--gap' as string]: '10px' }}>
            <h2 style={{ fontSize: 36 }}>Create a trip</h2>
            <p style={{ color: 'var(--seafoam-soft)', fontSize: 17 }}>Post your plan and choose who joins. You approve every request.</p>
          </div>
          <span className="btn primary" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>Start a group post <Icon name="arrow" /></span>
        </Link>

        <Link to="/search" className="choice sea">
          <div className="row between">
            <span className="icon" style={{ background: 'var(--cream)', color: 'var(--ocean)' }}><Icon name="search" size={30} /></span>
            <span className="tag" style={{ background: 'rgba(31,49,56,0.12)', color: 'var(--ink)' }}>Seeker</span>
          </div>
          <div className="stack" style={{ ['--gap' as string]: '10px' }}>
            <h2 style={{ fontSize: 36 }}>Find a group</h2>
            <p style={{ fontSize: 17 }}>See open trips that fit your dates, budget and interests, then ask to join the ones you like.</p>
          </div>
          <span className="btn ocean" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>Search groups <Icon name="arrow" /></span>
        </Link>
      </div>

      {(inbox > 0 || pendingMine.length > 0 || upcoming) && (
        <div className="stack" style={{ ['--gap' as string]: '10px' }}>
          {inbox > 0 && (
            <div className="card tight row between sun">
              <span><strong>{plural(inbox, 'person')}</strong> {inbox === 1 ? 'wants' : 'want'} to join your trips.</span>
              <Link to="/trips" className="small strong">Review requests</Link>
            </div>
          )}
          {pendingMine.length > 0 && (
            <div className="card tight row between">
              <span>You have {plural(pendingMine.length, 'pending request')} — latest to <strong>{pendingMine[0].group.name}</strong>.</span>
              <Link to="/trips" className="small strong">See my requests</Link>
            </div>
          )}
          {upcoming && (
            <div className="card tight row between">
              <span>Next trip: <strong>{upcoming.name}</strong> · {upcoming.city} · {fmtRange(upcoming.checkIn, upcoming.checkOut)}</span>
              <Link to={`/groups/${upcoming.groupId}`} className="small strong">Open group page</Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
