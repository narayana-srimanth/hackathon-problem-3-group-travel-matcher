import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { useSession } from './session/SessionContext';
import { AppLayout, TopBar } from './components/Layout';
import { Spinner } from './components/ui';
import { WelcomePage } from './pages/WelcomePage';
import { HomePage } from './pages/HomePage';
import { CreateGroupPage } from './pages/CreateGroupPage';
import { SearchPage } from './pages/SearchPage';
import { GroupPage } from './pages/GroupPage';
import { MyTripsPage } from './pages/MyTripsPage';
import { ProfilePage } from './pages/ProfilePage';

function RequireTraveller({ children }: { children: JSX.Element }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Restoring your session" />;
  if (status === 'signed-out') return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function NotFound() {
  return (
    <>
      <TopBar />
      <div className="empty">
        <h2>That page doesn't exist</h2>
        <Link className="btn ocean" to="/">Go home</Link>
      </div>
    </>
  );
}

export function App() {
  const { status } = useSession();
  return (
    <Routes>
      <Route path="/welcome" element={status === 'signed-in' ? <Navigate to="/" replace /> : <WelcomePage />} />
      <Route element={<RequireTraveller><AppLayout /></RequireTraveller>}>
        <Route index element={<HomePage />} />
        <Route path="create" element={<CreateGroupPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="search/:searchId" element={<SearchPage />} />
        <Route path="groups/:groupId" element={<GroupPage />} />
        <Route path="trips" element={<MyTripsPage />} />
        <Route path="travellers/:travellerId" element={<ProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
