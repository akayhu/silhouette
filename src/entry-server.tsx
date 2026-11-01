// 建置時預先產生公開頁面的 HTML（scripts/prerender.mjs 使用），讓搜尋引擎不執行 JavaScript 也讀得到內容
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider, UpgradeProvider } from './components/ui';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Faq from './pages/Faq';
import Ai from './pages/Ai';
import Local from './pages/Local';
import Features from './pages/Features';

export { PUBLIC_ROUTES, SITE_NAME } from './lib/seo';
export { faqs } from './lib/faq';

/** 要預先產生的頁面（只放不需要登入、內容固定的頁面） */
export const PRERENDER_ROUTES = ['/', '/pricing', '/faq', '/ai', '/local', '/features'];

export function render(url: string) {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <AuthProvider>
          <ToastProvider>
            <UpgradeProvider>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/faq" element={<Faq />} />
                <Route path="/ai" element={<Ai />} />
                <Route path="/local" element={<Local />} />
                <Route path="/features" element={<Features />} />
              </Routes>
            </UpgradeProvider>
          </ToastProvider>
        </AuthProvider>
      </StaticRouter>
    </StrictMode>,
  );
}
