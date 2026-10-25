// 建置時預先產生公開頁面的 HTML（scripts/prerender.mjs 使用），讓搜尋引擎不執行 JavaScript 也讀得到內容
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider, UpgradeProvider } from './components/ui';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';

export { PUBLIC_ROUTES } from './lib/seo';

/** 要預先產生的頁面（只放不需要登入、內容固定的頁面） */
export const PRERENDER_ROUTES = ['/', '/pricing'];

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
              </Routes>
            </UpgradeProvider>
          </ToastProvider>
        </AuthProvider>
      </StaticRouter>
    </StrictMode>,
  );
}
