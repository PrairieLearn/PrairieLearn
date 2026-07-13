import type { AbstractConfig, ConfigSource } from '../types.js';

export function makeConductorConfigSource({
  portConfigKey,
}: {
  portConfigKey?: string;
} = {}): ConfigSource {
  return {
    load: async () => {
      const config: AbstractConfig = {};
      const port = process.env.CONDUCTOR_PORT;

      if (portConfigKey && port !== undefined) {
        config[portConfigKey] = port;
      }

      const workspaceName = process.env.CONDUCTOR_WORKSPACE_NAME;
      if (!workspaceName) return config;

      const dbSuffix = workspaceName
        .toLowerCase()
        .replaceAll(/[^a-z0-9_]/g, '_')
        .slice(0, 50);
      const redisPort = Number.parseInt(port ?? '3000');
      // Redis supports DBs 0-15 by default. With CONDUCTOR_PORT allocated in
      // increments of 10, collisions occur after ~8 workspaces. This is acceptable
      // since Redis stores transient data while Postgres databases remain fully isolated.
      const redisDb = (redisPort - 3000) % 16;

      return {
        ...config,
        postgresqlDatabase: `prairielearn_${dbSuffix}`,
        redisUrl: `redis://localhost:6379/${redisDb}`,
      };
    },
  };
}
