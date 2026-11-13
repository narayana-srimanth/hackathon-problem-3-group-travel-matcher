import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend runs on :4000. The client always calls relative paths
// (/api/v1/..., /static/...), and Vite forwards them during development.
const BACKEND = process.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/static': { target: BACKEND, changeOrigin: true },
    },
  },
});
