import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端根目录在 web/，开发期 /api 代理到 Fastify 后端
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
