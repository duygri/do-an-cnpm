import { createPortalViteConfig } from './vite.shared';

const portalConfig = createPortalViteConfig({
  portalRoot: 'portals/admin',
  port: 5175,
  outDir: 'dist/admin',
});

export default {
  ...portalConfig,
  build: {
    ...portalConfig.build,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const normalizedId = id.replaceAll('\\', '/');
          const nodeModulesIndex = normalizedId.lastIndexOf('/node_modules/');
          if (nodeModulesIndex < 0) return undefined;

          const packagePath = normalizedId.slice(nodeModulesIndex + '/node_modules/'.length);
          const segments = packagePath.split('/');
          const packageName = segments[0].startsWith('@')
            ? `${segments[0]}/${segments[1] ?? ''}`
            : segments[0];

          if (['react', 'react-dom', 'react-is', 'scheduler'].includes(packageName)) return 'vendor-react';
          if (packageName === 'react-admin' || packageName.startsWith('ra-')) return 'vendor-react-admin';
          if (packageName.startsWith('@mui/')) return 'vendor-mui';
          if (packageName.startsWith('@emotion/')) return 'vendor-emotion';
          if (['history', 'react-router', 'react-router-dom'].includes(packageName)) return 'vendor-router';
          return undefined;
        },
      },
    },
  },
};
