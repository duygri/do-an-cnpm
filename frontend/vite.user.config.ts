import { createPortalViteConfig } from './vite.shared';

export default createPortalViteConfig({
  portalRoot: 'portals/user',
  port: 5173,
  outDir: 'dist/user',
});
