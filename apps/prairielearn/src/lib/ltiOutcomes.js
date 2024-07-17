// @ts-check
import * as crypto from 'node:crypto';

import _ from 'lodash';
import fetch from 'node-fetch';
import oauthSignature from 'oauth-signature';
import { v4 as uuid } from 'uuid';
import * as xml2js from 'xml2js';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);
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

  const body = xmlReplaceResult(info.lis_result_sourcedid, score, info.date.toString());

  // Compute the SHA-1 hash of the body.
  const shasum = crypto.createHash('sha1');
  shasum.update(body || '');
  const sha1 = shasum.digest('hex');

  const oauthParams = {
    oauth_consumer_key: info.consumer_key,
    oauth_version: '1.0',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: uuid().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_body_hash: Buffer.from(sha1, 'hex').toString('base64'),
  };

  oauthParams.oauth_signature = oauthSignature.generate(
    'POST',
    info.lis_outcome_service_url,
    oauthParams,
    info.secret,
    undefined,
    { encodeSignature: false },
  );

  const rfc = new oauthSignature.Rfc3986();
  const stringifiedParameters = Object.entries(oauthParams)
    .map(([key, value]) => {
      return `${key}="${rfc.encode(value)}"`;
    })
    .join(',');

  const res = await fetch(info.lis_outcome_service_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      Authorization: `OAuth ${stringifiedParameters}`,
    },
    body,
  });

  // Inspect the XML result, log the action
  const result = await parser.parseStringPromise(await res.text());
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
  } else {
    logger.info(
      `ltiOutcomes.updateScore() ai_id=${assessment_instance_id} score=${score} did not return success, debugging follows:`,
    );
    logger.info('oauthParams:', oauthParams);
    logger.info('body:', body);
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
