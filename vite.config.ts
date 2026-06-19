import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

type SettingsModule = typeof import('./src/lib/server/settings');

function warmupShortlinkServer(): Plugin {
  return {
    name: 'shortlink:warmup-server',
    apply: 'serve',
    async configureServer(server) {
      const startedAt = Date.now();

      try {
        const settingsModule = (await server.ssrLoadModule(
          '/src/lib/server/settings.ts',
        )) as SettingsModule;

        await settingsModule.getSettings();
        server.config.logger.info(
          `Shortlink server warmup completed in ${Date.now() - startedAt} ms`,
          { timestamp: true },
        );
      } catch (error) {
        server.config.logger.warn(
          `Shortlink server warmup skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { timestamp: true },
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [sveltekit(), warmupShortlinkServer()],
  server: {
    warmup: {
      ssrFiles: [
        './src/hooks.server.ts',
        './src/routes/+page.server.ts',
        './src/routes/+page.svelte',
      ],
      clientFiles: [
        './src/routes/+page.svelte',
        './src/lib/components/ManagedLinkList.svelte',
        './src/lib/components/Pagination.svelte',
        './src/lib/components/LinkQr.svelte',
      ],
    },
  },
  optimizeDeps: {
    include: ['qrcode'],
  },
});
