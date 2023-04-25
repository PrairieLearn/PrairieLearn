// @ts-check
const { z } = require('zod');
const {
  ConfigLoader,
  makeFileConfigSource,
  makeImdsConfigSource,
  makeSecretsManagerConfigSource,
} = require('@prairielearn/config');

const ConfigSchema = z.object({
  runningInEc2: null,
  instanceId: null,
  hostname: null,
  workspaceDevHostInstanceId: null,
  workspaceDevHostHostname: null,
  sentryDsn: null,
  sentryEnvironment: null,
  workspaceHostPort: null,
  postgresqlUser: null,
  postgresqlDatabase: null,
  postgresqlHost: null,
  postgresqlPassword: null,
  postgresqlPoolSize: null,
  postgresqlIdleTimeoutMillis: null,
  workspaceHostPruneContainersSec: null,
  workspaceHostMaxPortAllocationAttempts: null,
  workspaceHostMinPortRange: null,
  workspaceHostMaxPortRange: null,
  cacheImageRegistry: null,
  workspacePullImagesFromDockerHub: null,
  workspacePercentMessageRateLimitSec: null,
  workspaceHostHomeDirRoot: null,
  workspaceSupportNoInternet: null,
  workspaceJobsDirectoryOwnerUid: null,
  workspaceJobsDirectoryOwnerGid: null,
  workspaceDockerMemory: null,
  workspaceDockerMemorySwap: null,
  workspaceDockerKernelMemory: null,
  workspaceDockerDiskQuota: null,
  workspaceDockerCpuPeriod: null,
  workspaceDockerCpuQuota: null,
  workspaceDockerPidsLimit: null,
  workspaceHostHomeDirRoot: null,
  workspaceMaxGradedFilesCount: null,
  workspaceMaxGradedFilesSize: null,
  workspaceLogsS3Bucket: null,
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
