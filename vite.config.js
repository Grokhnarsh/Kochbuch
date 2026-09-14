import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Three.js liegt in einem eigenen Chunk, damit der App-Code klein
    // bleibt und Aktualisierungen den Cache nicht komplett verwerfen.
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
