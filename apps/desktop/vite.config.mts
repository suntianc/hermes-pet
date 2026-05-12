import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: '../dist/renderer',
    emptyOutDir: true,
    copyPublicDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@framework': path.resolve(__dirname, 'src/vendor/cubism/Framework/src'),
      '@pet-action-dsl': path.resolve(__dirname, '../../packages/pet-action-dsl/src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
