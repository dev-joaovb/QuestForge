import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    isolate: false,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['backend/tests/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
