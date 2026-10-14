import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'dashboard',
  publicDir: '../public', // tracker.js + demo pages ship alongside the dashboard
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
