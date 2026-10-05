import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = process.cwd();
const apiPaths = ['/store', '/auth', '/orders', '/admin', '/categories', '/products', '/promotions', '/suppliers', '/imports'];

// Run Vite in Node so esbuild does not inherit jsdom's Uint8Array realm.
function inspectConfig(filename: string, transform = true) {
  const configFile = resolve(frontendRoot, filename);
  expect(existsSync(configFile), `${filename} must exist`).toBe(true);
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { loadConfigFromFile, createServer } from 'vite';
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, ${JSON.stringify(configFile)});
    const config = loaded.config;
    const proxies = Object.fromEntries(Object.entries(config.server.proxy).map(([path, proxy]) => [path, {
      target: proxy.target,
      changeOrigin: proxy.changeOrigin,
      htmlGet: proxy.bypass?.({ method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } }),
      jsonGet: proxy.bypass?.({ method: 'GET', headers: { accept: 'application/json' } }) ?? null,
      jsonPost: proxy.bypass?.({ method: 'POST', headers: { accept: 'application/json' } }) ?? null,
      htmlPost: proxy.bypass?.({ method: 'POST', headers: { accept: 'text/html' } }) ?? null,
      noAccept: proxy.bypass?.({ method: 'GET', headers: {} }) ?? null,
    }]));
    const server = ${transform} && await createServer({
      configFile: ${JSON.stringify(configFile)},
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, watch: null },
    });
    try {
      if (server) await server.transformRequest('/src/main.tsx');
      const entry = server && await server.moduleGraph.getModuleByUrl('/src/main.tsx');
      const shared = entry && [...entry.importedModules].find(module => /[\\/]src[\\/]main(?:\\.(?:staff|admin))?\\.tsx$/.test(module.file));
      const transformed = shared && await server.transformRequest(shared.url);
      console.log(JSON.stringify({
        root: config.root,
        port: config.server.port,
        strictPort: config.server.strictPort,
        allow: config.server.fs?.allow,
        outDir: config.build?.outDir,
        emptyOutDir: config.build?.emptyOutDir,
        envDir: config.envDir,
        publicDir: config.publicDir,
        cacheDir: config.cacheDir,
        proxies,
        sharedBootstrap: shared?.file,
        sharedTransformed: Boolean(transformed?.code),
      }));
    } finally { if (server) await server.close(); }
  `], { cwd: frontendRoot, encoding: 'utf8', timeout: 20_000 }));
}

describe('portal Vite configuration', () => {
  it.each([
    ['user', 5173, 'main.tsx'],
    ['staff', 5174, 'main.staff.tsx'],
    ['admin', 5175, 'main.admin.tsx'],
  ] as const)('serves and builds %s independently while sharing the API and source graph', (portal, port, bootstrap) => {
    const config = inspectConfig(`vite.${portal}.config.ts`);
    expect(config.root).toBe(resolve(frontendRoot, 'portals', portal));
    expect(config.port).toBe(port);
    expect(config.strictPort).toBe(true);
    expect(config.outDir).toBe(resolve(frontendRoot, 'dist', portal));
    expect(config.emptyOutDir).toBe(true);
    expect(config.allow).toContain(frontendRoot);
    expect(config.envDir).toBe(frontendRoot);
    expect(config.publicDir).toBe(resolve(frontendRoot, 'public'));
    expect(config.cacheDir).toBe(resolve(frontendRoot, 'node_modules/.vite', String(port)));
    expect(Object.keys(config.proxies).sort()).toEqual([...apiPaths].sort());
    for (const path of apiPaths) {
      expect(config.proxies[path]).toEqual({
        target: 'http://localhost:3000',
        changeOrigin: true,
        htmlGet: '/index.html',
        jsonGet: null,
        jsonPost: null,
        htmlPost: null,
        noAccept: null,
      });
    }
    expect(config.sharedBootstrap.replaceAll('\\', '/')).toBe(resolve(frontendRoot, 'src', bootstrap).replaceAll('\\', '/'));
    expect(config.sharedTransformed).toBe(true);
  });

  it('keeps bare Vite commands on the User portal', () => {
    const config = inspectConfig('vite.config.ts', false);
    expect(config.root).toBe(resolve(frontendRoot, 'portals/user'));
    expect(config.port).toBe(5173);
    expect(config.strictPort).toBe(true);
    expect(config.outDir).toBe(resolve(frontendRoot, 'dist/user'));
  });
});
