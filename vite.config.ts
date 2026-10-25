import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // 正式網址：SITE_URL 或 .env 的 VITE_SITE_URL，前端和預先產生的 HTML 用同一個值
  define: {
    'import.meta.env.VITE_SITE_URL': JSON.stringify(process.env.SITE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL || ''),
  },
  server: {
    port: 5173,
    // tts/（Python 環境與模型）和 server/ 不屬於前端，別監看，否則會吃掉大量 CPU
    watch: { ignored: ['**/tts/**', '**/server/**', '**/scripts/**'] },
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
      '/music': 'http://localhost:8787',
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
}));
