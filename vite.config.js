import { defineConfig } from 'vite';

// Relative paths so the build runs from any folder, as Yandex Games serves it.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
