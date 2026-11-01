import { lazy, Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './lib/auth';
import { ToastProvider, UpgradeProvider } from './components/ui';
// 行銷／SEO 頁面維持一般匯入：首頁等六頁會預先產生靜態 HTML，這些元件本來就一定要載入，
// eager 匯入讓它們跟主要的路由程式碼放在同一個 chunk，不必多一次網路請求。
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Faq from './pages/Faq';
import Ai from './pages/Ai';
import Local from './pages/Local';
import Features from './pages/Features';
import NotFound from './pages/NotFound';
import { applySeo } from './lib/seo';
import { RequireAdmin } from './pages/admin/AdminLayout';

// 登入後才會用到的頁面（含登入／註冊本身）改成 lazy：訪客看首頁等行銷頁時
// 不會多下載這些程式碼，縮小第一次載入的主要 bundle。
const Auth = lazy(() => import('./pages/Auth'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tutorial = lazy(() => import('./pages/Tutorial'));
const FeatureGuide = lazy(() => import('./pages/FeatureGuide'));
const Account = lazy(() => import('./pages/Account'));
const Editor = lazy(() => import('./editor/Editor'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'));
const AdminPromoCodes = lazy(() => import('./pages/admin/AdminPromoCodes'));

/** 換頁時更新標題、描述、canonical；私人頁面和 404 加上 noindex */
function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => applySeo(pathname), [pathname]);
  return null;
}

function AppContent() {
  return (
    <>
      <RouteSeo />
      <AuthProvider>
        <ToastProvider>
          <UpgradeProvider>
            <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-mute">載入中…</div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/faq" element={<Faq />} />
                <Route path="/ai" element={<Ai />} />
                <Route path="/local" element={<Local />} />
                <Route path="/features" element={<Features />} />
                <Route path="/login" element={<Auth mode="login" />} />
                <Route path="/register" element={<Auth mode="register" />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/tutorial" element={<RequireAuth><Tutorial /></RequireAuth>} />
                <Route path="/feature-guide" element={<RequireAuth><FeatureGuide /></RequireAuth>} />
                <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                <Route path="/editor/:id" element={<RequireAuth><Editor /></RequireAuth>} />
                <Route path="/admin" element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
                <Route path="/admin/members" element={<RequireAdmin><AdminMembers /></RequireAdmin>} />
                <Route path="/admin/promo-codes" element={<RequireAdmin><AdminPromoCodes /></RequireAdmin>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </UpgradeProvider>
        </ToastProvider>
      </AuthProvider>
    </>
  );
}

// A data router lets the editor guard links, programmatic navigation and browser Back.
export default function App() {
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <AppContent /> }]));
  return <RouterProvider router={router} />;
}
