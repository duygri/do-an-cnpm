import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv, type ProxyOptions, type UserConfig } from 'vite';

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

  proxy['/api'] = { target: options.apiTarget ?? process.env.API_TARGET ?? loadEnv('development', frontendRoot, '').API_TARGET ?? 'http://127.0.0.1:3000', changeOrigin: true, cookiePathRewrite: { '/auth/customer': '/api/auth/customer' }, rewrite: path => path.replace(/^\/api/, '') };

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
