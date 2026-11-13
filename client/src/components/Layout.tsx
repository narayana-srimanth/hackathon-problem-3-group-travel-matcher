import { Link, NavLink, Outlet } from 'react-router-dom';
import { useMyGroups } from '../api/hooks';
import { useMe, useSession } from '../session/SessionContext';
import { Avatar, Icon, LogoMark } from './ui';

export function Logo() {
  return <Link to="/" className="logo"><LogoMark />Tagalong</Link>;
}

/** Top bar for signed-in screens. The badge polls GET /me/groups every 15 s. */
export function TopBar({ onDark = false }: { onDark?: boolean }) {
  const me = useMe();
  const { signOut } = useSession();
  const { data } = useMyGroups();
  const pending = data?.totalPendingRequests ?? 0;
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  return (
    <header className={`topbar ${onDark ? 'on-dark' : ''}`}>
      <Logo />
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end className={cls}>Home</NavLink>
        <NavLink to="/search" className={cls}>Find groups</NavLink>
        <NavLink to="/create" className={cls}>Create trip</NavLink>
        <NavLink to="/trips" className={cls}>
          My trips{pending > 0 && <span className="badge" aria-label={`${pending} pending join requests`}>{pending}</span>}
        </NavLink>
      </nav>
      <div className="whoami">
        <Link to={`/travellers/${me.travellerId}`} className="row" style={{ textDecoration: 'none', color: 'inherit', ['--row-gap' as string]: '10px' }}>
          <Avatar id={me.travellerId} name={me.name} />
          <span>{me.name.split(' ')[0]}</span>
        </Link>
        <button className="icon-btn" aria-label="Switch traveller" title="Switch traveller" onClick={signOut}
          style={onDark ? { background: 'transparent', color: 'inherit', borderColor: 'rgba(247,243,233,0.35)' } : undefined}>
          <Icon name="logout" />
        </button>
      </div>
    </header>
  );
}

export function AppLayout() {
  return (
    <div className="page">
      <Outlet />
    </div>
  );
}
