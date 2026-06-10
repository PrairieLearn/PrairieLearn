/**
 * Regenerates the screenshots embedded in `docs/assessment/accessControlModern.md`.
 *
 * This is a Playwright spec rather than a normal test. It is skipped unless
 * `CAPTURE_SCREENSHOTS=1` is set so normal e2e runs do not
 * rewrite documentation images.
 *
 * Usage: `pnpm capture-access-control-screenshots`
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { Temporal } from '@js-temporal/polyfill';
import type { Locator, Page } from '@playwright/test';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import type { Assessment, CourseInstance } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { replaceEnrollmentAccessControlRules } from '../../models/assessment-access-control-rules.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import {
  generateAndEnrollUsers,
  selectUsersAndEnrollmentsByUidsInCourseInstance,
} from '../../models/enrollment.js';
import {
  addLabelToEnrollments,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import { formJsonToEnrollmentRuleData } from '../../trpc/assessment/access-control.js';
import { syncCourse } from '../helperCourse.js';

import { test } from './fixtures.js';

const OUT_DIR = path.resolve(REPOSITORY_ROOT_PATH, 'docs/assessment/accessControlModern');
const VIEWPORT = { width: 1440, height: 1600 };
const ASSESSMENT_TID = 'hw19-accessControlUi';
const ASSESSMENT_RELATIVE_PATH = path.join(
  'courseInstances',
  'Sp15',
  'assessments',
  ASSESSMENT_TID,
  'infoAssessment.json',
);
interface ScreenshotStudent {
  name: string;
  uid: string;
}
const SCREENSHOT_STUDENTS: ScreenshotStudent[] = [
  { name: 'Alex Kim', uid: 'alex.kim@example.com' },
  { name: 'Jordan Patel', uid: 'jordan.patel@example.com' },
  { name: 'Sam Rivera', uid: 'sam.rivera@example.com' },
  { name: 'Riley Thompson', uid: 'riley.thompson@example.com' },
  { name: 'Maya Chen', uid: 'maya.chen@example.com' },
  { name: 'Noah Williams', uid: 'noah.williams@example.com' },
  { name: 'Priya Shah', uid: 'priya.shah@example.com' },
  { name: 'Evan Martinez', uid: 'evan.martinez@example.com' },
  { name: 'Avery Johnson', uid: 'avery.johnson@example.com' },
  { name: 'Leah Nguyen', uid: 'leah.nguyen@example.com' },
];
const SECTION_A_SCREENSHOT_STUDENTS = SCREENSHOT_STUDENTS.slice(0, 4);
const RELEASE_OVERRIDE_SCREENSHOT_STUDENTS = SCREENSHOT_STUDENTS.slice(4, 7);
const DUE_OVERRIDE_SCREENSHOT_STUDENTS = SCREENSHOT_STUDENTS.slice(7, 10);
interface ScreenshotTextReplacement {
  from: string;
  to: string;
}

function screenshotDate(displayTimezone: string, daysFromToday: number, time: string): string {
  return `${Temporal.Now.plainDateISO(displayTimezone).add({ days: daysFromToday }).toString()}T${time}`;
}

async function writeScreenshotAssessmentConfig({
  testCoursePath,
  displayTimezone,
}: {
  testCoursePath: string;
  displayTimezone: string;
}) {
  const configPath = path.join(testCoursePath, ASSESSMENT_RELATIVE_PATH);
  const config = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));
  config.accessControl = [
    {
      beforeRelease: { listed: true },
      dateControl: {
        release: { date: screenshotDate(displayTimezone, -7, '00:00:01') },
        due: { date: screenshotDate(displayTimezone, 14, '23:59:59') },
        afterLastDeadline: { allowSubmissions: true, credit: 0 },
      },
      afterComplete: { questions: { hidden: false } },
    },
    {
      labels: ['Section A'],
      dateControl: {
        due: { date: screenshotDate(displayTimezone, 28, '20:15:00') },
      },
    },
  ];
  await fsPromises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function prepareScreenshotDom(page: Page, replacements: ScreenshotTextReplacement[]) {
  await page.mouse.move(0, 0);
  await page.evaluate((replacements) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    document.querySelector('#navbar-load-from-disk')?.remove();
    const adminToggle = document.querySelector('#navbar-administrator-toggle');
    if (adminToggle) {
      const divider = adminToggle.nextElementSibling;
      if (divider?.classList.contains('dropdown-divider')) divider.remove();
      adminToggle.remove();
    }
    // querySelectorAll('main *') matches the save bar plus every ancestor up
    // to <main> (text content propagates up); sort by height ascending and
    // remove the smallest to drop just the bar itself.
    Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((element) => {
        const text = element.textContent;
        const rect = element.getBoundingClientRect();
        return (
          rect.height > 0 &&
          (text.includes('No unsaved changes') || text.includes('You have unsaved changes')) &&
          text.includes('Save')
        );
      })
      .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)
      .at(0)
      ?.remove();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      for (const { from, to } of replacements) {
        node.textContent = node.textContent?.replaceAll(from, to) ?? null;
      }
      node = walker.nextNode();
    }
  }, replacements);
}

async function shootMainContent(
  page: Page,
  name: string,
  replacements: ScreenshotTextReplacement[],
) {
  await prepareScreenshotDom(page, replacements);
  const filePath = path.join(OUT_DIR, `${name}.png`);
  // Custom clip rather than fullPage: crops out the side nav (start at
  // <main>'s left edge) and clamps the bottom to the taller of the summary
  // column or detail panel content, capped at the viewport so the split pane's
  // internal scroll doesn't stretch the image.
  const clip = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main');
    const leftContent = document.querySelector<HTMLElement>('main .p-3');
    const detailPanel = document.querySelector<HTMLElement>('#pl-ui-split-pane-detail');
    const detailContent = document.querySelector<HTMLElement>(
      '.pl-ui-split-pane__right-body > :first-child',
    );
    if (!main || !leftContent) throw new Error('Could not find main content region');

    const mainRect = main.getBoundingClientRect();
    const leftRect = leftContent.getBoundingClientRect();
    const detailBottom =
      detailPanel && detailContent
        ? Math.min(
            detailPanel.getBoundingClientRect().bottom,
            detailContent.getBoundingClientRect().bottom,
          )
        : 0;
    const bottom = Math.max(leftRect.bottom, detailBottom);

    return {
      x: mainRect.left,
      y: mainRect.top,
      width: document.documentElement.clientWidth - mainRect.left,
      height: Math.min(bottom, document.documentElement.clientHeight) - mainRect.top,
    };
  });
  await page.screenshot({ path: filePath, fullPage: false, clip });
  console.log(`  Captured ${path.relative(REPOSITORY_ROOT_PATH, filePath)}`);
}

function getDetailPanel(page: Page): Locator {
  return page.locator('#pl-ui-split-pane-detail');
}

function getOverrideCard(page: Page, labelText: string): Locator {
  return page.getByTestId('override-card').filter({ hasText: labelText });
}

async function navigateToAccessPage(page: Page, courseInstanceId: string, assessmentId: string) {
  await page.goto(
    `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/access`,
  );
  await page.waitForSelector('.js-hydrated-component');
}

async function seedRealisticOverrides({
  courseInstance,
  assessment,
  displayTimezone,
}: {
  courseInstance: CourseInstance;
  assessment: Assessment;
  displayTimezone: string;
}): Promise<ScreenshotTextReplacement[]> {
  const users = await generateAndEnrollUsers({ count: 10, course_instance_id: courseInstance.id });
  const authzData = dangerousFullSystemAuthz();
  const rows = await selectUsersAndEnrollmentsByUidsInCourseInstance({
    uids: users.map((u) => u.uid),
    courseInstance,
    requiredRole: ['System'],
    authzData,
  });
  const enrollmentsByUid = new Map(rows.map(({ user, enrollment }) => [user.uid, enrollment]));
  const enrollments = users.map((u) => {
    const enrollment = enrollmentsByUid.get(u.uid);
    if (!enrollment) throw new Error(`Could not find enrollment for ${u.uid}`);
    return enrollment;
  });

  const labels = await selectStudentLabelsInCourseInstance(courseInstance);
  const sectionALabel = labels.find((label) => label.name === 'Section A');
  if (!sectionALabel) throw new Error('Could not find Section A student label');
  await addLabelToEnrollments({
    enrollments: enrollments.slice(0, 4),
    label: sectionALabel,
    authzData,
  });

  await replaceEnrollmentAccessControlRules(assessment, [
    {
      ruleData: formJsonToEnrollmentRuleData({
        dateControl: {
          release: { date: screenshotDate(displayTimezone, 2, '09:00:00') },
          durationMinutes: 90,
        },
      }),
      enrollmentIds: enrollments.slice(4, 7).map((e) => e.id),
    },
    {
      ruleData: formJsonToEnrollmentRuleData({
        dateControl: {
          due: { date: screenshotDate(displayTimezone, 21, '23:59:59') },
          durationMinutes: 75,
        },
      }),
      enrollmentIds: enrollments.slice(7, 10).map((e) => e.id),
    },
  ]);

  // Sort by UID before zipping with display names so the override card lists
  // the same names in the same order as the UI, which renders enrollment
  // overrides sorted by UID. The Section A slice is matched in enrollment
  // order because that group appears as a label, not individual rows.
  const screenshotStudentEntries: [string, ScreenshotStudent][] = [
    ...users
      .slice(0, 4)
      .map((user, index): [string, ScreenshotStudent] => [
        user.uid,
        SECTION_A_SCREENSHOT_STUDENTS[index],
      ]),
    ...users
      .slice(4, 7)
      .sort((a, b) => a.uid.localeCompare(b.uid))
      .map((user, index): [string, ScreenshotStudent] => [
        user.uid,
        RELEASE_OVERRIDE_SCREENSHOT_STUDENTS[index],
      ]),
    ...users
      .slice(7, 10)
      .sort((a, b) => a.uid.localeCompare(b.uid))
      .map((user, index): [string, ScreenshotStudent] => [
        user.uid,
        DUE_OVERRIDE_SCREENSHOT_STUDENTS[index],
      ]),
  ];
  const screenshotStudentsByUid = new Map(screenshotStudentEntries);

  return users.flatMap((user) => {
    const screenshotStudent = screenshotStudentsByUid.get(user.uid);
    if (!screenshotStudent) throw new Error(`Could not find screenshot student for ${user.uid}`);
    return [
      { from: user.uid, to: screenshotStudent.uid },
      ...(user.name ? [{ from: user.name, to: screenshotStudent.name }] : []),
      ...(user.email ? [{ from: user.email, to: screenshotStudent.uid }] : []),
    ];
  });
}

test.describe('Modern access control docs screenshots', () => {
  test.skip(
    !process.env.CAPTURE_SCREENSHOTS,
    'Set CAPTURE_SCREENSHOTS=1 to regenerate docs/assessment/accessControlModern/*.png.',
  );

  test('capture access-control UI screenshots', async ({
    page,
    courseInstance,
    testCoursePath,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(VIEWPORT);
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    await features.enable('enhanced-access-control');
    await writeScreenshotAssessmentConfig({
      testCoursePath,
      displayTimezone: courseInstance.display_timezone,
    });
    await syncCourse(testCoursePath);

    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: ASSESSMENT_TID,
    });
    const screenshotTextReplacements = await seedRealisticOverrides({
      courseInstance,
      assessment,
      displayTimezone: courseInstance.display_timezone,
    });

    await navigateToAccessPage(page, courseInstance.id, assessment.id);
    await page.getByRole('heading', { name: 'Defaults' }).waitFor();
    await shootMainContent(page, '01-overview', screenshotTextReplacements);

    await page
      .getByRole('heading', { name: 'Defaults' })
      .locator('..')
      .getByRole('button', { name: 'Edit' })
      .click();
    await getDetailPanel(page).waitFor({ state: 'visible' });
    await shootMainContent(page, '02-defaults-editor', screenshotTextReplacements);

    await getOverrideCard(page, 'Release date').getByRole('button', { name: 'Edit' }).click();
    await getDetailPanel(page).waitFor({ state: 'visible' });
    await shootMainContent(page, '03-student-override', screenshotTextReplacements);
  });
});
