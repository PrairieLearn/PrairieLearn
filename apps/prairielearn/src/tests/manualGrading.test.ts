import { createTRPCClient, httpLink } from '@trpc/client';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import superjson from 'superjson';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, InstanceQuestionSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { type ManualGradingAssessmentQuestionRouter } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/trpc.js';

import {
  type User,
  assertAlert,
  parseInstanceQuestionId,
  saveOrGrade,
  setUser,
} from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const ExpectedScorePercPendingSchema = z.number();

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

async function submitGradeForm(
  method: 'rubric' | 'points' | 'percentage' = 'rubric',
): Promise<void> {
  const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
  const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
  const form = $manualGradingIQPage('form[name=manual-grading-form]');
  const params = new URLSearchParams({
    __action: 'add_manual_grade',
    __csrf_token: form.find('input[name=__csrf_token]').attr('value') || '',
    submission_id: form.find('input[name=submission_id]').attr('value') || '',
    modified_at: form.find('input[name=modified_at]').attr('value') || '',
    score_manual_points: (method === 'points' ? score_points : score_points - 1).toString(),
    score_manual_percent: (method === 'percentage' ? score_percent : score_percent - 10).toString(),
    submission_note: feedback_note,
  });
  if (adjust_points) params.append('score_manual_adjust_points', adjust_points.toString());
  (selected_rubric_items || [])
    .map((index) => rubric_items?.[index].id)
    .forEach((id) => {
      assert(id);
      params.append('rubric_item_selected_manual', id);
    });
  if (method === 'percentage') params.append('use_score_perc', 'on');
  await fetch(manualGradingIQUrl, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
}

async function createTrpcClient(assessmentQuestionUrl: string) {
  // Fetch the page to get the CSRF token from hydration data
  const pageResponse = await fetch(assessmentQuestionUrl);
  const pageHtml = await pageResponse.text();
  const $ = cheerio.load(pageHtml);

  // Extract trpcCsrfToken from the hydration data
  const dataScript = $(
    'script[data-component-props][data-component="AssessmentQuestionManualGrading"]',
  );
  const propsJson = dataScript.text();
  const props = superjson.parse<{ trpcCsrfToken: string }>(propsJson);
  const trpcCsrfToken = props.trpcCsrfToken;

  return createTRPCClient<ManualGradingAssessmentQuestionRouter>({
    links: [
      httpLink({
        url: assessmentQuestionUrl + '/trpc',
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': trpcCsrfToken,
        },
        transformer: superjson,
      }),
    ],
  });
}

async function loadInstances(assessmentQuestionUrl: string) {
  const client = await createTrpcClient(assessmentQuestionUrl);
  return await client.instances.query();
}

async function assertScorePercPending(iqId: string | number) {
  const assessmentInstance = await sqldb.queryRow(
    sql.get_assessment_instance_for_iq,
    { iqId },
    AssessmentInstanceSchema,
  );
  const expected_score_perc_pending = await sqldb.queryRow(
    sql.get_expected_score_perc_pending_for_iq,
    { iqId },
    ExpectedScorePercPendingSchema,
  );
  assert.closeTo(assessmentInstance.score_perc_pending, expected_score_perc_pending, 0.0001);
}

function checkGradingResults(assigned_grader: MockUser, grader: MockUser): void {
  test.sequential('manual grading page for instance question lists updated values', async () => {
    setUser(defaultUser);
    const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
    const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
    const form = $manualGradingIQPage('form[name=manual-grading-form]');
    // The percentage input is not checked because its value is updated via client-side JS, which is
    // currently not supported by the test suite
    assert.equal(form.find('input[name=score_manual_points]').val(), score_points.toString());
    assert.equal(form.find('textarea').text(), feedback_note);

    if (rubric_items) {
      rubric_items.forEach((item, index) => {
        assert.isDefined(selected_rubric_items);
        const checkbox = form.find(`.js-selectable-rubric-item[value="${item.id}"]`);
        assert.equal(checkbox.length, 1);
        assert.equal(checkbox.is(':checked'), selected_rubric_items.includes(index));
      });
      assert.equal(
        form.find('input[name=score_manual_adjust_points]').val(),
        (adjust_points ?? '').toString(),
      );
    } else {
      assert.equal(form.find('.js-selectable-rubric-item').length, 0);
      assert.equal(form.find('input[name=score_manual_adjust_points]').length, 0);
    }
  });

  test.sequential('manual grading page for assessment question lists updated values', async () => {
    setUser(defaultUser);
    const instanceList = await loadInstances(manualGradingAssessmentQuestionUrl);
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
  test.sequential('rubric settings modal should update with new values', async () => {
    const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
    const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
    const form = $manualGradingIQPage('#rubric-editor');

    assert.equal(form.find('input[name="starting_points"]').val(), starting_points.toString());
    assert.equal(form.find('input[name="max_extra_points"]').val(), max_extra_points.toString());
    assert.equal(form.find('input[name="min_points"]').val(), min_points.toString());
    assert.equal(form.find('textarea[name="grader_guidelines"]').val(), grader_guidelines);

    const idFields = form.find('input[name^="rubric_item"][name$="[id]"]');

    assert.isDefined(rubric_items);
    rubric_items.forEach((item, index) => {
      const idField = $manualGradingIQPage(idFields.get(index));
      assert.equal(idField.length, 1);
      if (!item.id) {
        item.id = idField.attr('value');
      }
      assert.equal(idField.val(), item.id);
      assert.equal(idField.attr('name'), `rubric_item[${item.id}][id]`);

      const points = form.find(`[name="rubric_item[${item.id}][points]"]`);
      assert.equal(points.val(), item.points.toString());
      const description = form.find(`[name="rubric_item[${item.id}][description]"]`);
      assert.equal(description.val(), item.description);
      const explanation = form.find(`[name="rubric_item[${item.id}][explanation]"]`);
      assert.equal(explanation.val() ?? '', b64EncodeUnicode(item.explanation ?? ''));
      const graderNote = form.find(`[name="rubric_item[${item.id}][grader_note]"]`);
      assert.equal(graderNote.val() ?? '', b64EncodeUnicode(item.grader_note ?? ''));
      const always_show_to_students = form.find(
        `[name="rubric_item[${item.id}][always_show_to_students]"]`,
      );
      assert.equal(always_show_to_students.val(), item.always_show_to_students ? 'true' : 'false');
    });
  });

  test.sequential('grading panel should have proper values for rubric', async () => {
    const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
    const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
    const form = $manualGradingIQPage('form[name=manual-grading-form]');

    assert.isDefined(rubric_items);
    rubric_items.forEach((item) => {
      const checkbox = form.find(`.js-selectable-rubric-item[value="${item.id}"]`);
      assert.equal(checkbox.length, 1);
      const container = checkbox.parents('.js-selectable-rubric-item-label');
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

function buildRubricSettingsPayload({
  manualGradingIQPage,
  replace_auto_points,
  starting_points,
  min_points,
  max_extra_points,
  rubric_items,
  grader_guidelines,
}: {
  manualGradingIQPage: string;
  replace_auto_points: boolean;
  starting_points: number;
  min_points: number;
  max_extra_points: number;
  rubric_items: RubricItem[];
  grader_guidelines?: string;
}) {
  const $manualGradingIQPage = cheerio.load(manualGradingIQPage);
  const form = $manualGradingIQPage('#rubric-editor');
  return {
    __csrf_token: form.find('input[name=__csrf_token]').attr('value') || '',
    __action: form.find('input[name=__action]').attr('value') || '',
    modified_at: form.find('input[name=modified_at]').attr('value') || '',
    use_rubric: true,
    replace_auto_points,
    starting_points,
    min_points,
    max_extra_points,
    grader_guidelines: grader_guidelines || '',
    rubric_items: rubric_items.map(
      (
        {
          description_render: _description_render,
          explanation_render: _explanation_render,
          grader_note_render: _grader_note_render,
          ...item
        },
        idx,
      ) => ({
        order: idx,
        ...item,
      }),
    ),
  };
}

describe('Manual Grading', { timeout: 80_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    manualGradingAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessment.id}/manual_grading`;
    instancesAssessmentUrl = `${baseUrl}/course_instance/1/instructor/assessment/${assessment.id}/instances`;
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
        manualGradingIQUrl = `${manualGradingAssessmentUrl}/instance_question/${iqId}`;

        const instanceQuestion = await sqldb.queryRow(
          sql.get_instance_question,
          { iqId },
          InstanceQuestionSchema,
        );
        assert.equal(instanceQuestion.requires_manual_grading, false);
      });

      test.sequential(
        'score_perc_pending should be 0 before manual grading is requested',
        async () => {
          await assertScorePercPending(iqId);
        },
      );

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

      test.sequential(
        'score_perc_pending should reflect a newly pending manual question after submission',
        async () => {
          await assertScorePercPending(iqId);
        },
      );
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

        // Extract URLs from the HTML to verify they're correct
        const questionLink = row.find('td:first-child a').attr('href');
        assert(questionLink);
        manualGradingAssessmentQuestionUrl = siteUrl + questionLink;
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
          const instanceList = await loadInstances(manualGradingAssessmentQuestionUrl);
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
        const client = await createTrpcClient(manualGradingAssessmentQuestionUrl);
        await client.setAssignedGrader.mutate({
          assigned_grader: mockStaff[0].id!,
          instance_question_ids: [iqId.toString()],
        });
      });

      test.sequential(
        'manual grading page for assessment question should list tagged grader',
        async () => {
          setUser(defaultUser);
          const instanceList = await loadInstances(manualGradingAssessmentQuestionUrl);
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

      test.sequential(
        'score_perc_pending should drop after manual grading is completed',
        async () => {
          await assertScorePercPending(iqId);
        },
      );

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
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
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

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 0,
                min_points: -0.3,
                max_extra_points: 0.3,
                rubric_items,
              }),
            ),
          });

          assert.equal(response.ok, true);
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
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          assert.isDefined(rubric_items);
          rubric_items[2].points = 1;
          score_points = 5.4;
          score_percent = 90;

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 0,
                min_points: -0.5,
                max_extra_points: 0.5,
                rubric_items,
              }),
            ),
          });

          assert.equal(response.ok, true);
        });

        checkSettingsResults(0, -0.5, 0.5, '');
        checkGradingResults(mockStaff[0], mockStaff[0]);
      });

      describe('Changing rubric grader guidelines', () => {
        const grader_guidelines =
          'Accept answers with an absolute error of at most 0.01. Be lenient when grading arithmetic mistakes.';
        test.sequential('update rubric grader guidelines should succeed', async () => {
          setUser(mockStaff[0]);
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();

          assert.isDefined(rubric_items);

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 0,
                min_points: -0.5,
                max_extra_points: 0.5,
                rubric_items,
                grader_guidelines,
              }),
            ),
          });

          assert.equal(response.ok, true);
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
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          assert.isDefined(rubric_items);

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 0,
                min_points: -0.3,
                max_extra_points: 0.3,
                rubric_items,
              }),
            ),
          });

          assert.equal(response.ok, true);
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
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
          assert.isDefined(rubric_items);
          score_points = 6.9;
          score_percent = 115;

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 0,
                min_points: -0.3,
                max_extra_points: -0.3,
                rubric_items,
              }),
            ),
          });

          assert.equal(response.ok, true);
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
          const manualGradingIQPage = await (await fetch(manualGradingIQUrl)).text();
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

          const response = await fetch(manualGradingIQUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(
              buildRubricSettingsPayload({
                manualGradingIQPage,
                replace_auto_points: false,
                starting_points: 6,
                min_points: -0.6,
                max_extra_points: 0.6,
                rubric_items,
              }),
            ),
          });

          assert.equal(response.ok, true);
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
        manualGradingIQUrl = `${manualGradingAssessmentUrl}/instance_question/${iqId}`;

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

        // Extract URLs from the HTML to verify they're correct
        const questionLink = row.find('td:first-child a').attr('href');
        assert(questionLink);
        manualGradingAssessmentQuestionUrl = siteUrl + questionLink;

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
          const instanceList = await loadInstances(manualGradingAssessmentQuestionUrl);
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
