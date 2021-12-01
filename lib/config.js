const _ = require('lodash');
const fs = require('fs');
const logger = require('./logger');
const jsonLoad = require('./json-load');
const schemas = require('../schemas');
const { callbackify } = require('util');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

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
config.authType = 'none'; // to bypass auth on a local server
config.authUid = 'dev@illinois.edu'; // to specify the user id on a local server (with auth bypass)
config.authName = 'Dev User'; // to specify the user name on a local server (with auth bypass)
config.authUin = '000000000'; // to specify the user uin on a local server (with auth bypass)
config.authnCookieMaxAgeMilliseconds = 30 * 24 * 60 * 60 * 1000;
config.serverType = 'http';
config.serverPort = '3000';
config.serverCanonicalHost = null; // should be set to, e.g., https://www.prairielearn.org if server uses proxy/load balancer
config.runMigrations = true;
config.sslCertificateFile = '/etc/pki/tls/certs/localhost.crt';
config.sslKeyFile = '/etc/pki/tls/private/localhost.key';
config.sslCAFile = '/etc/pki/tls/certs/server-chain.crt';
config.fileUploadMaxBytes = 1e7;
config.fileUploadMaxParts = 1000;
config.fileStoreS3Bucket = 'file-store';
config.fileStoreStorageTypeDefault = 'S3';
config.cronActive = true;
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
config.cronDailySec = 8 * 60 * 60;
config.autoFinishAgeMins = 6 * 60;
config.questionDefaultsDir = 'question-servers/default-calculation';
config.questionTimeoutMilliseconds = 10000; // TODO: tweak this value once we see the data from #2267
config.secretKey = 'THIS_IS_THE_SECRET_KEY'; // override in config.json
config.secretSlackOpsBotEndpoint = null; // override in config.json
config.secretSlackToken = null;
config.secretSlackProctorChannel = null;
config.secretSlackCourseRequestChannel = null; // override in config.json
config.githubClientToken = null; /* override in config.json */
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
config.externalGradingWebhookUrl = null;
config.externalGradingDefaultTimeout = 30; // in seconds
config.externalGradingLoadAverageIntervalSec = 30;
config.externalGradingHistoryLoadIntervalSec = 5400;
config.externalGradingCurrentCapacityFactor = 1;
config.externalGradingHistoryCapacityFactor = 1;
config.externalGradingPullImagesFromDockerHub = true;
config.externalGradingEnableResults = true;
config.workspacePullImagesFromDockerHub = true;
config.runningInEc2 = false;
config.cacheImageRegistry = null;
config.fileEditorUseGit = false;
config.useWorkers = true;
config.workersCount = null; // if null, use workersPerCpu instead
config.workersPerCpu = 1;
config.workerWarmUpDelayMS = 1000;
config.workerUseQueue = true;
config.workerOverloadDelayMS = 10000;
config.groupName = 'local'; // used for load reporting
config.instanceId = 'server'; // will be overridden by EC2 auto-detect
config.instanceIdEc2Override = null; // will override EC2 auto-detect
config.hostname = 'localhost'; // will be overridden by EC2 auto-detect
config.reportIntervalSec = 10; // load reporting
config.maxResponseTimeSec = 500;
config.serverLoadAverageIntervalSec = 30;
config.serverUsageIntervalSec = 10;
config.PLpeekUrl = 'https://cbtf.engr.illinois.edu/sched/proctor/plpeek';
config.blockedWarnEnable = false;
config.blockedAtWarnEnable = false;
config.blockedWarnThresholdMS = 100;
config.SEBServerUrl = null;
config.SEBServerFilter = null;
config.SEBDownloadUrl = null;
config.awsRegion = 'us-east-2';
config.awsServiceGlobalOptions = {};
config.hasShib = false;
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
config.syncExamIdAccessRules = false;
config.ptHost = 'http://localhost:4000';
config.checkAccessRulesExamUuid = false;
config.questionRenderCacheType = 'none'; // One of none, redis, memory
config.questionRenderCacheMaxItems = 100_000;
config.questionRenderCacheMaxAgeMilliseconds = 6 * 60 * 60 * 1000;
config.hasLti = false;
config.ltiRedirectUrl = null;
config.filesRoot = '/files';
config.trustProxy = false; /* Set this to a value from (https://expressjs.com/en/4x/api.html#trust.proxy.options.table) if we're behind a proxy */
config.workspaceS3Bucket = 'workspaces';
config.workspaceDevHostInstanceId = 'devWSHost1';
config.workspaceDevHostHostname = 'localhost';
config.workspaceHostPort = 8081;
config.workspaceDevContainerHostname = 'host.docker.internal';
config.workspaceAuthzCookieMaxAgeMilliseconds = 60 * 1000;
config.workspaceJobsDirectory = '/jobs/workspaces';
config.workspaceJobsDirectoryOwnerUid = 0;
config.workspaceJobsDirectoryOwnerGid = 0;
config.workspaceJobsParallelLimit = 5;
config.workspaceMainZipsDirectory = '/workspace_main_zips';
config.workspaceHostZipsDirectory = '/workspace_host_zips';
config.workspaceHeartbeatIntervalSec = 60;
config.workspaceHeartbeatTimeoutSec = 10 * 60;
config.workspaceLaunchedTimeoutSec = 12 * 60 * 60;
config.workspaceLaunchedTimeoutWarnSec = 15 * 60;
config.workspaceInLaunchingTimeoutSec = 30 * 60;
config.workspaceLaunchingRetryIntervalSec = 10;
config.workspaceLaunchingRetryAttempts = 60;
config.workspaceHostFileWatchIntervalSec = 5;
config.workspaceHostForceUploadIntervalSec = 10 * 60;
config.workspaceHostPruneContainersSec = 60;
config.workspaceHostMinPortRange = 1024;
config.workspaceHostMaxPortRange = 45000; /* Docker on Windows gives issues with ports above this, so limit it just to be safe */
config.workspaceHostMaxPortAllocationAttempts = 0; /* Set to a positive integer to limit the number of attempts */
config.workspaceEnable = true; /* Enable or disable workspaces creation for tests */
config.workspaceCloudWatchName = 'workspaces_local_dev';
config.workspaceLoadCapacityFactor = 1.3;
config.workspaceLoadHostCapacity = 40; /* Desired number of average workspaces per host */
config.workspaceLoadLaunchTemplateId = null;
config.workspaceLoadLaunchTag = 'workspace-host';
config.workspaceHostUnhealthyTimeoutSec = 12 * 60 * 60;
config.workspaceHostLaunchTimeoutSec = 10 * 60;
config.workspaceUrlRewriteCacheMaxAgeSec = 60 * 60;
config.workspacePercentMessageRateLimitSec = 1;
config.workspaceSupportNoInternet = false;
config.workspaceHomeDirRoot =
  '/jobs/workspaces'; /* Where the main server will store workspace files.  Note on production this should be different from the jobs directory, this is just to make local development easier. */
config.workspaceHostHomeDirRoot =
  '/jobs/workspaces'; /* Where the workspace host server will store workspace files. */
config.workspaceHostWatchJobFiles = false; /* Should be enabled if we're watching files to sync with S3 */
config.workspaceHomeDirLocation = 'FileSystem';

config.chunksS3Bucket = 'chunks';
config.chunksGenerator = false; /* Should we generate chunks? */
config.chunksConsumer = false; /* Will this server consume chunks? */
config.chunksConsumerDirectory = '/chunks'; // local storage for a chunks consumer
config.chunksMaxParallelDownload = 20;
config.chunksMaxParallelUpload = 20;

config.openTelemetryEnabled = false;
/**
 * Note that the `console` exporter should almost definitely NEVER be used in
 * production environments.
 *
 * @type {'console' | 'honeycomb'}
 */
config.openTelemetryExporter = 'console';
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

config.attachedFilesDialogEnabled = true;
config.devMode = false;

// This will be populated by `lib/aws.js` later
config.awsServiceGlobalOptions = {};

const azure = {
  // Required
  azureIdentityMetadata:
    'https://login.microsoftonline.com/common/.well-known/openid-configuration',
  // azureIdentityMetadata: 'https://login.microsoftonline.com/<tenant_name>.onmicrosoft.com/.well-known/openid-configuration',
  // or equivalently: 'https://login.microsoftonline.com/<tenant_guid>/.well-known/openid-configuration'
  //
  // or you can use the common endpoint
  // 'https://login.microsoftonline.com/common/.well-known/openid-configuration'
  // To use the common endpoint, you have to either set `validateIssuer` to false, or provide the `issuer` value.

  // Required, the client ID of your app in AAD
  azureClientID: '<your_client_id>',

  // Required, must be 'code', 'code id_token', 'id_token code' or 'id_token'
  azureResponseType: 'code id_token',

  // Required
  azureResponseMode: 'form_post',

  // Required, the reply URL registered in AAD for your app
  azureRedirectUrl: 'http://localhost:3000/auth/openid/return',

  // Required if we use http for redirectUrl
  azureAllowHttpForRedirectUrl: false,

  // Required if `responseType` is 'code', 'id_token code' or 'code id_token'.
  // If app key contains '\', replace it with '\\'.
  azureClientSecret: '<your_client_secret>',

  // Required to set to false if you don't want to validate issuer
  azureValidateIssuer: false,

  // Required if you want to provide the issuer(s) you want to validate instead of using the issuer from metadata
  azureIssuer: null,

  // Required to set to true if the `verify` function has 'req' as the first parameter
  azurePassReqToCallback: false,

  // Recommended to set to true. By default we save state in express session, if this option is set to true, then
  // we encrypt state and save it in cookie instead. This option together with { session: false } allows your app
  // to be completely express session free.
  azureUseCookieInsteadOfSession: true,

  // Required if `useCookieInsteadOfSession` is set to true. You can provide multiple set of key/iv pairs for key
  // rollover purpose. We always use the first set of key/iv pair to encrypt cookie, but we will try every set of
  // key/iv pair to decrypt cookie. Key can be any string of length 32, and iv can be any string of length 12.
  azureCookieEncryptionKeys: [
    { key: '12345678901234567890123456789012', iv: '123456789012' },
    { key: 'abcdefghijklmnopqrstuvwxyzabcdef', iv: 'abcdefghijkl' },
  ],

  // Optional. The additional scope you want besides 'openid', for example: ['email', 'profile'].
  azureScope: null,

  // Optional, 'error', 'warn' or 'info'
  azureLoggingLevel: 'warn',

  // Optional. The lifetime of nonce in session or cookie, the default value is 3600 (seconds).
  azureNonceLifetime: null,

  // Optional. The max amount of nonce saved in session or cookie, the default value is 10.
  azureNonceMaxAmount: 5,

  // Optional. The clock skew allowed in token validation, the default value is 300 seconds.
  azureClockSkew: null,

  // Optional.
  // If you want to get access_token for a specific resource, you can provide the resource here; otherwise,
  // set the value to null.
  // Note that in order to get access_token, the responseType must be 'code', 'code id_token' or 'id_token code'.
  azureResourceURL: 'https://graph.windows.net',

  // The url you need to go to destroy the session with AAD
  azureDestroySessionUrl:
    'https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=http://localhost:3000',
};

_.assign(config, azure);

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

/* Some helper functions to access the 'config' table in the database */
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
