import type * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { type Config, config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectOrInsertUserByUid } from '../models/user.js';
import type { AssessmentJsonInput } from '../schemas/index.js';

import * as helperClient from './helperClient.js';
import { withPTReservation } from './helperExam.js';
import * as helperServer from './helperServer.js';
import {
  COURSE_INSTANCE_ID as COURSE_INSTANCE_TID,
  getCourseData,
  writeCourseToTempDirectory,
} from './sync/util.js';

interface LegacyAssessmentFixture {
  tid: string;
  title: string;
  number: string;
  allowAccess: NonNullable<AssessmentJsonInput['allowAccess']>;
}

const legacyPrairieTestExamUuid = 'a817e4b9-b1b1-40b6-b076-c3a752dd8e72';

const assessmentFixtures = {
  open: {
    tid: 'legacy-open',
    title: 'Legacy open assessment',
    number: '1',
    allowAccess: [
      {
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        credit: 100,
      },
    ],
  },
  future: {
    tid: 'legacy-future',
    title: 'Legacy future assessment',
    number: '2',
    allowAccess: [
      {
        startDate: '2999-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        credit: 100,
      },
    ],
  },
  inactive: {
    tid: 'legacy-inactive',
    title: 'Legacy inactive assessment',
    number: '3',
    allowAccess: [
      {
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        active: false,
        credit: 0,
      },
    ],
  },
  matchingUid: {
    tid: 'legacy-matching-uid',
    title: 'Legacy matching UID assessment',
    number: '4',
    allowAccess: [
      {
        uids: ['student@example.com'],
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        credit: 100,
      },
    ],
  },
  password: {
    tid: 'legacy-password',
    title: 'Legacy password assessment',
    number: '5',
    allowAccess: [
      {
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        password: 'legacy-password',
        credit: 100,
      },
    ],
  },
  prairieTest: {
    tid: 'legacy-prairietest',
    title: 'Legacy PrairieTest assessment',
    number: '6',
    allowAccess: [
      {
        mode: 'Exam',
        examUuid: legacyPrairieTestExamUuid,
        startDate: '2000-01-01T00:00:00',
        endDate: '3000-01-01T00:00:00',
        credit: 100,
      },
    ],
  },
} satisfies Record<string, LegacyAssessmentFixture>;

type AssessmentKey = keyof typeof assessmentFixtures;
type AssessmentUrls = Record<AssessmentKey, string>;

function assessmentEntries() {
  return Object.entries(assessmentFixtures) as [AssessmentKey, LegacyAssessmentFixture][];
}

function makeLegacyAssessment({
  number,
  title,
  allowAccess,
}: {
  number: string;
  title: string;
  allowAccess: NonNullable<AssessmentJsonInput['allowAccess']>;
}): AssessmentJsonInput {
  return {
    uuid: crypto.randomUUID(),
    type: 'Exam',
    title,
    set: 'TEST',
    number,
    zones: [],
    allowAccess,
  };
}

function assessmentRows($: cheerio.CheerioAPI, title: string) {
  return $('table[aria-label="Assessments"] tbody tr').filter(
    (_, elem) => $(elem).children('td').eq(1).text().trim() === title,
  );
}

function assertLinkedAssessment($: cheerio.CheerioAPI, title: string) {
  const row = assessmentRows($, title);
  assert.lengthOf(row, 1);
  assert.lengthOf(
    row
      .children('td')
      .eq(1)
      .find('a')
      .filter((_, elem) => $(elem).text().trim() === title),
    1,
  );
}

function assertPlainAssessment($: cheerio.CheerioAPI, title: string) {
  const row = assessmentRows($, title);
  assert.lengthOf(row, 1);
  assert.lengthOf(
    row
      .children('td')
      .eq(1)
      .find('a')
      .filter((_, elem) => $(elem).text().trim() === title),
    0,
  );
}

function assertNoAssessment($: cheerio.CheerioAPI, title: string) {
  assert.lengthOf(assessmentRows($, title), 0);
}

async function buildAssessmentUrls(courseInstanceUrl: string): Promise<AssessmentUrls> {
  return Object.fromEntries(
    await Promise.all(
      assessmentEntries().map(async ([key, { tid }]) => {
        const assessment = await selectAssessmentByTid({
          course_instance_id: '1',
          tid,
        });
        return [key, `${courseInstanceUrl}/assessment/${assessment.id}/`];
      }),
    ),
  ) as AssessmentUrls;
}

describe(
  'Legacy allowAccess on student assessment pages',
  { timeout: 60_000, concurrent: false },
  () => {
    const siteUrl = `http://localhost:${config.serverPort}`;
    const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;
    const assessmentsUrl = `${courseInstanceUrl}/assessments`;
    const storedConfig: Partial<Config> = {};
    const studentHeaders = {
      cookie: 'pl_test_user=test_student; pl_test_date=2024-06-01T00:00:00Z',
    };
    const examStudentHeaders = {
      cookie: `${studentHeaders.cookie}; pl_test_mode=Exam`,
    };
    const otherStudentHeaders = {
      cookie: 'pl_test_date=2024-06-01T00:00:00Z',
    };
    let assessmentUrls: AssessmentUrls;

    beforeAll(async () => {
      storedConfig.authUid = config.authUid;
      storedConfig.authName = config.authName;
      storedConfig.authUin = config.authUin;
      storedConfig.checkAccessRulesExamUuid = config.checkAccessRulesExamUuid;
      config.authUid = 'other-student@example.com';
      config.authName = 'Other Student';
      config.authUin = '000000002';
      config.checkAccessRulesExamUuid = false;

      const course = getCourseData();
      const courseInstance = course.courseInstances[COURSE_INSTANCE_TID];
      courseInstance.assessments = Object.fromEntries(
        assessmentEntries().map(([, fixture]) => [fixture.tid, makeLegacyAssessment(fixture)]),
      );

      const courseDir = await writeCourseToTempDirectory(course);
      await helperServer.before(courseDir)();
      assessmentUrls = await buildAssessmentUrls(courseInstanceUrl);
    });

    afterAll(async () => {
      await helperServer.after();
      Object.assign(config, storedConfig);
    });

    test('syncs the fixture assessments as legacy access-control assessments', async () => {
      await Promise.all(
        assessmentEntries().map(async ([, { tid }]) => {
          const assessment = await selectAssessmentByTid({
            course_instance_id: '1',
            tid,
          });

          assert.isFalse(assessment.modern_access_control);
        }),
      );
    });

    test('applies legacy rules on the student assessments page', async () => {
      const response = await helperClient.fetchCheerio(assessmentsUrl, {
        headers: studentHeaders,
      });

      assert.isTrue(response.ok);
      assertLinkedAssessment(response.$, assessmentFixtures.open.title);
      assertLinkedAssessment(response.$, assessmentFixtures.matchingUid.title);
      assertLinkedAssessment(response.$, assessmentFixtures.password.title);
      assertPlainAssessment(response.$, assessmentFixtures.inactive.title);
      assertNoAssessment(response.$, assessmentFixtures.future.title);
      assertNoAssessment(response.$, assessmentFixtures.prairieTest.title);
    });

    test('hides a UID-gated legacy assessment from other students', async () => {
      const response = await helperClient.fetchCheerio(assessmentsUrl, {
        headers: otherStudentHeaders,
      });

      assert.isTrue(response.ok);
      assertNoAssessment(response.$, assessmentFixtures.matchingUid.title);
    });

    test('allows direct access when a legacy rule authorizes the student', async () => {
      for (const key of ['open', 'matchingUid'] as const) {
        const response = await helperClient.fetchCheerio(assessmentUrls[key], {
          headers: studentHeaders,
        });

        assert.isTrue(response.ok);
        assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');
      }
    });

    test('blocks direct access when legacy date, UID, or active checks fail', async () => {
      for (const { key, headers } of [
        { key: 'future', headers: studentHeaders },
        { key: 'matchingUid', headers: otherStudentHeaders },
      ] satisfies { key: AssessmentKey; headers: typeof studentHeaders }[]) {
        const response = await helperClient.fetchCheerio(assessmentUrls[key], { headers });
        assert.equal(response.status, 403);
      }

      const inactiveResponse = await helperClient.fetchCheerio(assessmentUrls.inactive, {
        headers: studentHeaders,
      });
      assert.equal(inactiveResponse.status, 403);
      assert.lengthOf(inactiveResponse.$('[data-testid="assessment-closed-message"]'), 1);
    });

    test('requires the legacy assessment password before direct access', async () => {
      const response = await helperClient.fetchCheerio(assessmentUrls.password, {
        headers: studentHeaders,
        redirect: 'manual',
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/pl/password');
    });

    test('requires a matching PrairieTest reservation in Exam mode', async () => {
      const noReservationAssessmentsResponse = await helperClient.fetchCheerio(assessmentsUrl, {
        headers: examStudentHeaders,
      });
      assert.isTrue(noReservationAssessmentsResponse.ok);
      assertNoAssessment(noReservationAssessmentsResponse.$, assessmentFixtures.open.title);
      assertNoAssessment(noReservationAssessmentsResponse.$, assessmentFixtures.prairieTest.title);

      const noReservationAssessmentResponse = await helperClient.fetchCheerio(
        assessmentUrls.prairieTest,
        {
          headers: examStudentHeaders,
        },
      );
      assert.equal(noReservationAssessmentResponse.status, 403);

      const student = await selectOrInsertUserByUid('student@example.com');
      await withPTReservation(
        {
          userId: student.id,
          accessStart: new Date('2024-05-31T00:00:00Z'),
          accessEnd: new Date('2024-06-02T00:00:00Z'),
          examUuid: legacyPrairieTestExamUuid,
        },
        async () => {
          const assessmentsResponse = await helperClient.fetchCheerio(assessmentsUrl, {
            headers: examStudentHeaders,
          });
          assert.isTrue(assessmentsResponse.ok);
          assertNoAssessment(assessmentsResponse.$, assessmentFixtures.open.title);
          assertLinkedAssessment(assessmentsResponse.$, assessmentFixtures.prairieTest.title);

          const publicAssessmentResponse = await helperClient.fetchCheerio(assessmentUrls.open, {
            headers: examStudentHeaders,
          });
          assert.equal(publicAssessmentResponse.status, 403);

          const prairieTestAssessmentResponse = await helperClient.fetchCheerio(
            assessmentUrls.prairieTest,
            {
              headers: examStudentHeaders,
            },
          );
          assert.isTrue(prairieTestAssessmentResponse.ok);
          assert.equal(
            prairieTestAssessmentResponse.$('#start-assessment').text().trim(),
            'Start assessment',
          );
        },
      );
    });
  },
);
