import type { IncomingMessage, ServerResponse } from 'http';
import { exit } from 'process';

import debounce from 'debounce';
import debug from 'debug';
import type { ConfigEnv, Connect, Plugin, UserConfig, ViteDevServer } from 'vite';

export const debugServer = createDebugger('vite:node-plugin:server');

const env: ConfigEnv = { command: 'serve', mode: '' };

const getPluginConfig = async (server: ViteDevServer): Promise<VitePluginNodeConfig> => {
  const plugin = server.config.plugins.find((p) => p.name === PLUGIN_NAME) as unknown as {
    config: (...args: any[]) => UserConfig & { VitePluginNodeConfig: VitePluginNodeConfig };
  };
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  let userConfig: UserConfig | null | void = null;

  if (typeof plugin.config === 'function') {
    userConfig = await plugin.config({}, env);
  }

  if (userConfig) {
    return (userConfig as ViteConfig).VitePluginNodeConfig;
  }

  console.error('Please setup VitePluginNode in your vite.config.js first');
  exit(1);
};

const createMiddleware = async (server: ViteDevServer): Promise<Connect.HandleFunction> => {
  const config = await getPluginConfig(server);
  const logger = server.config.logger;

  async function _loadApp(config: VitePluginNodeConfig) {
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

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: Connect.NextFunction,
  ): Promise<void> {
    const app = await _loadApp(config);
    if (app) {
      app.use((err: unknown, _req: typeof req, _res: typeof res, next: Connect.NextFunction) => {
        if (err instanceof Error) {
          server.ssrFixStacktrace(err);
        }

        next(err);
      });

      app(req, res);
    }
  };
};

function createDebugger(ns: string) {
  const log = debug(ns);
  return (msg: string, ...args: any[]) => {
    log(msg, ...args);
  };
}

const PLUGIN_NAME = 'vite-plugin-node';

type InternalModuleFormat = 'amd' | 'cjs' | 'es' | 'iife' | 'system' | 'umd';
type ModuleFormat = InternalModuleFormat | 'commonjs' | 'esm' | 'module' | 'systemjs';
interface VitePluginNodeConfig {
  appPath: string;
  appName?: string;
  initAppOnBoot?: boolean;
  exportName?: string;
  outputFormat?: ModuleFormat;
  watchFileChanges?: boolean;
}

declare interface ViteConfig extends UserConfig {
  VitePluginNodeConfig: VitePluginNodeConfig;
}

export function VitePluginNode(cfg: VitePluginNodeConfig): Plugin[] {
  const config: VitePluginNodeConfig = {
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
        const plugincConfig: UserConfig & { VitePluginNodeConfig: VitePluginNodeConfig } = {
          build: {
            ssr: config.appPath,
            rollupOptions: {
              input: config.appPath,
              output: {
                format: config.outputFormat,
              },
            },
          },
          server: {
            hmr: false,
          },
          optimizeDeps: {
            noDiscovery: true,
            // Vite does not work well with optionnal dependencies,
            // mark them as ignored for now
            exclude: ['@swc/core'],
          },
          VitePluginNodeConfig: config,
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
