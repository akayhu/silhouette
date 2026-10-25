import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
