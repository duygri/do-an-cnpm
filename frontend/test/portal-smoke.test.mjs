import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile } from 'vite';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const portals = [
  { name: 'user', deepLink: '/products', title: 'NOVA Supply', bootstrap: 'main.tsx' },
  { name: 'admin', deepLink: '/admin/employees', title: 'Cổng quản lý', bootstrap: 'main.admin.tsx' },
];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

async function request(origin, path, options = {}) {
  return fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(10_000) });
}

test('portal roots, deep links, API proxies, and strict ports', { timeout: 60_000 }, async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'portal-smoke-'));
  const servers = [];

  const api = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      fixture: 'portal-smoke',
      method: request.method,
      path: request.url,
      body: Buffer.concat(chunks).toString(),
    }));
  });
  const apiPort = await listen(api);
  t.after(async () => {
    try {
      await Promise.all(servers.map((server) => server.close()));
    } finally {
      try { await close(api); }
      finally { await rm(cacheDir, { recursive: true, force: true }); }
    }
  });

  const running = [];
  for (const portal of portals) {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      resolve(frontendRoot, `vite.${portal.name}.config.ts`),
    );
    assert.ok(loaded, `${portal.name} config must load`);
    // Vite treats port 0 as its default port, so reserve an OS-assigned
    // port briefly and release it immediately before starting Vite.
    const reservation = createHttpServer();
    const ephemeralPort = await listen(reservation);
    await close(reservation);
    // Preserve each real config's strictPort and proxy bypass behavior.
    const config = {
      ...loaded.config,
      configFile: false,
      logLevel: 'silent',
      cacheDir: join(cacheDir, portal.name),
      server: {
        ...loaded.config.server,
        host: '127.0.0.1',
        port: ephemeralPort,
        proxy: Object.fromEntries(Object.entries(loaded.config.server.proxy).map(([path, proxy]) => [path, {
          ...proxy,
          target: `http://127.0.0.1:${apiPort}`,
        }])),
      },
    };
    const server = await createServer(config);
    servers.push(server);
    await server.listen();
    const port = server.httpServer.address().port;
    running.push({ ...portal, config, port, origin: `http://127.0.0.1:${port}` });
  }
  assert.equal(new Set(running.map(({ port }) => port)).size, portals.length);

  for (const portal of running) {
    await t.test(`${portal.name}: root and deep link serve its HTML and bootstrap`, async () => {
      for (const path of ['/', portal.deepLink]) {
        const response = await request(portal.origin, path, { headers: { Accept: 'text/html' } });
        assert.equal(response.status, 200, `${portal.name} ${path}`);
        assert.match(response.headers.get('content-type'), /text\/html/);
        const html = await response.text();
        assert.ok(html.includes(portal.title), `${portal.name} title at ${path}`);
        assert.match(html, /src="\/src\/main\.tsx"/);
      }
      const entry = await request(portal.origin, '/src/main.tsx');
      assert.equal(entry.status, 200);
      const code = await entry.text();
      const sharedImport = [...code.matchAll(/import\s+"([^"]+)"/g)]
        .map((match) => match[1])
        .find((url) => url.includes(`/src/${portal.bootstrap}`));
      assert.ok(sharedImport, `${portal.name} imports its shared bootstrap`);
      const shared = await request(portal.origin, sharedImport);
      assert.equal(shared.status, 200, `${portal.name} shared source is allowed`);
      assert.match(shared.headers.get('content-type'), /javascript/);
    });

    await t.test(`${portal.name}: API JSON requests reach the fake API`, async () => {
      for (const prefix of Object.keys(portal.config.server.proxy)) {
        const path = `${prefix}/smoke?portal=${portal.name}`;
        const response = await request(portal.origin, path, { headers: { Accept: 'application/json' } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await response.json(), { fixture: 'portal-smoke', method: 'GET', path: prefix === '/api' ? path.slice(4) : path, body: '' });
      }
      const body = JSON.stringify({ portal: portal.name });
      const response = await request(portal.origin, '/orders/smoke', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { fixture: 'portal-smoke', method: 'POST', path: '/orders/smoke', body });
    });

    await t.test(`${portal.name}: an occupied port fails instead of selecting another`, async () => {
      const blocked = await createServer({
        ...portal.config,
        cacheDir: join(cacheDir, `${portal.name}-blocked`),
        server: { ...portal.config.server, port: apiPort },
      });
      try {
        await assert.rejects(blocked.listen(), new RegExp(`Port ${apiPort} is already in use`));
      } finally {
        await blocked.close();
      }
    });
  }
});
