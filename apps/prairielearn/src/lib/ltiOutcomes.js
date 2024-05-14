// @ts-check
import request from 'request';
import * as xml2js from 'xml2js';
import _ from 'lodash';
import debugfn from 'debug';

import * as sqldb from '@prairielearn/postgres';
import { logger } from '@prairielearn/logger';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:ltiOutcomes');
const parser = new xml2js.Parser({ explicitArray: false });
const builder = new xml2js.Builder();

const exampleRequest = {
  imsx_POXEnvelopeRequest: {
    $: { xmlns: 'http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0' },
    imsx_POXHeader: {
      imsx_POXRequestHeaderInfo: {
        imsx_version: 'V1.0',
        imsx_messageIdentifier: '999999123',
      },
    },
    imsx_POXBody: {
      replaceResultRequest: {
        resultRecord: {
          sourcedGUID: { sourcedId: '3124567' },
          result: { resultScore: { language: 'en', textString: '0.92' } },
        },
      },
    },
  },
};
function xmlReplaceResult(sourcedId, score, identifier) {
  const Obj = _.clone(exampleRequest);

  Obj.imsx_POXEnvelopeRequest.imsx_POXHeader.imsx_POXRequestHeaderInfo.imsx_messageIdentifier =
    identifier;
  Obj.imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord.sourcedGUID.sourcedId =
    sourcedId;
  Obj.imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord.result.resultScore.textString =
    score;

  const xml = builder.buildObject(Obj);
  return xml;
}

/**
 * @param {import('request').CoreOptions & import('request').RequiredUriUrl} options
 * @returns {Promise<{ response: import('request').Response, body: any }>}
 */
async function requestPost(options) {
  return new Promise((resolve, reject) => {
    request.post(options, (err, response, body) => {
      if (err) {
        reject(err);
      } else {
        resolve({ response, body });
      }
    });
  });
}

/**
 * Check if LTI needs updating for this assessment.
 *
 * @param {string} assessment_instance_id - The assessment instance ID
 */
export async function updateScore(assessment_instance_id) {
  if (assessment_instance_id == null) return;

  const scoreResult = await sqldb.queryZeroOrOneRowAsync(sql.get_score, {
    ai_id: assessment_instance_id,
  });
  if (scoreResult.rowCount === 0) return null;

  const info = scoreResult.rows[0];

  let score = info.score_perc / 100;
  if (score > 1) {
    score = 1.0;
  }
  if (score < 0) {
    score = 0.0;
  }

  /** @type {import('request').CoreOptions & import('request').RequiredUriUrl} */
  const post_params = {
    url: info.lis_outcome_service_url,
    oauth: {
      consumer_key: info.consumer_key,
      consumer_secret: info.secret,
      body_hash: true,
    },
    headers: {
      'Content-type': 'application/xml',
    },
    body: xmlReplaceResult(info.lis_result_sourcedid, score, info.date.toString()),
  };

  debug(post_params);
  const { response: httpResponse, body } = await requestPost(post_params);

  debug(httpResponse);
  debug(body);
  // Inspect the XML result, log the action
  const result = await parser.parseStringPromise(body);
  const imsx_codeMajor = _.get(
    result,
    [
      'imsx_POXEnvelopeResponse',
      'imsx_POXHeader',
      'imsx_POXResponseHeaderInfo',
      'imsx_statusInfo',
      'imsx_codeMajor',
    ],
    null,
  );
  if (imsx_codeMajor === 'success') {
    logger.info(
      `ltiOutcomes.updateScore() ai_id=${assessment_instance_id} score=${score} returned ${result.imsx_POXEnvelopeResponse.imsx_POXHeader.imsx_POXResponseHeaderInfo.imsx_statusInfo.imsx_codeMajor}`,
    );
    debug(
      `ltiOutcomes.updateScore() ai_id=${assessment_instance_id} score=${score} returned ${result.imsx_POXEnvelopeResponse.imsx_POXHeader.imsx_POXResponseHeaderInfo.imsx_statusInfo.imsx_codeMajor}`,
    );
  } else {
    logger.info(
      `ltiOutcomes.updateScore() ai_id=${assessment_instance_id} score=${score} did not return success, debugging follows:`,
    );
    logger.info('post_params:', post_params);
    logger.info('body:', body);
    debug(
      `ltiOutcomes.updateScore() ai_id=${assessment_instance_id} score=${score} did not return success, debugging follows:`,
    );
    debug('post_params', post_params);
    debug('body', body);
  }
}

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
