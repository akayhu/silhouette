import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './lib/auth';
import { ToastProvider, UpgradeProvider } from './components/ui';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Pricing from './pages/Pricing';
import Checkout from './pages/Checkout';
import Dashboard from './pages/Dashboard';
import Account from './pages/Account';
import { RequireAdmin } from './pages/admin/AdminLayout';

const Editor = lazy(() => import('./editor/Editor'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <UpgradeProvider>
            <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-mute">載入中…</div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/login" element={<Auth mode="login" />} />
                <Route path="/register" element={<Auth mode="register" />} />
                <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                <Route path="/editor/:id" element={<RequireAuth><Editor /></RequireAuth>} />
                <Route path="/admin" element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
                <Route path="/admin/members" element={<RequireAdmin><AdminMembers /></RequireAdmin>} />
                <Route path="*" element={<Landing />} />
              </Routes>
            </Suspense>
          </UpgradeProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
