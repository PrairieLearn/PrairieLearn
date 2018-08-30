const ERR = require('async-stacktrace');
const request = require('request');
const xml2js = require('xml2js');
//const util = require('util');
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

//    console.log(util.inspect(exampleRequest, false, null));
//    console.log(util.inspect(Obj, false, null));

    var xml = builder.buildObject(Obj);
//    console.log(xml);
    return xml;
}

var updateScore = function(ai_id, callback) {

    sqldb.queryZeroOrOneRow(sql.get_score, {ai_id: ai_id}, (err, result) => {
        if (ERR(err)) return;
        if (result.rowCount == 0) {
//            logger.info(`No outcome to update for AI ${ai_id}`);
            return callback(null);
        }

        var info = result.rows[0];
        //console.log(info);

        var score = info.score_perc / 100;
        if (score > 1) { score = 1.0; }
        if (score < 0) { score = 0.0; }

        request.post(
            {
                url: info.lis_outcome_service_url,
                oauth: {
                    consumer_key: info.consumer_key,
                    consumer_secret: info.secret,
                    body_hash: true,
                },
                body: xmlReplaceResult(info.lis_result_sourcedid, score, info.date),
            }, function(e, r, body) {
            if (ERR(e, callback)) return;
            //console.log(r);
            //console.log(body);

            // Do we even care about checking the result? Does it change anything?
            parser.parseString(body, (err, _result) => {
                if (ERR(err, callback)) return;
                //console.log(util.inspect(result, false, null));
                //console.log(result.imsx_POXEnvelopeResponse.imsx_POXHeader.imsx_POXResponseHeaderInfo.imsx_statusInfo.imsx_codeMajor);
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

        updateScore(parseInt(process.argv[2]), (err) => {
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
