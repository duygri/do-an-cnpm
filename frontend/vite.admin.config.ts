import { createPortalViteConfig } from './vite.shared';

export default createPortalViteConfig({
  portalRoot: 'portals/admin',
  port: 5175,
  outDir: 'dist/admin',
});
