
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {}

// Plugin seguro para copiar SW apenas se o ambiente permitir
// Removido conforme solicitação "limpe o sync to commit"

export default defineConfig({
  // ESSENCIAL PARA CAPACITOR/ANDROID: Caminho relativo para os assets
  base: './',
  plugins: [
    react()
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA || commitHash),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true
  }
});
