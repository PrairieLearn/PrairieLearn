import { z } from 'zod';

import type { AbstractConfig, ConfigSource } from '../types.js';

const PortSchema = z.coerce
  .number('CONDUCTOR_PORT must be a number')
  .int('CONDUCTOR_PORT must be an integer')
  .min(1, 'CONDUCTOR_PORT must be at least 1')
  .max(65535, 'CONDUCTOR_PORT must be at most 65535');

export function makeConductorConfigSource({
  portConfigKey,
}: {
  portConfigKey?: string;
} = {}): ConfigSource {
  return {
    load: async () => {
      if (!process.env.CONDUCTOR_PORT || !process.env.CONDUCTOR_WORKSPACE_NAME) {
        // Probably not running in Conductor.
        return {};
      }

      const config: AbstractConfig = {};
      const conductorPort = process.env.CONDUCTOR_PORT;
      const parsedConductorPort = PortSchema.parse(Number(conductorPort));

      if (portConfigKey) {
        config[portConfigKey] = conductorPort;
      }

      const dbSuffix = process.env.CONDUCTOR_WORKSPACE_NAME.toLowerCase()
        .replaceAll(/[^a-z0-9_]/g, '_')
        .slice(0, 50);

      // Redis supports DBs 0-15 by default. With CONDUCTOR_PORT allocated in
      // increments of 10, collisions occur after ~8 workspaces. This is acceptable
      // since Redis stores transient data while Postgres databases remain fully isolated.
      const redisDb = (((parsedConductorPort - 3000) % 16) + 16) % 16;

      return {
        ...config,
        postgresqlDatabase: `prairielearn_${dbSuffix}`,
        redisUrl: `redis://localhost:6379/${redisDb}`,
      };
    },
  };
}
