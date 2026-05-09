import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  srcDir: 'core/src',
  integrations: [react()],
  output: 'static',
  outDir: 'dist',
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
  },
});
