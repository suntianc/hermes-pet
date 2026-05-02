import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../assets',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    copyPublicDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@hermes/pet-action-dsl': path.resolve(__dirname, '../../packages/pet-action-dsl/src'),
      '@hermes/hermes-adapter': path.resolve(__dirname, '../../packages/hermes-adapter/src'),
      '@hermes/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
  },
});
