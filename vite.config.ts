import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Пока ручки /api/v1/altermoney/transactions/ нет на сервере: DEV_FIXTURES=1 в .env.local —
 * отдаём её из dev-fixtures/<currency>.json (в git не попадает) с фильтром по датам,
 * страницами и итогами, как настоящая.
 */
function transactionsFixture(): Plugin {
  return {
    name: 'transactions-fixture',
    configureServer(server) {
      server.middlewares.use('/api/v1/altermoney/transactions/', (req, res) => {
        const q = new URL(req.url ?? '', 'http://x').searchParams;
        const currency = q.get('currency') || 'lits';
        const file = `dev-fixtures/${currency}.json`;
        type T = { amount: number; date: string };
        let all: T[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
        const from = q.get('from');
        const to = q.get('to');
        all = all.filter((t) => (!from || t.date.slice(0, 10) >= from) && (!to || t.date.slice(0, 10) <= to));
        const offset = Number(q.get('offset') || 0);
        const limit = Number(q.get('limit') || 30);
        const body: Record<string, unknown> = {
          objects: all.slice(offset, offset + limit),
          more: all.length > offset + limit,
          offset,
        };
        if (offset === 0) {
          body.summary = {
            income: all.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
            outcome: -all.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0),
            count: all.length,
          };
        }
        res.setHeader('content-type', 'application/json');
        // небольшая задержка — чтобы было видно скелетон и подгрузку
        setTimeout(() => res.end(JSON.stringify(body)), 400);
      });
    },
  };
}

// В dev-режиме API, медиа и WebSocket проксируются на бэкенд, чтобы cookie
// работали как same-origin. Для работы с боевым сервером без логина можно
// задать DEV_COOKIE (строка Cookie из браузера) в .env.local — прокси
// подставит её сам, а заодно X-CSRFToken, Origin и Referer для Django CSRF.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const devCookie = env.DEV_COOKIE || '';
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(devCookie)?.[1];

  const proxy = (ws = false): ProxyOptions => ({
    target: ws ? backend.replace(/^http/, 'ws') : backend,
    ws,
    changeOrigin: true,
    secure: true,
    configure: (p) => {
      if (!devCookie) return;
      const inject = (req: { setHeader: (k: string, v: string) => void }) => {
        req.setHeader('cookie', devCookie);
        req.setHeader('origin', backend);
        req.setHeader('referer', backend + '/');
        // токен из DEV_COOKIE: своя кука csrftoken у браузера на dev-хосте с ней не совпадёт
        if (csrf) req.setHeader('x-csrftoken', csrf);
      };
      p.on('proxyReq', (req) => inject(req));
      p.on('proxyReqWs', (req) => inject(req));
      // сессией управляет DEV_COOKIE — куки бэкенда в браузер не пропускаем
      p.on('proxyRes', (res) => {
        delete res.headers['set-cookie'];
      });
    },
  });

  return {
    // Статику отдаёт Django с /assets/finance/
    base: command === 'build' ? env.VITE_ASSETS_BASE || '/assets/finance/' : '/',
    plugins: [react(), ...(command === 'serve' && env.DEV_FIXTURES ? [transactionsFixture()] : [])],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        // точка входа без index.html: её подключает шаблон Django
        input: 'src/main.tsx',
        output: {
          // один файл скрипта и один стилей со статическими именами — прописаны в шаблоне
          entryFileNames: 'finance.js',
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            info.names?.some((n) => n.endsWith('.css')) ? 'finance.css' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 5175,
      proxy: {
        '/api': proxy(),
        '/media': proxy(),
        '/ws': proxy(true),
      },
    },
  };
});
