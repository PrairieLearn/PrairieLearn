/**
 * Regenerates the screenshots embedded in `docs/getting-started/index.md`.
 *
 * This is a Playwright spec rather than a true test: it's gated on
 * `CAPTURE_SCREENSHOTS=1` so it's skipped in normal CI/local e2e runs and
 * runs only when the docs need refreshing. Running it as a spec lets it
 * reuse the e2e worker server, dev DB, writable testCourse copy, and `page`
 * fixture instead of redefining all of that.
 *
 * Usage: `yarn capture-onboarding-screenshots`
 */

import fs from 'node:fs';
import path from 'node:path';

import { Temporal } from '@js-temporal/polyfill';
import type { Locator, Page } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';
import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';

import { test } from './fixtures.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const OUT_DIR = path.resolve(
  REPOSITORY_ROOT_PATH,
  process.env.OUT_DIR ?? 'docs/getting-started/screenshots',
);
const VIEWPORT = { width: 1440, height: 900 };
const TALL_VIEWPORT = { width: 1440, height: 1300 };

const QUESTION_HTML = `<pl-question-panel>
  <p>What is the area of a rectangle that has sides 4 and 5?</p>
</pl-question-panel>

<pl-multiple-choice answers-name="area">
  <pl-answer correct="true">20</pl-answer>
  <pl-answer correct="false">10</pl-answer>
  <pl-answer correct="false">9</pl-answer>
  <pl-answer correct="false">18</pl-answer>
  <pl-answer correct="false">40</pl-answer>
</pl-multiple-choice>
`;

function screenshotDate(displayTimezone: string, daysFromToday: number, time: string): string {
  return `${Temporal.Now.plainDateISO(displayTimezone).add({ days: daysFromToday }).toString()}T${time}`;
}

interface AceEditor {
  setValue: (val: string, pos: number) => void;
  getValue: () => string;
}
interface AceWindow {
  ace: { edit: (el: HTMLElement) => AceEditor };
}

let shotCount = 0;
interface ShootOpts {
  filePath?: string;
  clip?: { x: number; y: number; width: number; height: number };
  locator?: Locator;
}

/**
 * Strip dev-mode artifacts from the DOM right before we measure or screenshot.
 * CSS can't match by text content for the home banner, and the navbar dropdown
 * items are only visible when opened, so we strip per-shot.
 */
async function stripDevModeArtifacts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.card-header').forEach((el) => {
      const heading = el.querySelector('h2');
      if (heading?.textContent.trim() === 'Development Mode') {
        el.closest('.card')?.remove();
      }
    });
    document.querySelector('#navbar-load-from-disk')?.remove();
    const adminToggle = document.querySelector('#navbar-administrator-toggle');
    if (adminToggle) {
      const divider = adminToggle.nextElementSibling;
      if (divider?.classList.contains('dropdown-divider')) divider.remove();
      adminToggle.remove();
    }
  });
}

async function shoot(page: Page, name: string, opts: ShootOpts = {}) {
  const viewport = page.viewportSize();
  if (viewport) {
    await page.mouse.move(viewport.width - 1, viewport.height - 1);
  }
  await stripDevModeArtifacts(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.waitForTimeout(200);
  const filePath = opts.filePath ?? path.join(OUT_DIR, `${name}.png`);
  if (opts.locator) {
    await opts.locator.screenshot({ path: filePath });
  } else {
    await page.screenshot({ path: filePath, fullPage: false, clip: opts.clip });
  }
  await page.evaluate(() => {
    document.querySelectorAll('[data-capture-highlight]').forEach((el) => el.remove());
  });
  shotCount += 1;
  console.log(`  ✔ ${name}.png`);
}

/**
 * Fixed-position overlay on `<body>` with a high z-index so it isn't clipped by
 * `overflow: hidden` ancestors (dropdowns, side panels).
 */
async function highlight(locator: Locator, opts?: { offset?: number }) {
  const offset = opts?.offset ?? 6;
  await stripDevModeArtifacts(locator.page());
  await locator.first().evaluate((el, off) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const borderWidth = 3;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const top = Math.max(borderWidth, rect.top - off);
    const left = Math.max(borderWidth, rect.left - off);
    const right = Math.min(viewportWidth - borderWidth, rect.right + off);
    const bottom = Math.min(viewportHeight - borderWidth, rect.bottom + off);
    const overlay = document.createElement('div');
    overlay.dataset.captureHighlight = 'true';
    overlay.style.cssText = [
      'position: fixed',
      `top: ${top}px`,
      `left: ${left}px`,
      `width: ${right - left}px`,
      `height: ${bottom - top}px`,
      'box-sizing: border-box',
      'border: 3px solid #d6336c',
      'border-radius: 6px',
      'z-index: 2147483647',
      'pointer-events: none',
    ].join(';');
    document.body.append(overlay);
  }, offset);
}

async function waitForModalShown(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const m = document.querySelector<HTMLElement>('.modal.show');
    return m !== null && getComputedStyle(m).opacity === '1';
  });
  return dialog;
}

async function waitForAceReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.ace_editor').first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const w = window as unknown as Partial<AceWindow>;
    return Boolean(w.ace?.edit && document.querySelector('.ace_editor'));
  });
}

async function setAceEditorContent(page: Page, content: string) {
  await waitForAceReady(page);
  await page.evaluate((newContent) => {
    const el = document.querySelector<HTMLElement>('.ace_editor');
    if (!el) throw new Error('Ace editor element not found');
    (window as unknown as AceWindow).ace.edit(el).setValue(newContent, -1);
  }, content);
}

async function captureHome(page: Page) {
  console.log('Home page');
  await page.goto('/');
  await page.getByRole('heading', { name: 'PrairieLearn Homepage' }).waitFor();
  await highlight(page.getByRole('link', { name: /QA 101: Test Course/i }));
  const panelBottom = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find((a) =>
      /QA 101: Test Course/i.test(a.textContent),
    );
    const card = link?.closest('.card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '01-home', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (panelBottom ?? 600) + 24 },
  });
}

async function captureCourseLanding(page: Page, courseUrl: string) {
  console.log('Course landing (Course instances tab)');
  await page.goto(courseUrl);
  await page.getByRole('heading', { name: 'Course instances' }).waitFor();
  const contentBottom = await page.evaluate(() => {
    const card = document.querySelector('.card');
    const dropdown = document.querySelector('#course-instance-dropdown');
    const cardBottom = card?.getBoundingClientRect().bottom ?? 0;
    const dropdownBottom = dropdown?.getBoundingClientRect().bottom ?? 0;
    return Math.ceil(Math.max(cardBottom, dropdownBottom));
  });
  await shoot(page, '02-course-instances', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (contentBottom || 600) + 24 },
  });
}

async function captureStaffPage(page: Page, courseUrl: string) {
  console.log('Staff page (Add users modal with Fa25 → Student data editor)');
  await page.goto(`${courseUrl}/course_admin/staff`);
  await page.getByRole('button', { name: /Add users/ }).waitFor();

  await page.getByRole('button', { name: /Add users/ }).click();
  const dialog = await waitForModalShown(page);
  await dialog.getByLabel('UIDs:').fill('ta@example.com');
  await dialog.getByLabel('Course content access:').selectOption('Editor');
  await dialog.getByLabel('Role for Fa25').selectOption('Student data editor');

  await highlight(dialog.getByLabel('Role for Fa25'));
  await shoot(page, '03-staff');

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
}

async function captureCreateInstanceModal(page: Page, courseUrl: string): Promise<string> {
  console.log('Create course instance modal (taller viewport)');
  await page.setViewportSize(TALL_VIEWPORT);
  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Add course instance' }).click();
  const dialog = await waitForModalShown(page);
  await dialog.getByText('Create course instance').waitFor();
  await dialog.getByLabel('Long name').fill('Fall 2025');
  await dialog.getByLabel('Short name').fill('Fa25');
  await shoot(page, '04-create-course-instance');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/course_instance\/\d+\b/, { timeout: 60_000 });
  const instanceId = page.url().match(/\/course_instance\/(\d+)/)?.[1];
  if (!instanceId) throw new Error(`Could not extract course instance id from ${page.url()}`);
  await page.setViewportSize(VIEWPORT);
  return `/pl/course_instance/${instanceId}`;
}

async function captureQuestionFlow(page: Page, courseInstanceUrl: string) {
  console.log('Question flow (questions list, create, edit, preview)');
  await page.goto(`${courseInstanceUrl}/instructor/course_admin/questions`);
  const addQuestion = page.getByRole('link', { name: 'Create new question', exact: true });
  await addQuestion.waitFor({ timeout: 60_000 });
  await highlight(addQuestion);
  await shoot(page, '06-questions');

  await page.goto(`${courseInstanceUrl}/instructor/course_admin/questions/create`);
  await page.getByLabel('Title').fill('Find the area of a rectangle');
  await page.getByLabel('Question identifier (QID)').fill('rectangle-area');

  // The page defaults to "PrairieLearn template" with the gallery shown.
  // Capture it before switching to "Empty question" for the tutorial flow.
  await page.getByRole('heading', { name: 'Basic questions', exact: true }).waitFor();
  await shoot(page, '11-question-templates');

  await page.getByText('Empty question', { exact: true }).click();
  await page.getByText("You'll start with empty").waitFor();
  await highlight(page.getByText('Empty question', { exact: true }));
  await highlight(page.getByRole('button', { name: /Create question/ }));
  await shoot(page, '07-create-question');

  await page.getByRole('button', { name: /Create question/ }).click();
  await page.waitForURL(/\/question\/\d+/);
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await page.waitForURL(/\/file_view\b/);
  await page.getByText('question.html').waitFor();
  await highlight(page.locator('a[href*="file_edit"][href$="question.html"]'));
  const filesCardBottom = await page.evaluate(() => {
    const cell = Array.from(document.querySelectorAll('td, a')).find(
      (el) => el.textContent.trim() === 'question.html',
    );
    const card = cell?.closest('.card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '09-question-files', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (filesCardBottom ?? 600) + 24 },
  });

  await page
    .getByRole('link', { name: 'Edit' })
    .and(page.locator('a[href*="file_edit"][href$="question.html"]'))
    .click();
  await page.waitForURL(/\/file_edit\/.*question\.html/);
  await setAceEditorContent(page, QUESTION_HTML);
  await highlight(page.getByRole('button', { name: 'Save' }));
  const editorCardBottom = await page.evaluate(() => {
    const card = document.querySelector('#file-editor-draft .card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '10-question-editor', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (editorCardBottom ?? 600) + 24 },
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForLoadState('networkidle');

  await page.getByRole('link', { name: 'Preview' }).click();
  await page.waitForURL(/\/preview\b/);
  await page.getByRole('button', { name: /Save & Grade/ }).waitFor();
  await page.getByRole('radio', { name: /\b20\b/ }).check();
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  await page.getByText(/100%/).first().waitFor();
  await shoot(page, '08-question-preview');
}

async function captureAssessmentFlow(
  page: Page,
  courseInstanceUrl: string,
  displayTimezone: string,
) {
  console.log('Assessment flow (list, create, edit, access, settings)');
  await page.goto(`${courseInstanceUrl}/instructor/instance_admin/assessments`);
  await page.getByRole('heading', { name: 'Assessments' }).waitFor();
  await shoot(page, '05-assessments');

  await page.getByRole('button', { name: 'Add assessment' }).click();
  const dialog = await waitForModalShown(page);
  await dialog.getByText('Create assessment').waitFor();
  await page.getByLabel('Title').fill('Geometric properties and applications');
  await page.getByLabel('Short name').fill('homework1');
  await shoot(page, '17-create-assessment');

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/assessment\/\d+\b/, { timeout: 60_000 });
  const assessmentId = page.url().match(/\/assessment\/(\d+)/)?.[1];
  if (!assessmentId) throw new Error(`Could not extract assessment id from ${page.url()}`);

  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/questions`);
  await page.waitForURL(/\/assessment\/\d+\/questions$/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).waitFor();
  await page.getByRole('button', { name: 'Add zone', exact: true }).click();
  await page.getByRole('button', { name: 'Add question', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add question', exact: true }).click();
  await page.getByPlaceholder(/Search by QID/).fill('rectangle-area');
  await page.waitForFunction(() => /\b1\s+question(s)?\s+found/.test(document.body.innerText));
  const pickerEntry = page.getByRole('button', {
    name: /rectangle-area.*Find the area of a rectangle/,
  });
  await pickerEntry.waitFor();
  await highlight(pickerEntry);
  await shoot(page, '21-question-picker');
  await pickerEntry.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const zoneCardBottom = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).find((h) =>
      /Zone\s*1/i.test(h.textContent),
    );
    const card = heading?.closest('.card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '19-assessment-edit-mode', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (zoneCardBottom ?? 700) + 24 },
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForLoadState('networkidle');
  await seedModernAssessmentAccessViaUI(page, courseInstanceUrl, assessmentId, displayTimezone);

  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/access`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: 'Defaults' }).waitFor();
  await page.getByRole('button', { name: 'Clear' }).waitFor();
  const accessCardBottom = await page.evaluate(() => {
    const emptyOverrides = Array.from(document.querySelectorAll<HTMLElement>('main div')).find(
      (el) => el.textContent.trim() === 'No overrides configured.',
    );
    if (emptyOverrides) {
      return Math.ceil(emptyOverrides.getBoundingClientRect().bottom + 8);
    }

    const summaryContent = document.querySelector<HTMLElement>('main .p-3');
    const splitPane = document.querySelector<HTMLElement>('main .pl-ui-split-pane');
    const main = document.querySelector<HTMLElement>('main');
    const bottom = Math.max(
      summaryContent?.getBoundingClientRect().bottom ?? 0,
      splitPane?.getBoundingClientRect().bottom ?? 0,
      main?.getBoundingClientRect().bottom ?? 0,
    );
    return bottom > 0 ? Math.ceil(Math.min(bottom, document.documentElement.clientHeight)) : null;
  });
  await shoot(page, '12-assessment-access', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: accessCardBottom ?? VIEWPORT.height },
  });
}

async function seedModernAssessmentAccessViaUI(
  page: Page,
  courseInstanceUrl: string,
  assessmentId: string,
  displayTimezone: string,
) {
  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/access`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: 'Defaults' }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('heading', { name: 'Defaults' }).waitFor();

  const dateControl = page.getByLabel('Date control');
  await dateControl.check();
  await page.getByLabel('Scheduled for release').check();
  await page.getByLabel('Release date').fill(screenshotDate(displayTimezone, 2, '20:00'));
  await page.getByLabel('Due on date').check();
  await page
    .getByLabel('Due date', { exact: true })
    .fill(screenshotDate(displayTimezone, 7, '20:00'));
  await page.getByLabel('List before release').check();
  await page.getByRole('button', { name: 'Question visibility', exact: true }).click();
  await page.getByRole('option', { name: 'Show questions after completion' }).click();

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Access control updated successfully.').waitFor();
}

async function captureStudentView(page: Page) {
  console.log('Student view (menu, assessment, question)');
  await page.getByRole('button', { name: /Dev User/ }).click();
  await page.getByText('Student view without access restrictions').waitFor();
  await highlight(page.getByRole('link', { name: /Student view without access restrictions/ }));
  await shoot(page, '13-student-view-menu');

  await page.getByRole('link', { name: /Student view without access restrictions/ }).click();
  await page.waitForURL(/\/assessment(_instance)?\//);
  await page.getByRole('heading', { name: /homework1|Geometric properties/i }).waitFor();
  await highlight(page.getByRole('button', { name: /Regenerate.*assessment instance/i }));
  await shoot(page, '14-student-assessment');

  await page
    .getByRole('link', { name: /rectangle-area|Find the area/i })
    .first()
    .click();
  await page.getByRole('button', { name: /Save & Grade/ }).waitFor();
  await shoot(page, '15-student-question');
}

async function capturePublishing(page: Page, courseInstanceUrl: string) {
  console.log('Publishing settings');
  await page.getByRole('button', { name: /Dev User/ }).click();
  await page.getByRole('link', { name: /Staff view/ }).click();
  await page.goto(`${courseInstanceUrl}/instructor/instance_admin/publishing`);
  await page.getByRole('heading', { name: 'Publishing' }).waitFor();
  await highlight(page.getByLabel('Published', { exact: true }));
  await shoot(page, '16-publishing');
}

async function captureRequestCourse(page: Page) {
  console.log('Request course (dropdown + form page)');
  await page.goto('/');
  await page.getByRole('button', { name: /Dev User/ }).click();
  const menu = page.locator('.dropdown-menu.show').first();
  await menu.waitFor({ state: 'visible' });
  const courseRequestsLink = menu.getByRole('link', { name: /Course Requests/ });
  await courseRequestsLink.waitFor();
  await highlight(courseRequestsLink);
  const menuBox = await menu.boundingBox();
  const clipHeight = menuBox ? Math.ceil(menuBox.y + menuBox.height + 16) : 400;
  await shoot(page, 'requestCourseDropdown', {
    filePath: path.join(REPOSITORY_ROOT_PATH, 'docs/requestCourse/requestCourseDropdown.png'),
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: clipHeight },
  });

  await page.goto('/pl/request_course');
  await page.waitForLoadState('networkidle');
  await shoot(page, 'requestCourseForm', {
    filePath: path.join(REPOSITORY_ROOT_PATH, 'docs/requestCourse/requestCourseForm.png'),
  });
}

async function disableAdminAccess(page: Page) {
  await page.goto('/');
  await page.context().addCookies([
    { name: 'pl_access_as_administrator', value: 'inactive', url: page.url() },
    { name: 'pl2_access_as_administrator', value: 'inactive', url: page.url() },
    { name: 'pl_requested_data_changed', value: 'true', url: page.url() },
    { name: 'pl2_requested_data_changed', value: 'true', url: page.url() },
  ]);
  await page.reload({ waitUntil: 'networkidle' });

  const userNav = page.locator('#username-nav');
  await userNav.waitFor();

  if ((await userNav.getAttribute('data-access-as-administrator')) === 'true') {
    throw new Error('Set admin access cookie inactive but access_as_administrator is still true.');
  }
  console.log('  ✔ Administrator access disabled');
}

test.describe('Onboarding screenshots', () => {
  test.skip(
    !process.env.CAPTURE_SCREENSHOTS,
    'Set CAPTURE_SCREENSHOTS=1 to regenerate docs/getting-started/screenshots/*.png.',
  );
  test('capture all', async ({ page, courseInstance }) => {
    test.setTimeout(300_000);
    console.log(
      `Capturing onboarding screenshots → ${path.relative(REPOSITORY_ROOT_PATH, OUT_DIR)}/`,
    );

    await page.setViewportSize(VIEWPORT);
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    // The dev user is auto-promoted to admin (first user) but lacks course
    // permissions. Grant Owner so the home/course pages render production-equivalent
    // (no admin override required) once we disable admin access below.
    await sqldb.execute(sql.grant_dev_user_owner_on_all_courses);
    await features.enable('enhanced-access-control');

    await disableAdminAccess(page);

    const courseUrl = `/pl/course/${courseInstance.course_id}`;

    await captureHome(page);
    await captureCourseLanding(page, courseUrl);
    const courseInstanceUrl = await captureCreateInstanceModal(page, courseUrl);
    await captureStaffPage(page, courseUrl);
    await captureQuestionFlow(page, courseInstanceUrl);
    await captureAssessmentFlow(page, courseInstanceUrl, courseInstance.display_timezone);
    await captureStudentView(page);
    await capturePublishing(page, courseInstanceUrl);
    await captureRequestCourse(page);

    console.log(`✅ Captured ${shotCount} screenshots`);
  });
});
