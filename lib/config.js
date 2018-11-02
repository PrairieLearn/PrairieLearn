var _ = require('lodash');
var fs = require('fs');
var logger = require('./logger');
var jsonLoad = require('./json-load');

var config = module.exports;

// defaults - can be overridden in config.json
config.startServer = true;
config.postgresqlUser = 'postgres';
config.postgresqlPassword = null;
config.postgresqlDatabase = 'postgres';
config.postgresqlHost = 'localhost';
config.urlPrefix = '/pl';
config.homeUrl = '/';
config.redisUrl = null; // redis://localhost:6379/ for dev
config.logFilename = 'server.log';
config.authType = 'none';
config.serverType = 'http';
config.serverPort = '3000';
config.cronIntervalAutoFinishExamsSec = 10 * 60;
config.cronIntervalErrorAbandonedJobsSec = 10 * 60;
config.cronIntervalExternalGraderLoadSec = 8;
config.cronIntervalServerLoadSec = 8;
config.cronIntervalServerUsageSec = 8;
config.cronDailySec = 8 * 60 * 60;
config.autoFinishAgeMins = 6 * 60;
config.questionDefaultsDir = 'question-servers/default-calculation';
config.secretKey = 'THIS_IS_THE_SECRET_KEY'; // override in config.json
config.secretSlackOpsBotEndpoint = null; // override in config.json
config.gitSshCommand = null;
config.secretSlackProctorToken = null;
config.secretSlackProctorChannel = null;
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
config.externalGradingHistoryLoadIntervalSec = 3600;
config.externalGradingCurrentCapacityFactor = 1.5;
config.externalGradingHistoryCapacityFactor = 1.5;
config.externalGradingSecondsPerSubmissionPerUser = 120;
config.useWorkers = true;
config.workersCount = null; // if null, use workersPerCpu instead
config.workersPerCpu = 1;
config.workerWarmUpDelayMS = 1000;
config.groupName = 'local'; // used for load reporting
config.instanceId = 'server'; // FIXME: needs to be determed dynamically with new config code
config.reportIntervalSec = 10; // load reporting
config.maxResponseTimeSec = 600;
config.serverLoadAverageIntervalSec = 30;
config.serverUsageIntervalSec = 10;
config.PLpeekUrl = 'https://cbtf.engr.illinois.edu/sched/proctor/plpeek';
config.blockedWarnEnable = false;
config.blockedWarnThresholdMS = 100;
config.SEBServerUrl = null;
config.SEBServerFilter = null;
config.SEBDownloadUrl = null;
config.hasShib = false;
config.hasAzure = false;
config.hasOauth = false;
config.syncExamIdAccessRules = false;
config.checkAccessRulesExamUuid = false;
config.questionRenderCacheType = 'none'; // One of none, redis, memory
config.hasLti = false;
config.ltiRedirectUrl = null;

const azure = {
    // Required
    azureIdentityMetadata: 'https://login.microsoftonline.com/common/.well-known/openid-configuration',
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
        { 'key': '12345678901234567890123456789012', 'iv': '123456789012' },
        { 'key': 'abcdefghijklmnopqrstuvwxyzabcdef', 'iv': 'abcdefghijkl' },
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
    azureDestroySessionUrl: 'https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=http://localhost:3000',
};

_.assign(config, azure);

config.loadConfig = function(file) {
    if (fs.existsSync(file)) {
        let fileConfig = jsonLoad.readJSONSyncOrDie(file, 'schemas/serverConfig.json');
        _.assign(config, fileConfig);
    } else {
        logger.warn(file + ' not found, using default configuration');
    }
};
