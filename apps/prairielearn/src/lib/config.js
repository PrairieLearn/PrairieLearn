// @ts-check
const { z } = require('zod');
const {
  ConfigLoader,
  makeFileConfigSource,
  makeImdsConfigSource,
  makeSecretsManagerConfigSource,
} = require('@prairielearn/config');

const { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } = require('./paths');

const ConfigSchema = z.object({
  startServer: z.boolean().default(true),
  postgresqlUser: z.string().default('postgres'),
  postgresqlPassword: z.string().nullable().default(null),
  postgresqlDatabase: z.string().default('postgres'),
  postgresqlHost: z.string().default('localhost'),
  postgresqlPoolSize: z.number().default(100),
  postgresqlIdleTimeoutMillis: z.number().default(30_000),
  postgresqlSsl: z
    .union([
      z.boolean(),
      // A subset of the options that can be provided to the `TLSSocket` constructor.
      // https://node-postgres.com/features/ssl
      z.object({
        rejectUnauthorized: z.boolean().default(true),
        ca: z.string().nullable().default(null),
        key: z.string().nullable().default(null),
        cert: z.string().nullable().default(null),
      }),
    ])
    .default(false),
  namedLocksRenewIntervalMs: z.number().default(60_000),
  courseDirs: z
    .array(z.string())
    .default([
      '/course',
      '/course2',
      '/course3',
      '/course4',
      '/course5',
      '/course6',
      '/course7',
      '/course8',
      '/course9',
      EXAMPLE_COURSE_PATH,
      TEST_COURSE_PATH,
    ]),
  courseRepoDefaultBranch: z.string().default('master'),
  urlPrefix: z.string().default('/pl'),
  homeUrl: z.string().default('/'),
  assetsPrefix: z
    .string()
    .default('/assets')
    .refine((s) => s.startsWith('/') && !s.endsWith('/'), {
      message: 'must be an absolute path and not end with a slash',
    }),
  coursesRoot: z.string().default('/data1/courses'),
  /** Set to null or '' to disable Redis. */
  redisUrl: z.string().nullable().default('redis://localhost:6379/'),
  logFilename: z.string().default('server.log'),
  logErrorFilename: z.string().nullable().default(null),
  /** Sets the default user UID in development. */
  authUid: z.string().nullable().default('dev@illinois.edu'),
  /** Sets the default user name in development. */
  authName: z.string().nullable().default('Dev User'),
  /** Sets the default user UIN in development. */
  authUin: z.string().nullable().default('000000000'),
  authnCookieMaxAgeMilliseconds: z.number().default(30 * 24 * 60 * 60 * 1000),
  sessionStoreExpireSeconds: z.number().default(86400),
  sessionCookieSameSite: z.string().default(process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
  serverType: z.enum(['http', 'https']).default('http'),
  serverPort: z.string().default('3000'),
  serverTimeout: z.number().default(10 * 60 * 1000), // 10 minutes
  /**
   * How many milliseconds to wait before destroying a socket that is being
   * kept alive. This should always be greater than the timeout at the load
   * balancer. The default here works for AWS ALBs, where the default timeout is
   * 60 seconds. This should be adjusted appropriately for other load balancers.
   */
  serverKeepAliveTimeout: z.number().default(65 * 1000),
  /**
   * Should be set to the hostname that the server is running on, e.g.
   * `https://us.prairielearn.com`.
   */
  serverCanonicalHost: z.string().nullable().default(null),
  runMigrations: z.boolean().default(true),
  runBatchedMigrations: z.boolean().default(true),
  /**
   * Controls how long a single iteration of batched migration execution will
   * run for.
   */
  batchedMigrationsWorkDurationMs: z.number().default(60_000),
  /**
   * Controls how long the batched migrations runner will wait before checking if
   * more work is available.
   */
  batchedMigrationsSleepDurationMs: z.number().default(30_000),
  sslCertificateFile: z.string().default('/etc/pki/tls/certs/localhost.crt'),
  sslKeyFile: z.string().default('/etc/pki/tls/private/localhost.key'),
  sslCAFile: z.string().default('/etc/pki/tls/certs/server-chain.crt'),
  fileUploadMaxBytes: z.number().default(1e7),
  fileUploadMaxParts: z.number().default(1000),
  fileStoreS3Bucket: z.string().default('file-store'),
  fileStoreStorageTypeDefault: z.enum(['S3', 'FileSystem']).default('S3'),
  initNewsItems: z.boolean().default(true),
  cronActive: z.boolean().default(true),
  /**
   * A list of cron job names that should be run. If this is set to a non-null
   * value, only the cron jobs in this list will execute.
   */
  cronEnabledJobs: z.array(z.string()).nullable().default(null),
  /**
   * A list of cron job names that should not be run. If this is set to a non-null
   * value, any cron jobs in this list will not execute.
   */
  cronDisabledJobs: z.array(z.string()).nullable().default(null),
  cronOverrideAllIntervalsSec: z.number().nullable().default(null),
  cronIntervalAutoFinishExamsSec: z.number().default(10 * 60),
  cronIntervalErrorAbandonedJobsSec: z.number().default(10 * 60),
  cronIntervalExternalGraderLoadSec: z.number().default(8),
  cronIntervalServerLoadSec: z.number().default(8),
  cronIntervalServerUsageSec: z.number().default(8),
  cronIntervalCalculateAssessmentQuestionStatsSec: z.number().default(10 * 60),
  cronIntervalWorkspaceTimeoutStopSec: z.number().default(60),
  cronIntervalWorkspaceTimeoutWarnSec: z.number().default(60),
  cronIntervalWorkspaceHostLoadsSec: z.number().default(10),
  cronIntervalWorkspaceHostTransitionsSec: z.number().default(10),
  cronIntervalChunksHostAutoScalingSec: z.number().default(10),
  cronIntervalCleanTimeSeriesSec: z.number().default(10 * 60),
  cronDailySec: z.number().default(8 * 60 * 60),
  /**
   * Controls how much history is retained when removing old rows
   * from the `time_series` table in the database.
   */
  timeSeriesRetentionPeriodSec: z.number().default(24 * 60 * 60),
  /**
   * Configures how often Node metrics are computed and reported to Cloudwatch.
   * Set to `null` to disable Node metric reporting.
   */
  nodeMetricsIntervalSec: z.number().default(5),
  autoFinishAgeMins: z.number().default(6 * 60),
  // TODO: tweak this value once we see the data from #2267
  questionTimeoutMilliseconds: z.number().default(10000),
  secretKey: z.string().default('THIS_IS_THE_SECRET_KEY'),
  secretSlackOpsBotEndpoint: z.string().nullable().default(null),
  secretSlackToken: z.string().nullable().default(null),
  secretSlackCourseRequestChannel: z.string().nullable().default(null),
  githubClientToken: z.string().nullable().default(null),
  githubCourseOwner: z.string().default('PrairieLearn'),
  githubCourseTemplate: z.string().default('pl-template'),
  githubMachineTeam: z.string().default('machine'),
  githubMainBranch: z.string().default('master'),
  gitSshCommand: z.string().nullable().default(null),
  externalGradingUseAws: z.boolean().default(false),
  externalGradingJobsQueueName: z.string().default('grading_jobs_dev'),
  externalGradingResultsQueueName: z.string().default('grading_results_dev'),
  externalGradingJobsDeadLetterQueueName: z.string().nullable().default(null),
  externalGradingResultsDeadLetterQueueName: z.string().nullable().default(null),
  externalGradingAutoScalingGroupName: z.string().nullable().default(null),
  externalGradingS3Bucket: z.string().default('prairielearn.dev.grading'),
  externalGradingDefaultTimeout: z.number().default(30), // seconds
  externalGradingLoadAverageIntervalSec: z.number().default(30),
  externalGradingHistoryLoadIntervalSec: z.number().default(15 * 60),
  externalGradingCurrentCapacityFactor: z.number().default(1),
  externalGradingHistoryCapacityFactor: z.number().default(1),
  externalGradingPullImagesFromDockerHub: z.boolean().default(true),
  externalGradingEnableResults: z.boolean().default(true),
  runningInEc2: z.boolean().default(false),
  cacheImageRegistry: z.string().nullable().default(null),
  fileEditorUseGit: z.boolean().default(false),
  /**
   * The number of worker processes to spawn. If this is set to `null`, the
   * `workersPerCpu` value will be used to determine the number of workers.
   */
  workersCount: z.number().nullable().default(null),
  workersPerCpu: z.number().default(1),
  workersExecutionMode: z.enum(['container', 'native', 'disabled']).default('native'),
  workerUseQueue: z.boolean().default(true),
  workerOverloadDelayMS: z.number().default(10_000),
  /**
   * Controls how long a worker will wait for a worker to respond to a ping.
   * When deployed to EC2, this value may need to be increased to account for
   * EBS initialization, which we've observed can take a fair amount of time.
   */
  workerPingTimeoutMilliseconds: z.number().default(60_000),
  /**
   * Set this to hardcode the executor image. Note that if this is specified,
   * the provided value will be used verbatim - that is, the registry specified
   * by `cacheImageRegistry` will not be prepended. If you want to pull this image
   * from a specific registry, you should include the registry yourself.
   */
  workerExecutorImageRepository: z.string().nullable().default(null),
  /**
   * Set this to hardcode the tag of the worker executor image. This defaults to
   * `latest` in development mode and the hash of the deployed commit when
   * running in production.
   */
  workerExecutorImageTag: z.string().nullable().default(null),
  ensureExecutorImageAtStartup: z.boolean().default(false),
  groupName: z.string().default('local'),
  /**
   * Will be automatically detected when running in EC2.
   */
  instanceId: z.string().default('server'),
  /**
   * Will be automatically detected when running in EC2.
   */
  hostname: z.string().default('localhost'),
  /**
   * Controls how frequently load metrics are reported.
   */
  reportIntervalSec: z.number().default(10),
  maxResponseTimeSec: z.number().default(500),
  serverLoadAverageIntervalSec: z.number().default(30),
  serverUsageIntervalSec: z.number().default(10),
  blockedWarnEnable: z.boolean().default(false),
  blockedAtWarnEnable: z.boolean().default(false),
  blockedWarnThresholdMS: z.number().default(100),
  SEBServerUrl: z.string().nullable().default(null),
  SEBServerFilter: z.string().nullable().default(null),
  SEBDownloadUrl: z.string().nullable().default(null),
  awsRegion: z.string().default('us-east-2'),
  /**
   * This is populated by `lib/aws.js` later.
   */
  awsServiceGlobalOptions: z.record(z.unknown()).default({}),
  hasShib: z.boolean().default(false),
  hideShibLogin: z.boolean().default(false),
  shibLinkText: z.string().default('Sign in with Illinois'),
  shibLinkLogo: z.string().default('/images/illinois_logo.svg'),
  shibLinkColors: z
    .object({
      normal: z.object({
        background: z.string(),
        border: z.string(),
        text: z.string(),
      }),
      hover: z.object({
        background: z.string(),
        border: z.string(),
        text: z.string(),
      }),
      active: z.object({
        background: z.string(),
        border: z.string(),
        text: z.string(),
      }),
      focus: z.object({
        shadow: z.string(),
      }),
    })
    .default({
      normal: { background: '#E84A27', border: '#E84A27', text: 'white' },
      hover: { background: '#D04223', border: '#D04223', text: 'white' },
      active: { background: '#B93B1F', border: '#B93B1F', text: 'white' },
      focus: { shadow: 'rgba(255, 83, 0, 0.35)' },
    }),
  hasAzure: z.boolean().default(false),
  hasOauth: z.boolean().default(false),
  googleClientId: z.string().nullable().default(null),
  googleClientSecret: z.string().nullable().default(null),
  googleRedirectUrl: z.string().nullable().default(null),
  syncExamIdAccessRules: z.boolean().default(false),
  ptHost: z.string().default('http://localhost:4000'),
  checkAccessRulesExamUuid: z.boolean().default(false),
  questionRenderCacheType: z.enum(['none', 'redis', 'memory']).default('none'),
  questionRenderCacheTtlSec: z.number().default(60 * 60),
  hasLti: z.boolean().default(false),
  ltiRedirectUrl: z.string().nullable().default(null),
  filesRoot: z.string().default('/files'),
  /**
   * See the Express documentation for the `trust proxy` option:
   * https://expressjs.com/en/4x/api.html#trust.proxy.options.table
   */
  trustProxy: z.union([z.boolean(), z.number(), z.string()]).default(false),
  workspaceLogsS3Bucket: z.string().nullable().default(null),
  workspaceLogsFlushIntervalSec: z.number().default(60),
  /**
   * The number of days after which a workspace version's logs should no longer
   * be available. Set to `null` to disable log expiration.
   *
   * This useful when you want to configure the underlying S3 bucket to move
   * logs to cheaper storage tiers or evict them entirely after a certain
   * amount of time.
   */
  workspaceLogsExpirationDays: z.number().default(120),
  workspaceAuthzCookieMaxAgeMilliseconds: z.number().default(60 * 1000),
  workspaceJobsDirectoryOwnerUid: z.number().default(0),
  workspaceJobsDirectoryOwnerGid: z.number().default(0),
  workspaceJobsParallelLimit: z.number().default(5),
  workspaceHeartbeatIntervalSec: z.number().default(60),
  workspaceHeartbeatTimeoutSec: z.number().default(10 * 60),
  workspaceVisibilityTimeoutSec: z.number().default(30 * 60),
  workspaceLaunchedTimeoutSec: z.number().default(12 * 60 * 60),
  workspaceLaunchedTimeoutWarnSec: z.number().default(15 * 60),
  workspaceInLaunchingTimeoutSec: z.number().default(30 * 60),
  workspaceLaunchingRetryIntervalSec: z.number().default(10),
  workspaceLaunchingRetryAttempts: z.number().default(60),
  /** Enables or disables workspace creation for tests. */
  workspaceEnable: z.boolean().default(true),
  workspaceCloudWatchName: z.string().default('workspaces_local_dev'),
  workspaceLoadCapacityFactor: z.number().default(1.3),
  /**
   * Controls the desired number of workspaces per host.
   */
  workspaceLoadHostCapacity: z.number().default(40),
  workspaceLoadLaunchTemplateId: z.string().nullable().default(null),
  workspaceLoadLaunchTag: z.string().default('workspace-host'),
  workspaceHostUnhealthyTimeoutSec: z.number().default(12 * 60 * 60),
  workspaceHostLaunchTimeoutSec: z.number().default(10 * 60),
  workspaceUrlRewriteCacheMaxAgeSec: z.number().default(60 * 60),
  /**
   * Where the main server will store workspace files. In production environments,
   * this should be different from the jobs directory. This setting just exists to
   * make local development easier.
   */
  workspaceHomeDirRoot: z.string().default('/jobs/workspaces'),
  /** Controls the maximum number of allowable graded files. */
  workspaceMaxGradedFilesCount: z.number().default(100),
  /** Controls the maximum size of all graded files in bytes. */
  workspaceMaxGradedFilesSize: z.number().default(100 * 1024 * 1024),
  workspaceAutoscalingEnabled: z.boolean().default(true),

  chunksS3Bucket: z.string().default('chunks'),
  /** Enables chunk generation. */
  chunksGenerator: z.boolean().default(false),
  /** Enables chunk consumption. */
  chunksConsumer: z.boolean().default(false),
  /** Directory where chunks will be stored for a chunk consumer. */
  chunksConsumerDirectory: z.string().default('/chunks'),
  chunksMaxParallelDownload: z.number().default(20),
  chunksMaxParallelUpload: z.number().default(20),
  /** The name of the ASG for chunk servers; used to control scaling. */
  chunksAutoScalingGroupName: z.string().nullable().default(null),
  /** Used to read the appropriate request metrics from CloudWatch. */
  chunksLoadBalancerDimensionName: z.string().nullable().default(null),
  /** Used to read the appropriate request metrics from CloudWatch. */
  chunksTargetGroupDimensionName: z.string().nullable().default(null),
  /** Used to read the appropriate request metrics from CloudWatch. */
  chunksHostAutoScalingHistoryIntervalSec: z.number().default(15 * 60),
  /**
   * The number of page views per second that a single chunk server should be able to handle.
   */
  chunksPageViewsCapacityFactor: z.number().default(10),
  /**
   * The number of active workers per second that a single chunk server should be using.
   */
  chunksActiveWorkersCapacityFactor: z.number().default(2),
  /**
   * The number of requests per minute that a single chunk server should be able to handle.
   */
  chunksLoadBalancerRequestsCapacityFactor: z.number().default(1000),
  /**
   * This option may only be set to `true` if the user has obtained a contract,
   * subscription, or other agreement for the use of PrairieLearn Enterprise
   * Edition from PrairieLearn, Inc., or if the user is doing local development/testing of features
   * that use Enterprise Edition code. See the license at `ee/LICENSE` for full
   * details.
   */
  isEnterprise: z.boolean().default(false),
  /**
   * Used to sign JWTs that PrairieLearn provides to PrairieTest for authentication.
   * PrairieTest should be configured with the same value for
   * `prairieLearnAuthSecret`.
   */
  prairieTestAuthSecret: z.string().default('THIS_SHOULD_MATCH_THE_PT_KEY'),
  openTelemetryEnabled: z.boolean().default(false),
  /**
   * Note that the `console` exporter should almost definitely NEVER be used in
   * production environments.
   */
  openTelemetryExporter: z.enum(['console', 'honeycomb', 'jaeger']).default('console'),
  openTelemetryMetricExporter: z.enum(['console', 'honeycomb']).nullable().default(null),
  openTelemetryMetricExportIntervalMillis: z.number().default(30_000),
  openTelemetrySamplerType: z
    .enum(['always-on', 'always-off', 'trace-id-ratio'])
    .default('always-on'),
  /**
   * Only applies if `openTelemetrySamplerType` is `trace-id-ratio`.
   */
  openTelemetrySampleRate: z.number().default(1),
  honeycombApiKey: z.string().nullable().default(null),
  honeycombDataset: z.string().nullable().default('prairielearn-dev'),
  /**
   * Set this to enable reporting errors to Sentry.
   */
  sentryDsn: z.string().nullable().default(null),
  sentryEnvironment: z.string().default('development'),
  sentryTracesSampleRate: z.number().nullable().default(null),
  sentryProfilesSampleRate: z.number().nullable().default(null),
  /**
   * In some markets, such as China, the title of all pages needs to be a
   * specific string in order to comply with local regulations. If this option
   * is set, it will be used verbatim as the `<title>` of all pages.
   */
  titleOverride: z.string().nullable().default(null),
  /**
   * Similarly, China also requires us to include a registration number and link
   * to a specific page on the homepage footer.
   */
  homepageFooterText: z.string().nullable().default(null),
  homepageFooterTextHref: z.string().nullable().default(null),
  /**
   * HTML that will be displayed in a banner at the top of every page. Useful for
   * announcing maintenance windows, etc.
   */
  announcementHtml: z.string().nullable().default(null),
  /**
   * A Bootstrap color (`primary`, `secondary`, `warning`, etc.) for the
   * announcement banner.
   */
  announcementColor: z.string().nullable().default(null),
  /** The name of the auto scaling group that this instance is attached to, if any. */
  autoScalingGroupName: z.string().nullable().default(null),
  /** The name of an ASG lifecycle hook name to complete when launching. */
  autoScalingLaunchingLifecycleHookName: z.string().nullable().default(null),
  /** The name of an ASG lifecycle hook name to complete when terminating. */
  autoScalingTerminatingLifecycleHookName: z.string().nullable().default(null),
  serverJobHeartbeatIntervalSec: z.number().default(10),
  /**
   * Any running server job with a heartbeat that occurred more than this many
   * seconds ago will be considered abandoned. This should always be greater than
   * the configured value for `serverJobHeartbeatIntervalSec`.
   */
  serverJobsAbandonedTimeoutSec: z.number().default(30),
  /**
   * Controls whether or not the course request form will attempt to automatically
   * create a course if the course request meets certain criteria.
   */
  courseRequestAutoApprovalEnabled: z.boolean().default(false),
  attachedFilesDialogEnabled: z.boolean().default(true),
  devMode: z.boolean().default((process.env.NODE_ENV ?? 'development') === 'development'),
  /** The client ID of your app in AAD; required. */
  azureClientID: z.string().default('<your_client_id>'),
  /** The reply URL registered in AAD for your app. */
  azureRedirectUrl: z.string().default('<your_redirect_url>'),
  /** Required if the redirect URL uses the HTTP protocol. */
  azureAllowHttpForRedirectUrl: z.boolean().default(false),
  /** Required. If the app key contains `\`, replace it with `\\`. */
  azureClientSecret: z.string().default('<your_client_secret>'),
  /**
   * Required to encrypt cookies. Multiple key/iv pairs can be provided for key
   * rotation. The first key/iv pair will be used to encrypt cookies, but all
   * key/iv pairs will be used to attempt to decrypt cookies.
   *
   * The key must have length 32, and the iv must have length 12.
   */
  azureCookieEncryptionKeys: z
    .array(
      z.object({
        key: z.string().length(32),
        iv: z.string().length(12),
      }),
    )
    .default([]),
  azureLoggingLevel: z.enum(['error', 'warn', 'info']).default('warn'),
  /**
   * If you want to get access_token for a specific resource, you can provide the
   * resource here; otherwise, set the value to null.
   * Note that in order to get access_token, the responseType must be 'code', 'code id_token' or 'id_token code'.
   */
  azureResourceURL: z.string().nullable().default('https://graph.windows.net'),
  /**
   * The URL to which the user will be redirected to destroy the session.
   */
  azureDestroySessionUrl: z
    .string()
    .nullable()
    .default(
      'https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=http://localhost:3000',
    ),
  features: z.record(z.string(), z.boolean()).default({}),
  /**
   * Determines if QIDs of shared questions being imported should be validated.
   * Turn off in dev mode to enable successful syncs when you don't have access
   * to imported questions. Must be true in production for data integrity.
   */
  checkSharingOnSync: z.boolean().default(false),
  /**
   * A Stripe secret key to be used for billing. Only useful for enterprise
   * installations. See https://stripe.com/docs/keys.
   */
  stripeSecretKey: z.string().nullable().default(null),
  /**
   * A secret key used to sign Stripe webhook events. Only useful for enterprise
   * installations. See https://stripe.com/docs/webhooks.
   */
  stripeWebhookSigningSecret: z.string().nullable().default(null),
  /**
   * Maps a plan name ("basic", "compute", etc.) to a Stripe product ID.
   */
  stripeProductIds: z.record(z.string(), z.string()).default({}),
});

/** @typedef {z.infer<typeof ConfigSchema>} Config */

const loader = new ConfigLoader(ConfigSchema);

module.exports.config = loader.config;

/**
 * Attempts to load config from all our sources, including the given paths.
 *
 * @param {string[]} paths Paths to JSON config files to try to load.
 */
module.exports.loadConfig = async function (paths) {
  await loader.loadAndValidate([
    ...paths.map((path) => makeFileConfigSource(path)),
    makeImdsConfigSource(),
    makeSecretsManagerConfigSource('ConfSecret'),
  ]);
};

module.exports.ConfigSchema = ConfigSchema;

module.exports.setLocalsFromConfig = (locals) => {
  locals.homeUrl = module.exports.config.homeUrl;
  locals.urlPrefix = module.exports.config.urlPrefix;
  locals.plainUrlPrefix = module.exports.config.urlPrefix;
  locals.navbarType = 'plain';
  locals.devMode = module.exports.config.devMode;
  locals.is_administrator = false;
};
