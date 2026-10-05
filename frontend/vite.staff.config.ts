import { createPortalViteConfig } from './vite.shared';

export default createPortalViteConfig({
  portalRoot: 'portals/staff',
  port: 5174,
  outDir: 'dist/staff',
});
