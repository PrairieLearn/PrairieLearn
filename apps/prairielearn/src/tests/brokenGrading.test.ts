import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { withoutLogging } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { SubmissionSchema } from '../lib/db-types.js';
import { selectVariantById, selectVariantsByInstanceQuestion } from '../models/variant.js';

import { type User, parseInstanceQuestionId, saveOrGrade, setUser } from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

const mockStudent: User = {
  authUid: 'student1',
  authName: 'Student User 1',
  authUin: '00000001',
};

async function loadHomeworkQuestionUrl(user: User, linkText: string): Promise<string> {
  setUser(user);
  const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
  const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
  const $courseInstancePage = cheerio.load(courseInstanceBody);
  const homeworkUrl =
    siteUrl + $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
  const homeworkBody = await (await fetch(homeworkUrl)).text();
  const $homeworkPage = cheerio.load(homeworkBody);
  const questionUrl = siteUrl + $homeworkPage(`a:contains("${linkText}")`).attr('href');
  return questionUrl;
}

describe('Broken grading marks variant as broken', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);
  afterAll(() => setUser(defaultUser));

  describe('when grade() throws a fatal error', () => {
    let iqUrl: string;
    let instanceQuestionId: string;
    let variantId: string;

    it('should load the brokenGrading question page', async () => {
      iqUrl = await loadHomeworkQuestionUrl(mockStudent, 'Broken grading function');
      const res = await fetch(iqUrl);
      assert.equal(res.ok, true);
      instanceQuestionId = parseInstanceQuestionId(iqUrl).toString();
    });

    it('should have a non-broken variant before grading', async () => {
      const variants = await selectVariantsByInstanceQuestion({
        instance_question_id: instanceQuestionId,
      });
      assert.lengthOf(variants, 1);
      variantId = variants[0].id;
      assert.isNull(variants[0].broken_at);
      assert.isFalse(variants[0].broken);
    });

    it('should submit and grade', async () => {
      const res = await withoutLogging(() => saveOrGrade(iqUrl, { x: '3' }, 'grade'));
      assert.equal(res.status, 200);
    });

    it('should mark the variant as broken', async () => {
      const variant = await selectVariantById({ variant_id: variantId });
      assert.isNotNull(variant.broken_at);
      assert.isTrue(variant.broken);
    });

    it('should mark the submission as broken', async () => {
      const broken = await sqldb.queryRow(
        sql.get_last_submission_by_instance_question,
        { instance_question_id: instanceQuestionId },
        SubmissionSchema.shape.broken,
      );
      assert.isTrue(broken);
    });

    it('should show the "Try a new variant" button for the broken variant', async () => {
      const res = await fetch(`${iqUrl}?variant_id=${variantId}`);
      const $ = cheerio.load(await res.text());
      assert.lengthOf($('button[value="grade"]'), 0, 'grade button should be hidden');
      assert.lengthOf($('button[value="save"]'), 0, 'save button should be hidden');
      assert.include($.text(), 'Try a new variant');
    });

    it('should generate a new variant when visiting without variant_id', async () => {
      // Visiting the instance question URL without a variant_id triggers ensureVariant(),
      // which skips the broken variant and generates a new one.
      const res = await fetch(iqUrl);
      assert.equal(res.ok, true);

      const variants = await selectVariantsByInstanceQuestion({
        instance_question_id: instanceQuestionId,
      });
      assert.lengthOf(variants, 2);
      const newVariant = variants[variants.length - 1];
      assert.notEqual(newVariant.id, variantId, 'should have generated a new variant');
      assert.isNull(newVariant.broken_at, 'new variant should not be broken');
    });
  });
});
