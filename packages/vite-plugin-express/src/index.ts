import type { IncomingMessage, ServerResponse } from 'http';
import { exit } from 'process';

import debounce from 'debounce';
import picomatch from 'picomatch';
import type { ConfigEnv, Connect, Plugin, UserConfig, ViteDevServer } from 'vite';

const env: ConfigEnv = { command: 'serve', mode: '' };

const getPluginConfig = async (server: ViteDevServer): Promise<VitePluginExpressConfig> => {
  // Ugly type hack to get the plugin config
  const plugin = server.config.plugins.find((p) => p.name === PLUGIN_NAME) as unknown as {
    config: (...args: any[]) => UserConfig & { VitePluginExpressConfig: VitePluginExpressConfig };
  };
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  let userConfig: UserConfig | null | void = null;

  if (typeof plugin.config === 'function') {
    userConfig = plugin.config({}, env);
  }

  if (userConfig) {
    return (userConfig as ViteConfig).VitePluginExpressConfig;
  }

  console.error('Please setup VitePluginExpress in your vite.config.ts first');
  exit(1);
};

const createMiddleware = async (server: ViteDevServer): Promise<Connect.HandleFunction> => {
  const config = await getPluginConfig(server);
  const logger = server.config.logger;

  // Store a cached copy of the most recent app module that we can use while
  // doing a full restart.
  let _mostRecentAppModule: any;
  async function _loadApp(config: VitePluginExpressConfig) {
    const appModule = await server.ssrLoadModule(config.appPath);
    if (appModule) {
      _mostRecentAppModule = appModule;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const app = await appModule[config.exportName!];
    if (!app) {
      logger.error(`Failed to find a named ${config.exportName} from ${config.appPath}`);
      process.exit(1);
    }
    return app;
  }

  if (config.initAppOnBoot) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    server.httpServer!.once('listening', async () => {
      await _loadApp(config);
    });
  }

  const extraWatchPaths = config.extraWatchPaths ?? [];
  const extraWatchPathMatchers = extraWatchPaths.map((path) => picomatch(path));
  server.watcher.add(extraWatchPaths);

  const debouncedLoadApp = debounce(async () => await _loadApp(config), 500, { immediate: true });
  const debouncedRestart = debounce(() => server.restart(), 500, { immediate: true });

  // We'll manually react to changes in two cases:
  //
  // 1. If the file matches any of the extra watch paths, we'll immediately restart
  //    the server. These files aren't part of Vite's module graph, so we can't rely
  //    on any automatic reloading. This also means we need to restart the entire
  //    server, as we can't just reload the module.
  //
  // 2. If we're configured to watch file changes, we'll reload the app (root) module.
  //    This gives us a head start over waiting for the next request to trigger a reload.
  server.watcher.on('change', (file) => {
    if (extraWatchPathMatchers.some((matcher) => matcher(file))) {
      debouncedRestart();
    } else if (config.watchFileChanges) {
      debouncedLoadApp();
    }
  });

  // Hook into the environment's `close` method so we can do cleanup when the
  // server is closed. Crucially, this allows us to hook into the `k+Enter` key
  // combo in the Vite dev server to gracefully shut down the server so that it
  // can be restarted cleanly.
  //
  // This uses a hardcoded `close` export from the app module.
  const originalClose = server.environments.ssr.close.bind(server.environments.ssr);
  server.environments.ssr.close = async () => {
    await originalClose();

    if (typeof _mostRecentAppModule?.close === 'function') {
      await _mostRecentAppModule.close();
    }
  };

  return async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
    const app = await _loadApp(config);
    if (!app) {
      return;
    }

    app.use((err: unknown, _req: typeof req, _res: typeof res, next: Connect.NextFunction) => {
      if (err instanceof Error) {
        server.ssrFixStacktrace(err);
      }

      next(err);
    });

    app(req, res);
  };
};

const PLUGIN_NAME = 'vite-plugin-express';

type InternalModuleFormat = 'amd' | 'cjs' | 'es' | 'iife' | 'system' | 'umd';
type ModuleFormat = InternalModuleFormat | 'commonjs' | 'esm' | 'module' | 'systemjs';
interface VitePluginExpressConfig {
  appPath: string;
  appName?: string;
  initAppOnBoot?: boolean;
  exportName?: string;
  outputFormat?: ModuleFormat;
  watchFileChanges?: boolean;
  extraWatchPaths?: string[];
}

declare interface ViteConfig extends UserConfig {
  VitePluginExpressConfig: VitePluginExpressConfig;
}

export function VitePluginExpress(cfg: VitePluginExpressConfig): Plugin[] {
  const config: VitePluginExpressConfig = {
    appPath: cfg.appPath,
    appName: cfg.appName ?? 'app',
    exportName: cfg.exportName ?? 'viteExpressApp',
    initAppOnBoot: cfg.initAppOnBoot ?? true,
    outputFormat: cfg.outputFormat ?? 'cjs',
    watchFileChanges: cfg.watchFileChanges ?? true,
    extraWatchPaths: cfg.extraWatchPaths ?? [],
  };

  const plugins: Plugin[] = [
    {
      name: PLUGIN_NAME,
      config: () => {
        const pluginConfig: UserConfig & { VitePluginExpressConfig: VitePluginExpressConfig } = {
          build: {
            ssr: config.appPath,
            rollupOptions: {
              input: config.appPath,
              output: {
                format: config.outputFormat,
              },
            },
          },
          optimizeDeps: {
            noDiscovery: true,
          },
          server: {
            hmr: false,
          },
          VitePluginExpressConfig: config,
        };

        return pluginConfig;
      },
      configureServer: async (server) => {
        server.middlewares.use(await createMiddleware(server));
      },
    },
  ];

  return plugins;
}
