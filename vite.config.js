import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  // If you deploy to a subpath (e.g. site.com/my-app/), set base: '/my-app/'
  base: '/',
});
