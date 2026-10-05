import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { ProxyOptions, UserConfig } from 'vite';

export interface PortalViteOptions {
  portalRoot: string;
  port: number;
  outDir: string;
  apiTarget?: string;
}

const frontendRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const apiPaths = ['/store', '/auth', '/orders', '/admin', '/categories', '/products', '/promotions', '/suppliers', '/imports'];

export function createPortalViteConfig(options: PortalViteOptions): UserConfig {
  const proxy: Record<string, ProxyOptions> = Object.fromEntries(apiPaths.map((path) => [path, {
    target: options.apiTarget ?? 'http://localhost:3000',
    changeOrigin: true,
    bypass: (request) => {
      if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
        return '/index.html';
      }
    },
  } satisfies ProxyOptions]));

  return {
    root: resolve(frontendRoot, options.portalRoot),
    envDir: frontendRoot,
    publicDir: resolve(frontendRoot, 'public'),
    cacheDir: resolve(frontendRoot, 'node_modules/.vite', String(options.port)),
    plugins: [react()],
    server: {
      port: options.port,
      strictPort: true,
      fs: { allow: [frontendRoot] },
      proxy,
    },
    build: {
      outDir: resolve(frontendRoot, options.outDir),
      emptyOutDir: true,
    },
  };
}
