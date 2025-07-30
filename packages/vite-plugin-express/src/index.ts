import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { exit } from 'process';

import debounce from 'debounce';
import picomatch from 'picomatch';
import {
  type ConfigEnv,
  type Connect,
  type ModuleNode,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
  isRunnableDevEnvironment,
} from 'vite';

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

function recursivelyGetImporters(
  moduleNode: ModuleNode,
  visited = new Set<ModuleNode>(),
): Set<ModuleNode> {
  if (!visited.has(moduleNode)) {
    visited.add(moduleNode);
    for (const importer of moduleNode.importers) {
      recursivelyGetImporters(importer, visited);
    }
  }

  return visited;
}

const createMiddleware = async (server: ViteDevServer): Promise<Connect.HandleFunction> => {
  const config = await getPluginConfig(server);
  const logger = server.config.logger;

  // Store a cached copy of the most recent app module that we can use while
  // doing a full restart.
  let _mostRecentAppModule: any;
  async function _loadApp(config: VitePluginExpressConfig) {
    if (!isRunnableDevEnvironment(server.environments.ssr)) {
      throw new Error('VitePluginExpress can only be used with a runnable dev environment');
    }

    let appModule: any;
    try {
      // We use `runner.import(...)` instead of `ssrLoadModule(...)` because a)
      // the latter will be deprecated soon and b) `runner.import(...)` will
      // automatically produce correct stack traces that account for code
      // transformations done by Vite.
      appModule = await server.environments.ssr.runner.import(config.appPath);
    } catch (err: any) {
      if (err?.message?.includes('Transform failed with')) {
        // This is a syntax error, and Vite has already logged it. It's recoverable
        // if the user fixes the syntax error.
        return null;
      }

      // We don't know what happened, so we'll just rethrow the error and allow
      // the process to die.
      throw err;
    }

    if (appModule) {
      _mostRecentAppModule = appModule;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const app = await appModule[config.exportName!];
    if (!app) {
      logger.error(`Failed to find a named ${config.exportName} from ${config.appPath}`, {
        timestamp: true,
      });
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

  // We'll always normalize the paths to absolute globs.
  const fullRestartPaths = (config.fullRestartPaths ?? []).map((p) =>
    path.resolve(server.config.root, p),
  );
  const fullRestartPathMatchers = fullRestartPaths.map((p) => picomatch(p));
  server.watcher.add(fullRestartPaths);

  const debouncedLoadApp = debounce(async () => await _loadApp(config), 500, { immediate: true });
  const debouncedRestart = debounce(() => server.restart(), 500, { immediate: true });

  function needsFullRestart(file: string): boolean {
    // This is the easy case: we had a direct change to a file that is supposed
    // to trigger a full reload.
    if (fullRestartPathMatchers.some((matcher) => matcher(file))) return true;

    const modules = Array.from(server.moduleGraph.getModulesByFile(file) ?? []);
    if (modules.length === 0) {
      // This file isn't part of the module graph. No need to do anything.
      return false;
    }

    if (modules.length !== 1) {
      throw new Error(`Unexpected module graph state: ${modules.length} modules found for ${file}`);
    }

    // If the file is directly or indirectly imported by a module that matches
    // the full restart paths, then we need to do a full restart.
    const importers = recursivelyGetImporters(modules[0]);
    const importerPaths = Array.from(importers)
      .map((m) => m.file)
      .filter((p): p is string => p !== null);
    return importerPaths.some((p) => fullRestartPathMatchers.some((matcher) => matcher(p)));
  }

  // We'll manually react to changes in two cases:
  //
  // 1. If the file matches any of the full paths, we'll immediately restart
  //    the server. These paths may not be part of the Vite module graph (e.g.
  //    SQL files), or they may be part of the module graph but may contain state
  //    that can't be hot-reloaded (e.g. database connection pools or worker pools).
  //
  // 2. If we're configured to watch file changes, we'll reload the app (root) module.
  //    This gives us a head start over waiting for the next request to trigger a reload.
  server.watcher.on('change', (file) => {
    if (needsFullRestart(path.resolve(server.config.root, file))) {
      logger.info(`Change to ${file} requires a full restart`, { timestamp: true });
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
    if (!app) return;

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
  /**
   * A set of globs for which a direct modification or modification of a dependency
   * should trigger a full restart of the server.
   */
  fullRestartPaths?: string[];
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
    fullRestartPaths: cfg.fullRestartPaths ?? [],
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
