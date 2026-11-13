// Vite sert uniquement au développement (npm run dev) et à Vitest.
// La production n'a PAS besoin de Vite : voir tools/build.mjs (copie + liste de pré-cache).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
