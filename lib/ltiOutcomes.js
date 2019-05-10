const ERR = require('async-stacktrace');
const request = require('request');
const xml2js = require('xml2js');
const _ = require('lodash');

var sqldb = require('@prairielearn/prairielib').sqlDb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var config = require('./config');
var logger = require('./logger');

var sql = sqlLoader.loadSqlEquiv(__filename);
var parser = new xml2js.Parser({explicitArray: false});
var builder = new xml2js.Builder();

const exampleRequest =
{ imsx_POXEnvelopeRequest:
   { '$':
      { xmlns: 'http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0' },
     imsx_POXHeader:
      { imsx_POXRequestHeaderInfo:
         { imsx_version: 'V1.0', imsx_messageIdentifier: '999999123' } },
     imsx_POXBody:
      { replaceResultRequest:
         { resultRecord:
            { sourcedGUID: { sourcedId: '3124567' },
              result: { resultScore: { language: 'en', textString: '0.92' } } } } } } }
;

function xmlReplaceResult(sourcedId, score, identifier) {

    var Obj = _.clone(exampleRequest);

    Obj.imsx_POXEnvelopeRequest.imsx_POXHeader.imsx_POXRequestHeaderInfo.imsx_messageIdentifier = identifier;
    Obj.imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord.sourcedGUID.sourcedId = sourcedId;
    Obj.imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord.result.resultScore.textString = score;

    var xml = builder.buildObject(Obj);
    return xml;
}

/**
 * Check if LTI needs updating for this assessment.
 *
 * @param {number} ai_id - The assessment instance
 * @param {?Object} client - The sqldb client, if we have one, null otherwise.
 * @param {function} callback - A callback(err) function.
 */
var updateScore = function(ai_id, client, callback) {
    if (ai_id == null) return callback(null);

    if (client == null) {
        sqldb.getClient(function(err, client, done) {
            if (ERR(err, callback)) return;
            _updateScoreWithClient(ai_id, client, function(err) {
                // Might not be enough error catching?
                if (ERR(err, callback)) return;
                done(null);
                callback(null);
            });
        });
    } else {
        _updateScoreWithClient(ai_id, client, callback);
    }
};

/**
 * Internal function helper for updateScore, assumes sql-db client.
 */
var _updateScoreWithClient = function(ai_id, client, callback) {

    sqldb.queryWithClientZeroOrOneRow(client, sql.get_score, {ai_id: ai_id}, (err, result) => {
        if (ERR(err, callback)) return;
        if (result.rowCount == 0) {
            return callback(null);
        }

        var info = result.rows[0];

        var score = info.score_perc / 100;
        if (score > 1) { score = 1.0; }
        if (score < 0) { score = 0.0; }

        var post_params = {
            url: info.lis_outcome_service_url,
            oauth: {
                consumer_key: info.consumer_key,
                consumer_secret: info.secret,
                body_hash: true,
            },
            body: xmlReplaceResult(info.lis_result_sourcedid, score, info.date),
        };

        request.post(post_params, function(err, httpResponse, body) {
            if (ERR(err, callback)) return;

            // Inspect the XML result, log the action
            parser.parseString(body, (err, result) => {
                if (ERR(err, callback)) return;
                const imsx_codeMajor = _.get(result, ['imsx_POXEnvelopeResponse', 'imsx_POXHeader', 'imsx_POXResponseHeaderInfo', 'imsx_statusInfo', 'imsx_codeMajor'], null);
                if (imsx_codeMajor == 'success') {
                    logger.info(`ltiOutcomes.updateScore() ai_id=${ai_id} score=${score} returned ${result.imsx_POXEnvelopeResponse.imsx_POXHeader.imsx_POXResponseHeaderInfo.imsx_statusInfo.imsx_codeMajor}`);
                } else {
                    logger.info(`ltiOutcomes.updateScore() ai_id=${ai_id} score=${score} did not return success, debugging follows:`);
                    logger.info(post_params);
                    logger.info(body);
                }
                callback(null);
            });
        });
    });
};

// Only run if called directly, for development
// e.g. node lib/ltiOutcomes <assessment_instance_id>
if (require.main == module) {

    var pgConfig = {
        user: config.postgresqlUser,
        database: config.postgresqlDatabase,
        host: config.postgresqlHost,
        password: config.postgresqlPassword,
        max: 100,
        idleTimeoutMillis: 30000,
    };
    var idleErrorHandler = function(err) {
        logger.error('idle client error', err);
    };
    sqldb.init(pgConfig, idleErrorHandler, function(err) {
        if (ERR(err)) return;

        updateScore(parseInt(process.argv[2]), null, (err) => {
            if (ERR(err)) return;
            sqldb.close(function() {});
        });
    });
}

module.exports = {
    updateScore,
};

/*
** Code used to copy the example XML into a JS object. Included here for
** reference but not needed to be run each time.

// https://www.imsglobal.org/specs/ltiomv1p0/specification

const exampleXMLRequest = `
<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>999999123</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>3124567</sourcedId>
        </sourcedGUID>
        <result>
          <resultScore>
            <language>en</language>
            <textString>0.92</textString>
          </resultScore>
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>
`;

parser.parseString(exampleXMLRequest, (err, result) => {
    if (ERR(err)) return;
    console.log(util.inspect(result, false, null));
});
*/
