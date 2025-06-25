import type { IncomingMessage, ServerResponse } from 'http';
import { exit } from 'process';

import debounce from 'debounce';
import debug from 'debug';
import type { ConfigEnv, Connect, Plugin, UserConfig, ViteDevServer } from 'vite';

export const debugServer = createDebugger('vite:express-plugin:server');

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

  async function _loadApp(config: VitePluginExpressConfig) {
    const appModule = await server.ssrLoadModule(config.appPath);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let app = appModule[config.exportName!];
    if (!app) {
      logger.error(`Failed to find a named ${config.exportName} from ${config.appPath}`);
      process.exit(1);
    } else {
      // some app may be created with a function returning a promise
      app = await app;
      return app;
    }
  }

  if (config.initAppOnBoot) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    server.httpServer!.once('listening', async () => {
      await _loadApp(config);
    });
  }

  if (config.watchFileChanges) {
    const debounceDelayMs = 500;

    server.watcher.on(
      'change',
      debounce(async () => {
        await _loadApp(config);
      }, debounceDelayMs),
    );
  }

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

function createDebugger(ns: string) {
  const log = debug(ns);
  return (msg: string, ...args: any[]) => {
    log(msg, ...args);
  };
}

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
}

declare interface ViteConfig extends UserConfig {
  VitePluginExpressConfig: VitePluginExpressConfig;
}

export function VitePluginExpress(cfg: VitePluginExpressConfig): Plugin[] {
  const config: VitePluginExpressConfig = {
    appPath: cfg.appPath,
    appName: cfg.appName ?? 'app',
    exportName: cfg.exportName ?? 'viteNodeApp',
    initAppOnBoot: cfg.initAppOnBoot ?? false,
    outputFormat: cfg.outputFormat ?? 'cjs',
    watchFileChanges: cfg.watchFileChanges ?? false,
  };

  const plugins: Plugin[] = [
    {
      name: PLUGIN_NAME,
      config: () => {
        const plugincConfig: UserConfig & { VitePluginExpressConfig: VitePluginExpressConfig } = {
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

        return plugincConfig;
      },
      configureServer: async (server) => {
        server.middlewares.use(await createMiddleware(server));
      },
    },
  ];

  return plugins;
}
