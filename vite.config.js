import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Three.js liegt in einem eigenen Chunk, damit der App-Code klein
    // bleibt und Aktualisierungen den Cache nicht komplett verwerfen.
    // Der Rezeptkorpus ist die grösste einzelne Nutzlast. Er bekommt einen
    // eigenen Chunk, damit App-Code und Three.js unabhängig davon cachen.
    // Der Korpus-Chunk ist reine Rezeptdaten, kein Code — rund 200 kB
    // übertragen. Die Warnschwelle liegt darüber, damit sie wieder
    // anschlägt, wenn tatsächlich Code aus dem Ruder läuft.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          // Die Naehrwerttabelle ist ebenfalls reine Daten und aendert sich
          // mit dem Korpus, nicht mit dem App-Code.
          if (id.includes('src/data/books') || id.includes('src/data/naehrwerte.json')) return 'korpus';
          return undefined;
        },
      },
    },
  },
});
