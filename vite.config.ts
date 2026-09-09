import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8080,
    host: true,
    allowedHosts: true
  },
  build: {
    assetsInlineLimit: 0
  }
});
