// @ts-check
const _ = require('lodash');
const fs = require('fs');
const { logger } = require('@prairielearn/logger');
const jsonLoad = require('./json-load');
const schemas = require('../schemas');
const { callbackify } = require('util');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

const config = module.exports;

// defaults - can be overridden in config.json
config.startServer = true;
config.postgresqlUser = 'postgres';
config.postgresqlPassword = null;
config.postgresqlDatabase = 'postgres';
config.postgresqlHost = 'localhost';
config.postgresqlPoolSize = 100;
config.postgresqlIdleTimeoutMillis = 30000;
config.courseDirs = [
  '/course',
  '/course2',
  '/course3',
  '/course4',
  '/course5',
  '/course6',
  '/course7',
  '/course8',
  '/course9',
  'exampleCourse',
  'testCourse',
];
config.courseRepoDefaultBranch = 'master';
config.urlPrefix = '/pl';
config.homeUrl = '/';
config.coursesRoot = '/data1/courses';
config.redisUrl = 'redis://localhost:6379/'; // set to '' to disable redis
config.logFilename = 'server.log';
config.logErrorFilename = null;
config.authType = 'none'; // to bypass auth on a local server
config.authUid = 'dev@illinois.edu'; // to specify the user id on a local server (with auth bypass)
config.authName = 'Dev User'; // to specify the user name on a local server (with auth bypass)
config.authUin = '000000000'; // to specify the user uin on a local server (with auth bypass)
config.authnCookieMaxAgeMilliseconds = 30 * 24 * 60 * 60 * 1000;
config.serverType = 'http';
config.serverPort = '3000';
config.serverTimeout = 10 * 60 * 1000; // 10 minutes
/**
 * How many milliseconds to wait before destroying a socket that is being
 * kept alive. This should always be greater than the timeout at the load
 * balancer. The default here works for AWS ALBs, where the default timeout is
 * 60 seconds. This should be adjusted appropriately for other load balancers.
 */
config.serverKeepAliveTimeout = 65 * 1000;
config.serverCanonicalHost = null; // should be set to, e.g., https://us.prairielearn.com if server uses proxy/load balancer
config.runMigrations = true;
config.sslCertificateFile = '/etc/pki/tls/certs/localhost.crt';
config.sslKeyFile = '/etc/pki/tls/private/localhost.key';
config.sslCAFile = '/etc/pki/tls/certs/server-chain.crt';
config.fileUploadMaxBytes = 1e7;
config.fileUploadMaxParts = 1000;
config.fileStoreS3Bucket = 'file-store';
config.fileStoreStorageTypeDefault = 'S3';
config.initNewsItems = true;
config.cronActive = true;
/**
 * A list of cron job names that should be run. If this is set to a non-null
 * value, only the cron jobs in this list will execute.
 */
config.cronEnabledJobs = null;
/**
 * A list of cron job names that should not be run. If this is set to a non-null
 * value, any cron jobs in this list will not execute.
 */
config.cronDisabledJobs = null;
config.cronOverrideAllIntervalsSec = null;
config.cronIntervalAutoFinishExamsSec = 10 * 60;
config.cronIntervalErrorAbandonedJobsSec = 10 * 60;
config.cronIntervalExternalGraderLoadSec = 8;
config.cronIntervalServerLoadSec = 8;
config.cronIntervalServerUsageSec = 8;
config.cronIntervalCalculateAssessmentQuestionStatsSec = 10 * 60;
config.cronIntervalWorkspaceTimeoutStopSec = 60;
config.cronIntervalWorkspaceTimeoutWarnSec = 60;
config.cronIntervalWorkspaceHostLoadsSec = 10;
config.cronIntervalWorkspaceHostTransitionsSec = 10;
config.cronIntervalChunksHostAutoScalingSec = 10;
config.cronIntervalCleanTimeSeriesSec = 10 * 60;
config.cronDailySec = 8 * 60 * 60;
/**
 * Controls how much history is retained when removing old rows
 * from the `time_series` table in the database.
 */
config.timeSeriesRetentionPeriodSec = 24 * 60 * 60; // 1 day
/**
 * Configures how often Node metrics are computed and reported to Cloudwatch.
 * Set to `null` to disable Node metric reporting.
 */
config.nodeMetricsIntervalSec = 5;
config.autoFinishAgeMins = 6 * 60;
config.questionDefaultsDir = 'question-servers/default-calculation';
config.questionTimeoutMilliseconds = 10000; // TODO: tweak this value once we see the data from #2267
config.secretKey = 'THIS_IS_THE_SECRET_KEY'; // override in config.json
config.secretSlackOpsBotEndpoint = null; // override in config.json
config.secretSlackToken = null;
config.secretSlackCourseRequestChannel = null; // override in config.json
config.githubClientToken = null; // override in config.json
config.githubCourseOwner = 'PrairieLearn';
config.githubCourseTemplate = 'pl-template';
config.githubMachineTeam = 'machine';
config.githubMainBranch = 'master';
config.gitSshCommand = null;
config.externalGradingUseAws = false;
config.externalGradingJobsQueueName = 'grading_jobs_dev';
config.externalGradingResultsQueueName = 'grading_results_dev';
config.externalGradingJobsDeadLetterQueueName = null;
config.externalGradingResultsDeadLetterQueueName = null;
config.externalGradingAutoScalingGroupName = null;
config.externalGradingS3Bucket = 'prairielearn.dev.grading';
config.externalGradingDefaultTimeout = 30; // in seconds
config.externalGradingLoadAverageIntervalSec = 30;
config.externalGradingHistoryLoadIntervalSec = 15 * 60;
config.externalGradingCurrentCapacityFactor = 1;
config.externalGradingHistoryCapacityFactor = 1;
config.externalGradingPullImagesFromDockerHub = true;
config.externalGradingEnableResults = true;
config.workspacePullImagesFromDockerHub = true;
config.runningInEc2 = false;
config.cacheImageRegistry = null;
config.fileEditorUseGit = false;
config.workersCount = null; // if null, use workersPerCpu instead
config.workersPerCpu = 1;
/** @type {'container' | 'native' | 'disabled'} */
config.workersExecutionMode = 'native';
/**
 * Controls how legacy v2 questions are executed.
 *
 * - 'inprocess' executes them in the main process.
 * - 'subprocess' executes them in a subprocess via Python workers.
 * - 'parallel-run' executes them in both the main process and a subprocess and
 *   reports any differences in the results.
 *
 * @type {'inprocess' | 'subprocess' | 'parallel-run'}
 */
config.legacyQuestionExecutionMode = 'inprocess';
config.workerUseQueue = true;
config.workerOverloadDelayMS = 10000;
/**
 * Controls how long a worker will wait for a worker to respond to a ping.
 * When deployed to EC2, this value may need to be increased to account for
 * EBS initialization, which we've observed can take a fair amount of time.
 */
config.workerPingTimeoutMilliseconds = 60_000;
/**
 * Set this to hardcode the executor image. Note that if this is specified,
 * the provided value will be used verbatim - that is, the registry specified
 * by `cacheImageRegistry` will not be prepended. If you want to pull this image
 * from a specific registry, you should include the registry yourself.
 */
config.workerExecutorImageRepository = null;
/**
 * Set this to hardcode the tag of the worker executor image. This defaults to
 * `latest` in development mode and the hash of the deployed commit when
 * running in production.
 */
config.workerExecutorImageTag = null;
config.ensureExecutorImageAtStartup = false;
config.groupName = 'local'; // used for load reporting
config.instanceId = 'server'; // will be overridden by EC2 auto-detect
config.hostname = 'localhost'; // will be overridden by EC2 auto-detect
config.reportIntervalSec = 10; // load reporting
config.maxResponseTimeSec = 500;
config.serverLoadAverageIntervalSec = 30;
config.serverUsageIntervalSec = 10;
config.blockedWarnEnable = false;
config.blockedAtWarnEnable = false;
config.blockedWarnThresholdMS = 100;
config.SEBServerUrl = null;
config.SEBServerFilter = null;
config.SEBDownloadUrl = null;
config.awsRegion = 'us-east-2';
/** This will be populated by `lib/aws.js` later. */
config.awsServiceGlobalOptions = {};
config.hasShib = false;
config.hideShibLogin = false;
config.shibLinkText = 'Sign in with Illinois';
config.shibLinkLogo = '/images/illinois_logo.svg';
config.shibLinkColors = {
  normal: { background: '#E84A27', border: '#E84A27', text: 'white' },
  hover: { background: '#D04223', border: '#D04223', text: 'white' },
  active: { background: '#B93B1F', border: '#B93B1F', text: 'white' },
  focus: { shadow: 'rgba(255, 83, 0, 0.35)' },
};
config.hasAzure = false;
config.hasOauth = false;
config.googleClientId = null;
config.googleClientSecret = null;
config.googleRedirectUrl = null;
config.syncExamIdAccessRules = false;
config.ptHost = 'http://localhost:4000';
config.checkAccessRulesExamUuid = false;
config.questionRenderCacheType = 'none'; // One of none, redis, memory
config.questionRenderCacheMaxItems = 100_000;
config.questionRenderCacheMaxAgeMilliseconds = 6 * 60 * 60 * 1000;
config.hasLti = false;
config.ltiRedirectUrl = null;
config.filesRoot = '/files';
config.trustProxy = false; // Set this to a value from (https://expressjs.com/en/4x/api.html#trust.proxy.options.table) if we're behind a proxy
config.workspaceLogsS3Bucket = null;
config.workspaceLogsFlushIntervalSec = 60;
/**
 * The number of days after which a workspace version's logs should no longer
 * be available. Set to `null` to disable log expiration.
 *
 * This useful when you want to configure the underlying S3 bucket to move
 * logs to cheaper storage tiers or evict them entirely after a certain
 * amount of time.
 */
config.workspaceLogsExpirationDays = 120;
config.workspaceDevHostInstanceId = 'devWSHost1';
config.workspaceDevHostHostname = 'localhost';
config.workspaceHostPort = 8081;
config.workspaceDevContainerHostname = 'host.docker.internal';
config.workspaceAuthzCookieMaxAgeMilliseconds = 60 * 1000;
config.workspaceJobsDirectoryOwnerUid = 0;
config.workspaceJobsDirectoryOwnerGid = 0;
config.workspaceJobsParallelLimit = 5;
config.workspaceHeartbeatIntervalSec = 60;
config.workspaceHeartbeatTimeoutSec = 10 * 60;
config.workspaceVisibilityTimeoutSec = 30 * 60;
config.workspaceLaunchedTimeoutSec = 12 * 60 * 60;
config.workspaceLaunchedTimeoutWarnSec = 15 * 60;
config.workspaceInLaunchingTimeoutSec = 30 * 60;
config.workspaceLaunchingRetryIntervalSec = 10;
config.workspaceLaunchingRetryAttempts = 60;
config.workspaceHostFileWatchIntervalSec = 5;
config.workspaceHostPruneContainersSec = 60;
config.workspaceHostMinPortRange = 1024;
config.workspaceHostMaxPortRange = 45000; // Docker on Windows gives issues with ports above this, so limit it just to be safe
config.workspaceHostMaxPortAllocationAttempts = 0; // Set to a positive integer to limit the number of attempts
config.workspaceEnable = true; // Enable or disable workspaces creation for tests
config.workspaceCloudWatchName = 'workspaces_local_dev';
config.workspaceLoadCapacityFactor = 1.3;
config.workspaceLoadHostCapacity = 40; // Desired number of average workspaces per host
config.workspaceLoadLaunchTemplateId = null;
config.workspaceLoadLaunchTag = 'workspace-host';
config.workspaceHostUnhealthyTimeoutSec = 12 * 60 * 60;
config.workspaceHostLaunchTimeoutSec = 10 * 60;
config.workspaceUrlRewriteCacheMaxAgeSec = 60 * 60;
config.workspacePercentMessageRateLimitSec = 1;
config.workspaceSupportNoInternet = false;
config.workspaceHomeDirRoot = '/jobs/workspaces'; // Where the main server will store workspace files.  Note on production this should be different from the jobs directory, this is just to make local development easier.
config.workspaceHostHomeDirRoot = '/jobs/workspaces'; // Where the workspace host server will store workspace files.
config.workspaceDockerMemory = 1 << 30; // 1 GiB
config.workspaceDockerMemorySwap = 1 << 30; // same as Memory, so no access to swap
config.workspaceDockerKernelMemory = 1 << 29; // 512 MiB
config.workspaceDockerDiskQuota = 1 << 30; // 1 GiB
config.workspaceDockerCpuPeriod = 100000; // microseconds
config.workspaceDockerCpuQuota = 90000; // portion of the CpuPeriod for this container
config.workspaceDockerPidsLimit = 1024;
config.workspaceMaxGradedFilesCount = 100; // maximum number of graded files
config.workspaceMaxGradedFilesSize = 100 * 1024 * 1024; // maximum total size for graded files

config.chunksS3Bucket = 'chunks';
config.chunksGenerator = false; // Should we generate chunks?
config.chunksConsumer = false; // Will this server consume chunks?
config.chunksConsumerDirectory = '/chunks'; // local storage for a chunks consumer
config.chunksMaxParallelDownload = 20;
config.chunksMaxParallelUpload = 20;
/** The name of the ASG for chunk servers; used to control scaling. */
config.chunksAutoScalingGroupName = null;
/** Used to read the appropriate request metrics from CloudWatch. */
config.chunksLoadBalancerDimensionName = null;
/** Used to read the appropriate request metrics from CloudWatch. */
config.chunksTargetGroupDimensionName = null;
/**
 * How many seconds worth of CloudWatch data to use when computing the number
 * of desired chunk servers.
 */
config.chunksHostAutoScalingHistoryIntervalSec = 15 * 60;
/**
 * The number of page views per second that a single chunk server should be able to handle.
 */
config.chunksPageViewsCapacityFactor = 10;
/**
 * The number of active workers per second that a single chunk server should be using.
 */
config.chunksActiveWorkersCapacityFactor = 2;
/**
 * The number of requests per minute that a single chunk server should be able to handle.
 */
config.chunksLoadBalancerRequestsCapacityFactor = 1000;

/**
 * This option may only be set to `true` if the user has obtained a contract,
 * subscription, or other agreement for the use of PrairieLearn Enterprise
 * Edition from PrairieLearn, Inc., or if the user is doing local development/testing of features
 * that use Enterprise Edition code. See the license at `ee/LICENSE` for full
 * details.
 */
config.isEnterprise = false;

/**
 * Used to sign JWTs that PrairieLearn provides to PrairieTest for authentication.
 * PrairieTest should be configured with the same value for
 * `prairieLearnAuthSecret`.
 */
config.prairieTestAuthSecret = 'THIS_SHOULD_MATCH_THE_PT_KEY';

config.openTelemetryEnabled = false;
/**
 * Note that the `console` exporter should almost definitely NEVER be used in
 * production environments.
 *
 * @type {'console' | 'honeycomb' | 'jaeger'}
 */
config.openTelemetryExporter = 'console';
/** @type {'console' | 'honeycomb' | null} */
config.openTelemetryMetricExporter = null;
config.openTelemetryMetricExportIntervalMillis = 30_000;
/** @type {'always-on' | 'always-off' | 'trace-id-ratio'} */
config.openTelemetrySamplerType = 'always-on';
/**
 * Only applies if `openTelemetrySamplerType` is `trace-id-ratio`.
 *
 * @type {number}
 */
config.openTelemetrySampleRate = 1;
config.honeycombApiKey = null;
config.honeycombDataset = 'prairielearn-dev';

/**
 * Set this to enable reporting errors to Sentry.
 *
 * @type {string | null}
 */
config.sentryDsn = null;
config.sentryEnvironment = 'development';
config.sentryTracesSampleRate = null;
config.sentryProfilesSampleRate = null;

config.pyroscopeEnabled = false;
config.pyroscopeServerAddress = 'https://ingest.pyroscope.cloud';
config.pyroscopeAuthToken = null;
config.pyroscopeTags = {};

/**
 * In some markets, such as China, the title of all pages needs to be a
 * specific string in order to comply with local regulations. If this option
 * is set, it will be used verbatim as the `<title>` of all pages.
 */
config.titleOverride = null;

/**
 * Similarly, China also requires us to include a registration number and link
 * to a specific page on the homepage footer.
 */
config.homepageFooterText = null;
config.homepageFooterTextHref = null;

/**
 * HTML that will be displayed in a banner at the top of every page. Useful for
 * announcing maintenance windows, etc.
 */
config.announcementHtml = null;
/**
 * A Bootstrap color (`primary`, `secondary`, `warning`, etc.) for the
 * announcement banner.
 */
config.announcementColor = null;

/** The name of the auto scaling group that this instance is attached to, if any. */
config.autoScalingGroupName = null;
/** The name of an ASG lifecycle hook name to complete when launching. */
config.autoScalingLaunchingLifecycleHookName = null;
/** The name of an ASG lifecycle hook name to complete when terminating. */
config.autoScalingTerminatingLifecycleHookName = null;

config.serverJobHeartbeatIntervalSec = 10;
/**
 * Any running server job with a heartbeat that occurred more than this many
 * seconds ago will be considered abandoned. This should always be greater than
 * the above {@link config.serverJobHeartbeatIntervalSec} value.
 */
config.serverJobsAbandonedTimeoutSec = 30;

/**
 * Controls whether or not the course request form will attempt to automatically
 * create a course if the course request meets certain criteria.
 */
config.courseRequestAutoApprovalEnabled = false;

config.attachedFilesDialogEnabled = true;
config.devMode = (process.env.NODE_ENV ?? 'development') === 'development';

/** The client ID of your app in AAD; required. */
config.azureClientID = '<your_client_id>';

/** The reply URL registered in AAD for your app. */
config.azureRedirectUrl = '<your_redirect_url>';

/** Required if the redirect URL uses the HTTP protocol. */
config.azureAllowHttpForRedirectUrl = false;

/** Required. If the app key contains `\`, replace it with `\\`. */
config.azureClientSecret = '<your_client_secret>';

/**
 * Required to encrypt cookies. Multiple key/iv pairs can be provided for key
 * rotation. The first key/iv pair will be used to encrypt cookies, but all
 * key/iv pairs will be used to attempt to decrypt cookies.
 *
 * The key must have length 32, and the iv must have length 12.
 * @type {{ key: string, iv: string }[]}
 */
config.azureCookieEncryptionKeys = [];

/** @type {'error' | 'warn' | 'info'} */
config.azureLoggingLevel = 'warn';

/**
 * If you want to get access_token for a specific resource, you can provide the
 * resource here; otherwise, set the value to null.
 * Note that in order to get access_token, the responseType must be 'code', 'code id_token' or 'id_token code'.
 */
config.azureResourceURL = 'https://graph.windows.net';

// The url you need to go to destroy the session with AAD
config.azureDestroySessionUrl =
  'https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=http://localhost:3000';

config.loadConfig = function (file) {
  if (fs.existsSync(file)) {
    const fileConfig = jsonLoad.readJSONSyncOrDie(file, schemas.serverConfig);
    _.assign(config, fileConfig);
  } else {
    logger.info(file + ' not found, using default configuration');
  }
};

config.loadConfigAsync = async (file) => {
  let exists;
  try {
    exists = await fs.promises.stat(file);
  } catch (_err) {
    exists = false;
  }

  if (exists) {
    const fileConfig = await jsonLoad.readJSONAsync(file);
    await jsonLoad.validateJSONAsync(fileConfig, schemas.serverConfig);
    _.assign(config, fileConfig);
  } else {
    logger.info(file + ' not found, using default configuration');
  }
};

config.setLocals = (locals) => {
  locals.homeUrl = config.homeUrl;
  locals.urlPrefix = config.urlPrefix;
  locals.plainUrlPrefix = config.urlPrefix;
  locals.navbarType = 'plain';
  locals.devMode = config.devMode;
  locals.is_administrator = false;
};

config.getDBConfigValueAsync = async function (key, defaultVal) {
  const result = await sqldb.callAsync('config_select', [key]);
  if (result.rows.length === 0) {
    return defaultVal;
  } else {
    return result.rows[0].value;
  }
};
config.getDBConfigValue = callbackify(config.getDBConfigValueAsync);

config.setDBConfigValueAsync = async function (key, value) {
  await sqldb.queryOneRowAsync(sql.set_value, { key, value });
};
config.setDBConfigValue = callbackify(config.setDBConfigValueAsync);

config.removeDBConfigValueAsync = async function (key) {
  await sqldb.queryAsync(sql.remove_key, { key });
};
config.removeDBConfigValue = callbackify(config.removeDBConfigValueAsync);
