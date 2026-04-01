import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  getAssessmentInstancesUrl,
  getAssessmentQuestionTrpcUrl,
  getInstanceQuestionTrpcUrl,
  getManualGradingInstanceQuestionUrl,
  getManualGradingUrl,
} from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { InstanceQuestionSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { createAssessmentQuestionTrpcClient } from '../trpc/assessmentQuestion/client.js';
import { createInstanceQuestionTrpcClient } from '../trpc/instanceQuestion/client.js';

import {
  type User,
  assertAlert,
  parseInstanceQuestionId,
  saveOrGrade,
  setUser,
} from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const defaultUser: User = {
  authUid: config.authUid,
  authName: config.authName,
  authUin: config.authUin,
};

type MockUser = User & {
  id?: string;
  authUid: string;
};

interface RubricItem {
  id?: string;
  points: number;
  description: string;
  explanation?: string;
  grader_note?: string;
  always_show_to_students: boolean;
  description_render?: string;
  explanation_render?: string;
  grader_note_render?: string;
}

const mockStudents: MockUser[] = [
  { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
  { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
  { authUid: 'student3', authName: 'Student User 3', authUin: '00000003' },
  { authUid: 'student4', authName: 'Student User 4', authUin: '00000004' },
];

const mockStaff: MockUser[] = [
  { authUid: 'staff1', authName: 'Staff User 1', authUin: 'STAFF001' },
  { authUid: 'staff2', authName: 'Staff User 2', authUin: 'STAFF002' },
  { authUid: 'staff3', authName: 'Staff User 3', authUin: 'STAFF003' },
  { authUid: 'staff4', authName: 'Staff User 4', authUin: 'STAFF004' },
];

const assessmentTitle = 'Homework for Internal, External, Manual grading methods';
const manualGradingQuestionTitle = 'Manual Grading: Fibonacci function, file upload';

/**
 * @param user student or instructor user to load page by
 * @returns "Homework for Internal, External, Manual grading methods" page text
 */
async function loadHomeworkPage(user: User): Promise<string> {
  setUser(user);
  const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
  const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
  const $courseInstancePage = cheerio.load(courseInstanceBody);
  const hm9InternalExternalManualUrl =
    siteUrl + $courseInstancePage(`a:contains("${assessmentTitle}")`).attr('href');
  const res = await fetch(hm9InternalExternalManualUrl);
  assert.equal(res.ok, true);
  return res.text();
}

/**
 * @param user student or instructor user to load page by
 * @returns student URL for manual grading question
 */
async function loadHomeworkQuestionUrl(user: User): Promise<string> {
  const hm1Body = await loadHomeworkPage(user);
  const $hm1Body = cheerio.load(hm1Body);
  return siteUrl + $hm1Body(`a:contains("${manualGradingQuestionTitle}")`).attr('href');
}

/**
 * Gets the score text for the first submission panel on the page.
 */
function getLatestSubmissionStatus($: cheerio.CheerioAPI): string {
  return $('[data-testid="submission-status"] .badge').first().text();
}

let iqUrl: string, iqId: string | number;
let assessmentId: string;
let assessmentQuestionId: string;
let instancesAssessmentUrl: string;
let manualGradingAssessmentUrl: string;
let manualGradingAssessmentQuestionUrl: string;
let manualGradingIQUrl: string;
let manualGradingNextUngradedUrl: string;
let $manualGradingPage: cheerio.CheerioAPI;
let score_percent: number, score_points: number, adjust_points: number | null;
let feedback_note: string;
let rubric_items: RubricItem[] | undefined;
let selected_rubric_items: number[] | undefined;

function getAuthnUserId(): string {
  const staff = mockStaff.find((s) => s.authUid === config.authUid);
  return staff?.id ?? '1';
}

function createIQClient() {
  const csrfToken = generatePrefixCsrfToken(
    {
      url: getInstanceQuestionTrpcUrl({
        courseInstanceId: '1',
        instanceQuestionId: String(iqId),
      }),
      authn_user_id: getAuthnUserId(),
    },
    config.secretKey,
  );
  return createInstanceQuestionTrpcClient({
    csrfToken,
    courseInstanceId: '1',
    instanceQuestionId: String(iqId),
    urlBase: siteUrl,
  });
}

function createAQClient() {
  const csrfToken = generatePrefixCsrfToken(
    {
      url: getAssessmentQuestionTrpcUrl({
        courseInstanceId: '1',
        assessmentId,
        assessmentQuestionId,
      }),
      authn_user_id: getAuthnUserId(),
    },
    config.secretKey,
  );
  return createAssessmentQuestionTrpcClient({
    csrfToken,
    courseInstanceId: '1',
    assessmentId,
    assessmentQuestionId,
    urlBase: siteUrl,
  });
}

async function submitGradeForm(
  method: 'rubric' | 'points' | 'percentage' = 'rubric',
): Promise<void> {
  const client = createIQClient();
  const rubricData = await client.manualGrading.rubricData.query();
  const gradingContext = await client.manualGrading.gradingContext.query();

  const usePercentage = method === 'percentage';

  await client.manualGrading.addManualGrade.mutate({
    action: 'add_manual_grade',
    submissionId: gradingContext.submissionId,
    modifiedAt: new Date(rubricData.modifiedAt),
    usePercentage,
    scoreManualPoints: usePercentage ? null : score_points,
    scoreManualPercent: usePercentage ? score_percent : null,
    scoreAutoPoints: null,
    scoreAutoPercent: null,
    scoreManualAdjustPoints: adjust_points,
    selectedRubricItemIds: (selected_rubric_items || []).map((index) => {
      const id = rubric_items?.[index].id;
      assert(id);
      return id;
    }),
    submissionNote: feedback_note,
    issueIdsToClose: [],
    skipGradedSubmissions: true,
    showSubmissionsAssignedToMeOnly: true,
  });
}

async function loadInstances() {
  const client = createAQClient();
  return await client.manualGrading.instances.query();
}

function checkGradingResults(assigned_grader: MockUser, grader: MockUser): void {
  test.sequential('manual grading page for instance question lists updated values', async () => {
    setUser(defaultUser);
    const client = createIQClient();
    const gradingContext = await client.manualGrading.gradingContext.query();
    assert.closeTo(gradingContext.manualPoints, score_points, 0.01);
    assert.equal(gradingContext.submissionFeedback, feedback_note);
  });

  test.sequential('manual grading page for assessment question lists updated values', async () => {
    setUser(defaultUser);
    const instanceList = await loadInstances();
    assert.lengthOf(instanceList, 1);
    assert.equal(instanceList[0].instance_question.id, iqId);
    assert.isNotOk(instanceList[0].instance_question.requires_manual_grading);
    assert.equal(instanceList[0].instance_question.assigned_grader, assigned_grader.id);
    assert.equal(instanceList[0].assigned_grader_name, assigned_grader.authName);
    assert.equal(instanceList[0].instance_question.last_grader, grader.id);
    assert.equal(instanceList[0].last_grader_name, grader.authName);
    assert.closeTo(instanceList[0].instance_question.score_perc!, score_percent, 0.01);
    assert.closeTo(instanceList[0].instance_question.points!, score_points, 0.01);
    assert.closeTo(instanceList[0].instance_question.manual_points!, score_points, 0.01);
    assert.closeTo(instanceList[0].instance_question.auto_points!, 0, 0.01);
  });

  test.sequential(
    'manual grading page for assessment does NOT show graded instance for grading',
    async () => {
      setUser(mockStaff[0]);
      const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
      $manualGradingPage = cheerio.load(manualGradingPage);
      const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
      assert.equal(row.length, 1);
      const count = row.find('td[data-testid="iq-to-grade-count"]').text().replaceAll(/\s/g, '');
      assert.equal(count, '0/1');
      const nextButton = row.find('.btn:contains("next submission")');
      assert.equal(nextButton.length, 0);
    },
  );

  test.sequential('next ungraded button should point to general page after grading', async () => {
    setUser(mockStaff[0]);
    let nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
    assert.equal(nextUngraded.status, 302);
    assert.equal(
      nextUngraded.headers.get('location'),
      new URL(manualGradingAssessmentQuestionUrl).pathname,
    );
    setUser(mockStaff[1]);
    nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
    assert.equal(nextUngraded.status, 302);
    assert.equal(
      nextUngraded.headers.get('location'),
      new URL(manualGradingAssessmentQuestionUrl).pathname,
    );
  });

  test.sequential('student view should have the new score/feedback/rubric', async () => {
    iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
    const questionsPage = await (await fetch(iqUrl)).text();
    const $questionsPage = cheerio.load(questionsPage);
    const feedbackBlock = $questionsPage('[data-testid="submission-with-feedback"]').first();

    assert.equal(
      getLatestSubmissionStatus($questionsPage),
      `manual grading: ${Math.floor(score_percent)}%`,
    );
    assert.equal(
      $questionsPage(
        '#question-score-panel tr:contains("Total points") [data-testid="awarded-points"]',
      )
        .first()
        .text()
        .trim(),
      `${score_points}`,
    );
    assert.equal(
      feedbackBlock.find('[data-testid="feedback-body"]').first().text().trim(),
      feedback_note,
    );

    if (!rubric_items) {
      const container = feedbackBlock.find('[data-testid^="rubric-item-container-"]');
      assert.equal(container.length, 0);
    } else {
      rubric_items.forEach((item, index) => {
        assert.isDefined(selected_rubric_items);
        const container = feedbackBlock.find(`[data-testid="rubric-item-container-${item.id}"]`);
        if (item.always_show_to_students || selected_rubric_items.includes(index)) {
          assert.equal(container.length, 1);
          assert.equal(
            container.find('input[type="checkbox"]').is(':checked'),
            selected_rubric_items.includes(index),
          );
          assert.equal(
            container.find('[data-testid="rubric-item-points"]').text().trim(),
            `[${item.points >= 0 ? '+' : ''}${item.points}]`,
          );
          assert.equal(
            container.find('[data-testid="rubric-item-description"]').html()?.trim(),
            item.description_render ?? item.description,
          );
          if (item.explanation) {
            assert.equal(
              container
                .find('[data-testid="rubric-item-explanation"]')
                .attr('data-bs-content')
                ?.trim(),
              item.explanation_render ?? `<p>${item.explanation}</p>`,
            );
          } else {
            assert.equal(container.find('[data-testid="rubric-item-explanation"]').length, 0);
          }
        } else {
          assert.equal(container.length, 0);
        }
      });
    }
    if (adjust_points) {
      assert.equal(
        feedbackBlock.find('[data-testid="rubric-adjust-points"]').text().trim(),
        `[${adjust_points >= 0 ? '+' : ''}${adjust_points}]`,
      );
    } else {
      assert.equal(feedbackBlock.find('[data-testid="rubric-adjust-points"]').length, 0);
    }
  });
}

function checkSettingsResults(
  starting_points: number,
  min_points: number,
  max_extra_points: number,
  grader_guidelines: string,
): void {
  test.sequential('rubric settings should update with new values', async () => {
    const client = createIQClient();
    const data = await client.manualGrading.rubricData.query();
    const rubric = data.rubricData?.rubric;
    assert.isDefined(rubric);

    assert.equal(rubric.starting_points, starting_points);
    assert.equal(rubric.max_extra_points, max_extra_points);
    assert.equal(rubric.min_points, min_points);
    assert.equal(rubric.grader_guidelines ?? '', grader_guidelines);

    const serverItems = data.rubricData?.rubric_items ?? [];
    assert.isDefined(rubric_items);
    assert.equal(serverItems.length, rubric_items.length);
    rubric_items.forEach((item, index) => {
      const serverItem = serverItems[index];
      if (!item.id) {
        item.id = serverItem.rubric_item.id;
      }
      assert.equal(serverItem.rubric_item.id, item.id);
      assert.equal(serverItem.rubric_item.points, item.points);
      assert.equal(serverItem.rubric_item.description, item.description);
      assert.equal(serverItem.rubric_item.explanation ?? '', item.explanation ?? '');
      assert.equal(serverItem.rubric_item.grader_note ?? '', item.grader_note ?? '');
      assert.equal(serverItem.rubric_item.always_show_to_students, item.always_show_to_students);
    });
  });

  test.sequential('grading panel should have proper values for rubric', async () => {
    const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
    const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
    const form = $manualGradingIQPage('[data-testid="manual-grading-form"]');

    assert.isDefined(rubric_items);
    rubric_items.forEach((item) => {
      const checkbox = form.find(`input[name="rubric_item_selected_manual"][value="${item.id}"]`);
      assert.equal(checkbox.length, 1);
      const container = checkbox.closest('label');
      assert.equal(container.length, 1);
      assert.equal(
        container.find('[data-testid="rubric-item-points"]').text().trim(),
        `[${item.points >= 0 ? '+' : ''}${item.points}]`,
      );
      assert.equal(
        container.find('[data-testid="rubric-item-description"]').html()?.trim(),
        item.description_render ?? item.description,
      );
      assert.equal(
        container.find('[data-testid="rubric-item-explanation"]').html()?.trim(),
        item.explanation_render ?? (item.explanation ? `<p>${item.explanation}</p>` : ''),
      );
      assert.equal(
        container.find('[data-testid="rubric-item-grader-note"]').html()?.trim(),
        item.grader_note_render ?? (item.grader_note ? `<p>${item.grader_note}</p>` : ''),
      );
    });
  });
}

async function submitRubricSettings({
  replace_auto_points,
  starting_points,
  min_points,
  max_extra_points,
  rubric_items: items,
  grader_guidelines,
}: {
  replace_auto_points: boolean;
  starting_points: number;
  min_points: number;
  max_extra_points: number;
  rubric_items: RubricItem[];
  grader_guidelines?: string;
}) {
  const client = createIQClient();
  await client.manualGrading.modifyRubricSettings.mutate({
    useRubric: true,
    replaceAutoPoints: replace_auto_points,
    startingPoints: starting_points,
    minPoints: min_points,
    maxExtraPoints: max_extra_points,
    graderGuidelines: grader_guidelines || '',
    tagForManualGrading: false,
    rubricItems: items.map((item, idx) => ({
      id: item.id,
      order: idx,
      points: item.points,
      description: item.description,
      explanation: item.explanation,
      graderNote: item.grader_note,
      alwaysShowToStudents: item.always_show_to_students,
    })),
  });
}

describe('Manual Grading', { timeout: 80_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    assessmentId = assessment.id;
    manualGradingAssessmentUrl =
      siteUrl + getManualGradingUrl({ courseInstanceId: '1', assessmentId });
    instancesAssessmentUrl =
      siteUrl + getAssessmentInstancesUrl({ courseInstanceId: '1', assessmentId });
  });

  beforeAll(async () => {
    await Promise.all(
      mockStaff.map(async (staff) => {
        const { id } = await insertCoursePermissionsByUserUid({
          course_id: '1',
          uid: staff.authUid,
          course_role: 'None',
          authn_user_id: '1',
        });
        staff.id = id;
        await insertCourseInstancePermissions({
          course_id: '1',
          user_id: staff.id,
          course_instance_id: '1',
          course_instance_role: 'Student Data Editor',
          authn_user_id: '1',
        });
      }),
    );
  });

  afterAll(() => setUser(defaultUser));

  describe('Submit and grade a manually graded question', () => {
    describe('Student submission tags question for grading', () => {
      test.sequential('load page as student', async () => {
        iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
        iqId = parseInstanceQuestionId(iqUrl);
        manualGradingIQUrl =
          siteUrl +
          getManualGradingInstanceQuestionUrl({
            courseInstanceId: '1',
            assessmentId,
            instanceQuestionId: String(iqId),
          });

        const instanceQuestion = await sqldb.queryRow(
          sql.get_instance_question,
          { iqId },
          InstanceQuestionSchema,
        );
        assert.equal(instanceQuestion.requires_manual_grading, false);
      });

      test.sequential('submit an answer to the question', async () => {
        const gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
          { name: 'fib.py', contents: Buffer.from('solution').toString('base64') },
        ]);
        const questionsPage = await gradeRes.text();
        const $questionsPage = cheerio.load(questionsPage);

        assert.equal(gradeRes.status, 200);
        assert.equal(
          getLatestSubmissionStatus($questionsPage),
          'manual grading: waiting for grading',
        );
      });

      test.sequential('should tag question as requiring grading', async () => {
        const instanceQuestion = await sqldb.queryRow(
          sql.get_instance_question,
          { iqId },
          InstanceQuestionSchema,
        );
        assert.equal(instanceQuestion.requires_manual_grading, true);
      });
    });

    describe('Manual grading behavior while instance is open', () => {
      test.sequential('manual grading page should warn about an open instance', async () => {
        setUser(defaultUser);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        assertAlert($manualGradingPage, 'has one open instance');
      });

      test.sequential('manual grading page should list one question requiring grading', () => {
        const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
        assert.equal(row.length, 1);
        const count = row.find('td[data-testid="iq-to-grade-count"]').text().replaceAll(/\s/g, '');
        assert.equal(count, '1/1');
        const nextButton = row.find('.btn:contains("next submission")');
        assert.equal(nextButton.length, 1);

        // Extract URLs and IDs from the HTML
        const questionLink = row.find('td:first-child a').attr('href');
        assert(questionLink);
        manualGradingAssessmentQuestionUrl = siteUrl + questionLink;
        const aqMatch = questionLink.match(/assessment_question\/(\d+)/);
        assert(aqMatch);
        assessmentQuestionId = aqMatch[1];
        const nextUngradedLink = nextButton.attr('href');
        assert(nextUngradedLink);
        manualGradingNextUngradedUrl = siteUrl + nextUngradedLink;
      });

      test.sequential(
        'manual grading page for assessment question should warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingAQPage = await (
            await fetch(manualGradingAssessmentQuestionUrl)
          ).text();
          const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
          assertAlert($manualGradingAQPage, 'has one open instance');
        },
      );

      test.sequential(
        'manual grading page for assessment question should list one instance',
        async () => {
          setUser(defaultUser);
          const instanceList = await loadInstances();
          assert.lengthOf(instanceList, 1);
          assert.equal(instanceList[0].instance_question.id, iqId);
          assert.isOk(instanceList[0].instance_question.requires_manual_grading);
          assert.isNotOk(instanceList[0].instance_question.assigned_grader);
          assert.isNotOk(instanceList[0].assigned_grader_name);
          assert.isNotOk(instanceList[0].instance_question.last_grader);
          assert.isNotOk(instanceList[0].last_grader_name);
        },
      );

      test.sequential(
        'manual grading page for instance question should warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
          assertAlert($manualGradingIQPage, 'is still open');
        },
      );
    });

    describe('Manual grading behaviour when instance is closed', () => {
      test.sequential('close assessment', async () => {
        setUser(defaultUser);
        const instancesBody = await (await fetch(instancesAssessmentUrl)).text();
        const $instancesBody = cheerio.load(instancesBody);
        const token =
          $instancesBody('#grade-all-form').find('input[name=__csrf_token]').attr('value') || '';
        await fetch(instancesAssessmentUrl, {
          method: 'POST',
          headers: { 'Content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            __action: 'close_all',
            __csrf_token: token,
          }).toString(),
        });
      });

      test.sequential('manual grading page should NOT warn about an open instance', async () => {
        setUser(defaultUser);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        assertAlert($manualGradingPage, 'has one open instance', 0);
      });

      test.sequential(
        'manual grading page for assessment question should NOT warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingAQPage = await (
            await fetch(manualGradingAssessmentQuestionUrl)
          ).text();
          const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
          assertAlert($manualGradingAQPage, 'has one open instance', 0);
        },
      );

      test.sequential(
        'manual grading page for instance question should NOT warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
          assertAlert($manualGradingIQPage, 'is still open', 0);
        },
      );

      test.sequential(
        'next ungraded button should point to existing instance for all graders',
        async () => {
          setUser(defaultUser);
          let nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
          assert.equal(nextUngraded.status, 302);
          assert.equal(nextUngraded.headers.get('location'), new URL(manualGradingIQUrl).pathname);
          setUser(mockStaff[0]);
          nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
          assert.equal(nextUngraded.status, 302);
          assert.equal(nextUngraded.headers.get('location'), new URL(manualGradingIQUrl).pathname);
          setUser(mockStaff[1]);
          nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
          assert.equal(nextUngraded.status, 302);
          assert.equal(nextUngraded.headers.get('location'), new URL(manualGradingIQUrl).pathname);
        },
      );
    });

    describe('Assigning grading to staff members', () => {
      test.sequential('tag question to specific grader', async () => {
        setUser(defaultUser);
        const client = createAQClient();
        await client.manualGrading.setAssignedGrader.mutate({
          assigned_grader: mockStaff[0].id!,
          instance_question_ids: [iqId.toString()],
        });
      });

      test.sequential(
        'manual grading page for assessment question should list tagged grader',
        async () => {
          setUser(defaultUser);
          const instanceList = await loadInstances();
          assert(instanceList);
          assert.lengthOf(instanceList, 1);
          assert.equal(instanceList[0].instance_question.id, iqId);
          assert.isOk(instanceList[0].instance_question.requires_manual_grading);
          assert.equal(instanceList[0].instance_question.assigned_grader, mockStaff[0].id);
          assert.equal(instanceList[0].assigned_grader_name, mockStaff[0].authName);
          assert.isNotOk(instanceList[0].instance_question.last_grader);
          assert.isNotOk(instanceList[0].last_grader_name);
        },
      );

      test.sequential(
        'manual grading page should show next ungraded button for assigned grader',
        async () => {
          setUser(mockStaff[0]);
          const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
          $manualGradingPage = cheerio.load(manualGradingPage);
          const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
          assert.equal(row.length, 1);
          const count = row
            .find('td[data-testid="iq-to-grade-count"]')
            .text()
            .replaceAll(/\s/g, '');
          assert.equal(count, '1/1');
          const nextButton = row.find('.btn:contains("next submission")');
          assert.equal(nextButton.length, 1);
        },
      );

      test.sequential(
        'manual grading page should NOT show next ungraded button for non-assigned grader',
        async () => {
          setUser(mockStaff[1]);
          const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
          $manualGradingPage = cheerio.load(manualGradingPage);
          const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
          assert.equal(row.length, 1);
          const count = row
            .find('td[data-testid="iq-to-grade-count"]')
            .text()
            .replaceAll(/\s/g, '');
          assert.equal(count, '1/1');
          const nextButton = row.find('.btn:contains("next submission")');
          assert.equal(nextButton.length, 0);
        },
      );

      test.sequential(
        'next ungraded button should point to existing instance for assigned grader',
        async () => {
          setUser(mockStaff[0]);
          const nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
          assert.equal(nextUngraded.status, 302);
          assert.equal(nextUngraded.headers.get('location'), new URL(manualGradingIQUrl).pathname);
        },
      );

      test.sequential(
        'next ungraded button should point to general page for non-assigned graders',
        async () => {
          setUser(mockStaff[1]);
          const nextUngraded = await fetch(manualGradingNextUngradedUrl, { redirect: 'manual' });
          assert.equal(nextUngraded.status, 302);
          assert.equal(
            nextUngraded.headers.get('location'),
            new URL(manualGradingAssessmentQuestionUrl).pathname,
          );
        },
      );
    });

    describe('Submit a grade using percentage (whole)', () => {
      test.sequential('submit a grade using percentage', async () => {
        setUser(mockStaff[2]);
        score_percent = 30;
        score_points = (score_percent * 6) / 100;
        feedback_note = 'Test feedback note';
        await submitGradeForm('percentage');
      });

      checkGradingResults(mockStaff[0], mockStaff[2]);
    });

    describe('Submit a grade using percentage (float)', () => {
      test.sequential('submit a grade using percentage', async () => {
        setUser(mockStaff[2]);
        score_percent = 20.5;
        score_points = (score_percent * 6) / 100;
        feedback_note = 'Test feedback note';
        await submitGradeForm('percentage');
      });

      checkGradingResults(mockStaff[0], mockStaff[2]);
    });

    describe('Submit a grade using points (whole)', () => {
      test.sequential('submit a grade using points', async () => {
        setUser(mockStaff[1]);
        score_points = 4;
        score_percent = Math.round((score_points / 6) * 10000) / 100;
        feedback_note = 'Test feedback note updated';
        await submitGradeForm('points');
      });

      checkGradingResults(mockStaff[0], mockStaff[1]);
    });

    describe('Submit a grade using points (float)', () => {
      test.sequential('submit a grade using points', async () => {
        setUser(mockStaff[1]);
        score_points = 4.25;
        score_percent = Math.round((score_points / 6) * 10000) / 100;
        feedback_note = 'Test feedback note updated';
        await submitGradeForm('points');
      });

      checkGradingResults(mockStaff[0], mockStaff[1]);
    });

    describe('Using rubric', () => {
      describe('Positive grading', () => {
        test.sequential('set rubric settings for positive grading should succeed', async () => {
          setUser(mockStaff[0]);
          rubric_items = [
            { points: 6, description: 'First rubric item', always_show_to_students: true },
            {
              points: 3,
              description: 'Second rubric item (partial, with `markdown`)',
              explanation: 'Explanation with **markdown**',
              grader_note: 'Instructions with *markdown*',
              description_render: 'Second rubric item (partial, with <code>markdown</code>)',
              explanation_render: '<p>Explanation with <strong>markdown</strong></p>',
              grader_note_render: '<p>Instructions with <em>markdown</em></p>',
              always_show_to_students: false,
            },
            {
              points: 0.4,
              description: 'Third rubric item (partial, with moustache: {{params.value1}})',
              explanation: 'Explanation with moustache: {{params.value2}}',
              grader_note:
                'Instructions with *markdown* and moustache: {{params.value3}}\n\nAnd more than one line',
              description_render: 'Third rubric item (partial, with moustache: 37)',
              explanation_render: '<p>Explanation with moustache: 43</p>',
              grader_note_render:
                '<p>Instructions with <em>markdown</em> and moustache: 49</p>\n<p>And more than one line</p>',
              always_show_to_students: true,
            },
            {
              points: -1.6,
              description: 'Penalty rubric item (negative points, floating point)',
              always_show_to_students: false,
            },
            {
              points: 0,
              description: 'Rubric item with no value (zero points)',
              always_show_to_students: true,
            },
          ];

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 0,
            min_points: -0.3,
            max_extra_points: 0.3,
            rubric_items,
          });
        });

        checkSettingsResults(0, -0.3, 0.3, '');

        test.sequential('submit a grade using a positive rubric', async () => {
          setUser(mockStaff[0]);
          selected_rubric_items = [0, 2, 3];
          score_points = 4.8;
          score_percent = 80;
          feedback_note = 'Test feedback note updated after rubric';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[0]);
      });

      describe('Changing rubric item points', () => {
        test.sequential('update rubric items should succeed', async () => {
          setUser(mockStaff[0]);
          assert.isDefined(rubric_items);
          rubric_items[2].points = 1;
          score_points = 5.4;
          score_percent = 90;

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 0,
            min_points: -0.5,
            max_extra_points: 0.5,
            rubric_items,
          });
        });

        checkSettingsResults(0, -0.5, 0.5, '');
        checkGradingResults(mockStaff[0], mockStaff[0]);
      });

      describe('Changing rubric grader guidelines', () => {
        const grader_guidelines =
          'Accept answers with an absolute error of at most 0.01. Be lenient when grading arithmetic mistakes.';
        test.sequential('update rubric grader guidelines should succeed', async () => {
          setUser(mockStaff[0]);

          assert.isDefined(rubric_items);

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 0,
            min_points: -0.5,
            max_extra_points: 0.5,
            rubric_items,
            grader_guidelines,
          });
        });

        checkSettingsResults(0, -0.5, 0.5, grader_guidelines);
      });

      describe('Grading without rubric items', () => {
        test.sequential('submit a grade using a positive rubric', async () => {
          setUser(mockStaff[0]);
          selected_rubric_items = [];
          score_points = 0;
          score_percent = 0;
          feedback_note = 'Test feedback note without any rubric items';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[0]);

        test.sequential('update rubric items should succeed', async () => {
          setUser(mockStaff[0]);
          assert.isDefined(rubric_items);

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 0,
            min_points: -0.3,
            max_extra_points: 0.3,
            rubric_items,
          });
        });

        checkSettingsResults(0, -0.3, 0.3, '');
        checkGradingResults(mockStaff[0], mockStaff[0]);
      });

      describe('Using adjust points', () => {
        test.sequential('submit a grade using a rubric with adjust points', async () => {
          setUser(mockStaff[3]);
          selected_rubric_items = [1, 3];
          adjust_points = -0.2;
          score_points = 1.2;
          score_percent = 20;
          feedback_note = 'Test feedback note updated after rubric and adjustment';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[3]);
      });

      describe('Floor and ceiling (max/min points)', () => {
        test.sequential('submit a grade that reaches the ceiling', async () => {
          setUser(mockStaff[3]);
          selected_rubric_items = [0, 1];
          adjust_points = null;
          score_points = 6.3;
          score_percent = 105;
          feedback_note = 'Test feedback note updated over ceiling';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[3]);

        test.sequential('submit a grade that reaches the ceiling with adjust points', async () => {
          setUser(mockStaff[3]);
          selected_rubric_items = [0, 1];
          adjust_points = 1.2;
          score_points = 7.5;
          score_percent = 125;
          feedback_note = 'Test feedback note updated over ceiling and adjustment';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[3]);

        test.sequential('update rubric items should succeed', async () => {
          setUser(mockStaff[0]);
          assert.isDefined(rubric_items);
          score_points = 6.9;
          score_percent = 115;

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 0,
            min_points: -0.3,
            max_extra_points: -0.3,
            rubric_items,
          });
        });

        checkSettingsResults(0, -0.3, -0.3, '');
        checkGradingResults(mockStaff[0], mockStaff[0]);

        test.sequential('submit a grade that reaches the floor', async () => {
          setUser(mockStaff[3]);
          selected_rubric_items = [2, 3];
          adjust_points = null;
          score_points = -0.3;
          score_percent = -5;
          feedback_note = 'Test feedback note updated over ceiling';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[3]);
      });

      describe('Negative grading', () => {
        test.sequential('set rubric settings to negative grading should succeed', async () => {
          setUser(mockStaff[0]);
          rubric_items = [
            { points: 0, description: 'First rubric item', always_show_to_students: true },
            {
              points: -3,
              description: 'Second rubric item (partial, with `markdown`)',
              explanation: 'Explanation with **markdown**',
              grader_note: 'Instructions with *markdown*',
              description_render: 'Second rubric item (partial, with <code>markdown</code>)',
              explanation_render: '<p>Explanation with <strong>markdown</strong></p>',
              grader_note_render: '<p>Instructions with <em>markdown</em></p>',
              always_show_to_students: true,
            },
            {
              points: -4,
              description: 'Third rubric item (partial, with moustache: {{params.value1}})',
              explanation: 'Explanation with moustache: {{params.value2}}',
              grader_note:
                'Instructions with *markdown* and moustache: {{params.value3}}\n\nAnd more than one line',
              description_render: 'Third rubric item (partial, with moustache: 37)',
              explanation_render: '<p>Explanation with moustache: 43</p>',
              grader_note_render:
                '<p>Instructions with <em>markdown</em> and moustache: 49</p>\n<p>And more than one line</p>',
              always_show_to_students: false,
            },
            {
              points: 1.6,
              description:
                'Positive rubric item in negative grading (positive points, floating point)',
              always_show_to_students: false,
            },
            {
              points: 6,
              description: 'Rubric item with positive reaching maximum',
              always_show_to_students: true,
            },
          ];

          await submitRubricSettings({
            replace_auto_points: false,
            starting_points: 6,
            min_points: -0.6,
            max_extra_points: 0.6,
            rubric_items,
          });
        });

        checkSettingsResults(6, -0.6, 0.6, '');

        test.sequential('submit a grade using a negative rubric', async () => {
          setUser(mockStaff[0]);
          selected_rubric_items = [0, 2, 3];
          adjust_points = null;
          score_points = 3.6;
          score_percent = 60;
          feedback_note = 'Test feedback note updated after negative rubric';
          await submitGradeForm();
        });

        checkGradingResults(mockStaff[0], mockStaff[0]);
      });
    });

    describe('New submission after manual grading', () => {
      test.sequential('re-open assessment', async () => {
        setUser(defaultUser);
        const instancesBody = await (await fetch(instancesAssessmentUrl)).text();
        const $instancesBody = cheerio.load(instancesBody);
        const token = $instancesBody('input[name=__csrf_token]').attr('value') || '';
        const response = await fetch(instancesAssessmentUrl, {
          method: 'POST',
          headers: { 'Content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            __action: 'set_time_limit_all',
            __csrf_token: token,
            action: 'remove',
            time_add: '0',
            reopen_closed: 'on',
          }).toString(),
        });
        assert.equal(response.status, 200);
      });

      test.sequential('load page as student', async () => {
        iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
        iqId = parseInstanceQuestionId(iqUrl);
        manualGradingIQUrl =
          siteUrl +
          getManualGradingInstanceQuestionUrl({
            courseInstanceId: '1',
            assessmentId,
            instanceQuestionId: String(iqId),
          });

        const instanceQuestion = await sqldb.queryRow(
          sql.get_instance_question,
          { iqId },
          InstanceQuestionSchema,
        );
        assert.equal(instanceQuestion.requires_manual_grading, false);
      });

      test.sequential('submit an answer to the question', async () => {
        const gradeRes = await saveOrGrade(iqUrl, {}, 'save', [
          { name: 'fib.py', contents: Buffer.from('solution').toString('base64') },
        ]);
        const questionsPage = await gradeRes.text();
        const $questionsPage = cheerio.load(questionsPage);

        assert.equal(gradeRes.status, 200);
        assert.equal(
          getLatestSubmissionStatus($questionsPage),
          'manual grading: waiting for grading',
        );
      });

      test.sequential('should tag question as requiring grading', async () => {
        const instanceQuestion = await sqldb.queryRow(
          sql.get_instance_question,
          { iqId },
          InstanceQuestionSchema,
        );
        assert.equal(instanceQuestion.requires_manual_grading, true);
      });

      test.sequential('student view should keep the old feedback/rubric', async () => {
        iqUrl = await loadHomeworkQuestionUrl(mockStudents[0]);
        const questionsPage = await (await fetch(iqUrl)).text();
        const $questionsPage = cheerio.load(questionsPage);
        const submissions = $questionsPage('[data-testid="submission-with-feedback"]');
        assert.equal(submissions.eq(0).find('[id^="submission-feedback-"]').length, 0);
        assert.equal(submissions.eq(1).find('[id^="submission-feedback-"]').length, 1);
        assert.equal(
          submissions.eq(1).find('[data-testid="feedback-body"]').first().text().trim(),
          feedback_note,
        );
      });

      test.sequential('manual grading page should warn about an open instance', async () => {
        setUser(defaultUser);
        const manualGradingPage = await (await fetch(manualGradingAssessmentUrl)).text();
        $manualGradingPage = cheerio.load(manualGradingPage);
        assertAlert($manualGradingPage, 'has one open instance');
      });

      test.sequential('manual grading page should list one question requiring grading', () => {
        const row = $manualGradingPage(`tr:contains("${manualGradingQuestionTitle}")`);
        assert.equal(row.length, 1);
        const count = row.find('td[data-testid="iq-to-grade-count"]').text().replaceAll(/\s/g, '');
        assert.equal(count, '1/1');

        // Extract URLs and IDs from the HTML
        const questionLink = row.find('td:first-child a').attr('href');
        assert(questionLink);
        manualGradingAssessmentQuestionUrl = siteUrl + questionLink;
        const aqMatch = questionLink.match(/assessment_question\/(\d+)/);
        assert(aqMatch);
        assessmentQuestionId = aqMatch[1];

        // The "next submission" button only shows if the current user has questions assigned to them
        // or if there are unassigned questions. The current user, "defaultUser",
        // does not have any questions assigned to them,
        // because it was assigned to "mockStaff[0]" in the previous test.
        const nextButton = row.find('.btn:contains("next submission")');
        assert.equal(nextButton.length, 0);
        manualGradingNextUngradedUrl = manualGradingAssessmentQuestionUrl + '/next_ungraded';
      });

      test.sequential(
        'manual grading page for assessment question should warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingAQPage = await (
            await fetch(manualGradingAssessmentQuestionUrl)
          ).text();
          const $manualGradingAQPage = cheerio.load(manualGradingAQPage);
          assertAlert($manualGradingAQPage, 'has one open instance');
        },
      );

      test.sequential(
        'manual grading page for assessment question should list one instance',
        async () => {
          setUser(defaultUser);
          const instanceList = await loadInstances();
          assert.lengthOf(instanceList, 1);
          assert.equal(instanceList[0].instance_question.id, iqId);
          assert.isOk(instanceList[0].instance_question.requires_manual_grading);
        },
      );

      test.sequential(
        'manual grading page for instance question should warn about an open instance',
        async () => {
          setUser(defaultUser);
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
          assertAlert($manualGradingIQPage, 'is still open');
        },
      );

      test.sequential('submit a new grade', async () => {
        setUser(mockStaff[1]);
        selected_rubric_items = [1, 2, 4];
        adjust_points = null;
        score_points = 5;
        score_percent = 83.33;
        feedback_note = 'Test feedback note for second submission';
        await submitGradeForm();
      });

      checkGradingResults(mockStaff[0], mockStaff[1]);
    });
  });
});
