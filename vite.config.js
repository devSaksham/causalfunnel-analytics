import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'dashboard',
  publicDir: '../public', // tracker.js + demo pages ship alongside the dashboard
  build: { outDir: '../dist', emptyOutDir: true },
  // API_PROXY=https://<deployed-site> npm run dev:dashboard develops the UI against live data
  server: { proxy: { '/api': { target: process.env.API_PROXY || 'http://localhost:3000', changeOrigin: true } } },
});
