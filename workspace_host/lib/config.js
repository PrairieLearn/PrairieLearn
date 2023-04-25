// @ts-check
const { z } = require('zod');
const {
  ConfigLoader,
  makeFileConfigSource,
  makeImdsConfigSource,
  makeSecretsManagerConfigSource,
} = require('@prairielearn/config');

const ConfigSchema = z.object({
  postgresqlUser: z.string().default('postgres'),
  postgresqlPassword: z.string().nullable().default(null),
  postgresqlDatabase: z.string().default('postgres'),
  postgresqlHost: z.string().default('localhost'),
  postgresqlPoolSize: z.number().default(100),
  postgresqlIdleTimeoutMillis: z.number().default(30_000),
  redisUrl: z.string().nullable().default('redis://localhost:6379/'),
  runningInEc2: z.boolean().default(false),
  cacheImageRegistry: z.string().nullable().default(null),
  instanceId: z.string().default('server'),
  hostname: z.string().default('localhost'),
  sentryDsn: z.string().nullable().default(null),
  sentryEnvironment: z.string().default('development'),
  workspaceDevHostInstanceId: z.string().default('devWSHost1'),
  workspaceDevHostHostname: z.string().default('localhost'),
  workspaceDevContainerHostname: z.string().default('host.docker.internal'),
  workspaceHostPort: z.number().default(8081),
  workspaceHostPruneContainersSec: z.number().default(60),
  workspaceHostMinPortRange: z.number().default(1024),
  /**
   * Docker on Windows doesn't support ports above 45000.
   */
  workspaceHostMaxPortRange: z.number().default(45000),
  /**
   * If set to a positive integer, this will limit the number of allocation attempts.
   */
  workspaceHostMaxPortAllocationAttempts: z.number().default(0),
  workspacePullImagesFromDockerHub: z.boolean().default(true),
  workspacePercentMessageRateLimitSec: z.number().default(1),
  workspaceSupportNoInternet: z.boolean().default(false),
  workspaceHostHomeDirRoot: z.string().default('/jobs/workspaces'),
  workspaceJobsDirectoryOwnerUid: z.number().default(0),
  workspaceJobsDirectoryOwnerGid: z.number().default(0),
  workspaceDockerMemory: z.number().default(1 << 30), // 1GiB
  workspaceDockerMemorySwap: z.number().default(1 << 30), // Same as memory, so no access to swap.
  workspaceDockerKernelMemory: z.number().default(1 << 29), // 512 MiB
  workspaceDockerDiskQuota: z.number().default(1 << 30), // 1 GiB
  workspaceDockerCpuPeriod: z.number().default(100000), // microseconds
  /**
   * Allocates a portion of the `CpuPeriod` for this container.
   */
  workspaceDockerCpuQuota: z.number().default(90000),
  workspaceDockerPidsLimit: z.number().default(1024),
  /** Controls the maximum number of allowable graded files. */
  workspaceMaxGradedFilesCount: z.number().default(100),
  /** Controls the maximum size of all graded files in bytes. */
  workspaceMaxGradedFilesSize: z.number().default(100 * 1024 * 1024),
  workspaceLogsS3Bucket: z.string().nullable().default(null),
});

const loader = new ConfigLoader(ConfigSchema);

module.exports.config = loader.config;

module.exports.loadConfig = async function (path) {
  await loader.loadAndValidate([
    makeFileConfigSource(path),
    makeImdsConfigSource(),
    makeSecretsManagerConfigSource('ConfSecret'),
  ]);
};

module.exports.ConfigSchema = ConfigSchema;
