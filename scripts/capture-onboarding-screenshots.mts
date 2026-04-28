#!/usr/bin/env node

/**
 * Regenerates the screenshots embedded in `docs/getStarted.md` by driving the
 * tutorial flow against a running PrairieLearn dev server.
 *
 * Usage:
 *   yarn dev                                                # in another terminal
 *   tsx scripts/capture-onboarding-screenshots.mts          # default flags
 *   tsx scripts/capture-onboarding-screenshots.mts --keep   # don't reset testCourse/
 *
 * testCourse/ is `git restore`d before and after each run so prior runs don't
 * pollute disk state. Pass --keep to bypass; the script refuses to run if
 * testCourse/ has staged changes.
 *
 * Prerequisites: dev server reachable at $BASE_URL (default http://localhost:3000)
 * with the seeded QA 101 / XC 101 courses on the home page.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, type Locator, type Page, chromium } from '@playwright/test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(REPO_ROOT, process.env.OUT_DIR ?? 'docs/getting-started');
const VIEWPORT = { width: 1440, height: 900 };
const TALL_VIEWPORT = { width: 1440, height: 1300 };

const KEEP_CHANGES = process.argv.includes('--keep');

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

interface AceEditor {
  setValue: (val: string, pos: number) => void;
  getValue: () => string;
}
interface AceWindow {
  ace: { edit: (el: HTMLElement) => AceEditor };
}

function restoreTestCourse() {
  execSync('git restore testCourse/', { cwd: REPO_ROOT, stdio: 'inherit' });
  execSync('git clean -fd testCourse/', { cwd: REPO_ROOT, stdio: 'inherit' });
}

function ensureCleanTestCourse() {
  if (KEEP_CHANGES) return;

  const status = execSync('git status --porcelain testCourse/', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stagedChanges = status
    .split('\n')
    .filter(Boolean)
    .filter((line) => line[0] !== ' ' && line[0] !== '?');
  if (stagedChanges.length > 0) {
    throw new Error(
      `Refusing to run: testCourse/ has staged changes:\n${stagedChanges.join('\n')}\n` +
        'Commit or stash them first, or pass --keep to skip the reset.',
    );
  }

  restoreTestCourse();
}

async function loadFromDisk(page: Page) {
  await page.goto(`${BASE_URL}/pl/loadFromDisk`);
  await page.waitForLoadState('networkidle');
}

let shotCount = 0;
interface ShootOpts {
  filePath?: string;
  clip?: { x: number; y: number; width: number; height: number };
  locator?: Locator;
}

// Called before highlight() and shoot() so layout measurements match the DOM that
// ends up in the screenshot. The init script in main() also hides the banner, but
// explicit removal here guards against MutationObserver timing.
async function hideDevModeBanner(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.card-header h2, .card-header').forEach((el) => {
      if ((el.textContent ?? '').trim() === 'Development Mode') {
        el.closest('.card')?.remove();
      }
    });
  });
}

async function shoot(page: Page, name: string, opts: ShootOpts = {}) {
  await hideDevModeBanner(page);
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

// Renders a fixed-position overlay on `<body>` with a high z-index so it isn't clipped
// by `overflow: hidden` ancestors (dropdowns, side panels).
async function highlight(locator: Locator, opts?: { offset?: number }) {
  const offset = opts?.offset ?? 6;
  await hideDevModeBanner(locator.page());
  await locator.first().evaluate((el, off) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const borderWidth = 3;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    // Clamp to the viewport so the box isn't cut off at screen edges.
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

async function getAceEditorContent(page: Page): Promise<string> {
  await waitForAceReady(page);
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.ace_editor');
    if (!el) throw new Error('Ace editor element not found');
    return (window as unknown as AceWindow).ace.edit(el).getValue();
  });
}

async function discoverCourseUrl(page: Page): Promise<string> {
  await page.goto(BASE_URL);
  const link = page.getByRole('link', { name: /QA 101/ }).first();
  const href = await link.getAttribute('href');
  if (!href) throw new Error('Could not find QA 101 course link on home page');
  return new URL(href, BASE_URL).toString();
}

async function captureHome(page: Page) {
  console.log('Home page');
  await page.goto(BASE_URL);
  await page.getByRole('heading', { name: 'PrairieLearn Homepage' }).waitFor();
  await highlight(page.getByRole('link', { name: /QA 101: Test Course/i }));
  // Crop to the top nav + the "Courses with instructor access" panel.
  const panelBottom = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find((a) =>
      /QA 101: Test Course/i.test(a.textContent ?? ''),
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
  // Crop below whichever is taller: the main card or the sidebar's
  // course-instance switcher (which sits below the page card here).
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
  const courseId = courseUrl.match(/\/course\/(\d+)/)?.[1];
  if (!courseId) throw new Error(`Could not extract course id from ${courseUrl}`);

  // Taller viewport so the modal (multiple per-course-instance role selects) isn't clipped.
  await page.setViewportSize(TALL_VIEWPORT);
  await page.goto(`${BASE_URL}/pl/course/${courseId}/course_admin/staff`);
  await page.getByRole('button', { name: /Add users/ }).waitFor();

  // Screenshot the filled-in modal so the doc shows how to grant the described permissions.
  await page.getByRole('button', { name: /Add users/ }).click();
  const dialog = await waitForModalShown(page);
  await dialog.getByLabel('UIDs:').fill('ta@example.com');
  await dialog.getByLabel('Course content access:').selectOption('Editor');
  await dialog.getByLabel('Role for Fa25').selectOption('Student data editor');

  await highlight(dialog.getByLabel('Role for Fa25'));
  await shoot(page, '03-staff');

  // Dismiss without submitting — no later step depends on the TA existing, and skipping
  // submission keeps the script idempotent across re-runs.
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.setViewportSize(VIEWPORT);
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
  // Actually create the instance — subsequent steps (e.g. staff capture) reference it.
  await dialog.getByRole('button', { name: 'Create' }).click();
  // Submission triggers a sync job → /pl/jobSequence/... → redirect to the new instance.
  await page.waitForURL(/\/course_instance\/\d+\b/, { timeout: 60_000 });
  const instanceId = page.url().match(/\/course_instance\/(\d+)/)?.[1];
  if (!instanceId) throw new Error(`Could not extract course instance id from ${page.url()}`);
  await page.setViewportSize(VIEWPORT);
  return `${BASE_URL}/pl/course_instance/${instanceId}`;
}

async function captureQuestionFlow(page: Page, courseInstanceUrl: string) {
  console.log('Question flow (questions list, create, edit, preview)');
  // 06: Questions list (before creating rectangle-area).
  await page.goto(`${courseInstanceUrl}/instructor/course_admin/questions`);
  await page.getByRole('heading', { name: 'Questions' }).waitFor();
  // The questions table is hydrated client-side; wait for the toolbar's create link.
  const addQuestion = page
    .locator('a[href$="/questions/create"], button[name*="add" i]')
    .filter({ hasText: /Add question/i })
    .first();
  await addQuestion.waitFor({ timeout: 60_000 });
  await highlight(addQuestion);
  await shoot(page, '06-questions');

  // 07: Create question form, filled with rectangle-area + Empty question.
  await page.goto(`${courseInstanceUrl}/instructor/course_admin/questions/create`);
  await page.getByLabel('Title').fill('Find the area of a rectangle');
  await page.getByLabel('Question identifier (QID)').fill('rectangle-area');
  await page.getByText('Empty question', { exact: true }).click();
  await page.getByText("You'll start with empty").waitFor();
  await highlight(page.getByText('Empty question', { exact: true }));
  await highlight(page.getByRole('button', { name: /Create question/ }));
  await shoot(page, '07-create-question');

  // 09: Files tab — crop to the file-list card.
  await page.getByRole('button', { name: /Create question/ }).click();
  await page.waitForURL(/\/question\/\d+/);
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await page.waitForURL(/\/file_view\b/);
  await page.getByText('question.html').waitFor();
  await highlight(page.locator('a[href*="file_edit"][href$="question.html"]'));
  const filesCardBottom = await page.evaluate(() => {
    const cell = Array.from(document.querySelectorAll('td, a')).find(
      (el) => (el.textContent ?? '').trim() === 'question.html',
    );
    const card = cell?.closest('.card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '09-question-files', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (filesCardBottom ?? 600) + 24 },
  });

  // 10: question.html editor with the MC code pasted in.
  await page
    .getByRole('link', { name: 'Edit' })
    .and(page.locator('a[href*="file_edit"][href$="question.html"]'))
    .click();
  await page.waitForURL(/\/file_edit\/.*question\.html/);
  await setAceEditorContent(page, QUESTION_HTML);
  await highlight(page.getByRole('button', { name: /Save and sync/ }));
  const editorCardBottom = await page.evaluate(() => {
    const card = document.querySelector('#file-editor-draft .card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '10-question-editor', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (editorCardBottom ?? 600) + 24 },
  });

  await page.getByRole('button', { name: /Save and sync/ }).click();
  await page.waitForLoadState('networkidle');

  // 08: Preview with a graded correct answer. pl-multiple-choice shuffles options and
  // prefixes them with "(a)", "(b)", etc., so we match the radio by trailing value.
  await page.getByRole('link', { name: 'Preview' }).click();
  await page.waitForURL(/\/preview\b/);
  await page.getByRole('button', { name: /Save & Grade/ }).waitFor();
  await page.getByRole('radio', { name: /\b20\b/ }).check();
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  // SubmissionPanel.tsx renders a "100%" badge for a correct answer; the prose
  // "Correct!" doesn't appear in the DOM.
  await page.getByText(/100%/).first().waitFor();
  await shoot(page, '08-question-preview');
}

async function captureAssessmentFlow(page: Page, courseInstanceUrl: string) {
  console.log('Assessment flow (list, create, edit, access, settings)');
  // 05: Assessments list.
  await page.goto(`${courseInstanceUrl}/instructor/instance_admin/assessments`);
  await page.getByRole('heading', { name: 'Assessments' }).waitFor();
  await shoot(page, '05-assessments');

  // 17: Create assessment modal.
  await page.getByRole('button', { name: 'Add assessment' }).click();
  const dialog = await waitForModalShown(page);
  await dialog.getByText('Create assessment').waitFor();
  await page.getByLabel('Title').fill('Geometric properties and applications');
  await page.getByLabel('Short name').fill('homework1');
  await shoot(page, '17-create-assessment');

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // Creating an assessment triggers a sync job; Playwright sees a brief /pl/jobSequence/ URL
  // before redirecting to the assessment, so wait for the assessment URL specifically.
  await page.waitForURL(/\/assessment\/\d+\b/, { timeout: 60_000 });
  const assessmentId = page.url().match(/\/assessment\/(\d+)/)?.[1];
  if (!assessmentId) throw new Error(`Could not extract assessment id from ${page.url()}`);

  // 21: Question picker. A fresh assessment has no zones, so click "Add zone" first to
  // create Zone 1, then "Add question" to open the picker.
  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/questions`);
  await page.waitForURL(/\/assessment\/\d+\/questions$/);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Save and sync' }).waitFor();
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
  // Add the question (so 19 below shows the populated zone) and exit picker.
  await pickerEntry.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // 19: Edit mode showing rectangle-area in Zone 1 — crop to the zone card.
  const zoneCardBottom = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).find((h) =>
      /Zone\s*1/i.test(h.textContent ?? ''),
    );
    const card = heading?.closest('.card');
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '19-assessment-edit-mode', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (zoneCardBottom ?? 700) + 24 },
  });

  await page.getByRole('button', { name: 'Save and sync' }).click();
  await page.waitForLoadState('networkidle');
  await editAssessmentJsonViaUI(page, courseInstanceUrl, assessmentId);

  // 12: Access tab — crop to the access-rules card.
  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/access`);
  await page.getByRole('heading', { name: /Access/ }).waitFor();
  const accessCardBottom = await page.evaluate(() => {
    const table = document.querySelector('main table');
    const card = table?.closest('.card') ?? table;
    return card ? Math.ceil(card.getBoundingClientRect().bottom) : null;
  });
  await shoot(page, '12-assessment-access', {
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: (accessCardBottom ?? 600) + 24 },
  });
}

/** Add an `allowAccess` block to infoAssessment.json by driving the in-browser file editor. */
async function editAssessmentJsonViaUI(
  page: Page,
  courseInstanceUrl: string,
  assessmentId: string,
) {
  await page.goto(`${courseInstanceUrl}/instructor/assessment/${assessmentId}/file_view`);
  await page.getByText('infoAssessment.json').waitFor();
  await page.locator('a[href*="file_edit"][href$="infoAssessment.json"]').click();
  await page.waitForURL(/\/file_edit\/.*infoAssessment\.json/);
  const current = await getAceEditorContent(page);
  const json = JSON.parse(current);
  json.allowAccess = [
    {
      startDate: '2025-09-01T20:00:00',
      endDate: '2025-09-06T20:00:00',
      credit: 100,
    },
  ];
  await setAceEditorContent(page, JSON.stringify(json, null, 2) + '\n');
  await page.getByRole('button', { name: /Save and sync/ }).click();
  await page.waitForLoadState('networkidle');
}

async function captureStudentView(page: Page) {
  console.log('Student view (menu, assessment, question)');
  // 13: Open the user dropdown (we're on the assessment access page from the prior step).
  await page.getByRole('button', { name: /Dev User/ }).click();
  await page.getByText('Student view without access restrictions').waitFor();
  await highlight(page.getByRole('link', { name: /Student view without access restrictions/ }));
  await shoot(page, '13-student-view-menu');

  // 14: Student view of the assessment — highlight the staff-only "Regenerate" affordance
  // so readers know to use it after editing.
  await page.getByRole('link', { name: /Student view without access restrictions/ }).click();
  await page.waitForURL(/\/assessment(_instance)?\//);
  await page.getByRole('heading', { name: /homework1|Geometric properties/i }).waitFor();
  await highlight(page.getByRole('button', { name: /Regenerate.*assessment instance/i }));
  await shoot(page, '14-student-assessment');

  // 15: Student view of the rectangle-area question.
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

async function captureExampleCourse(page: Page) {
  console.log('Example course (XC 101) questions');
  await page.goto(BASE_URL);
  await page
    .getByRole('link', { name: /XC 101/ })
    .first()
    .click();
  await page.waitForURL(/\/course\/\d+\/course_admin/);
  const courseId = page.url().match(/\/course\/(\d+)/)?.[1];
  if (!courseId) throw new Error('Could not find XC 101 course id');
  await page.goto(`${BASE_URL}/pl/course/${courseId}/course_admin/questions`);
  await page.getByRole('heading', { name: 'Questions' }).waitFor();
  await shoot(page, '18-example-course-questions');
}

async function captureRequestCourse(page: Page) {
  console.log('Request course (dropdown + form page)');
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: /Dev User/ }).click();
  const menu = page.locator('.dropdown-menu.show').first();
  await menu.waitFor({ state: 'visible' });
  const courseRequestsLink = menu.getByRole('link', { name: /Course Requests/ });
  await courseRequestsLink.waitFor();
  await highlight(courseRequestsLink);
  // Clip to the top of the page so the screenshot focuses on the nav + dropdown.
  const menuBox = await menu.boundingBox();
  const clipHeight = menuBox ? Math.ceil(menuBox.y + menuBox.height + 16) : 400;
  await shoot(page, 'requestCourseDropdown', {
    filePath: path.join(REPO_ROOT, 'docs/requestCourse/requestCourseDropdown.png'),
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: clipHeight },
  });

  await page.goto(`${BASE_URL}/pl/request_course`);
  await page.waitForLoadState('networkidle');
  await shoot(page, 'requestCourseForm', {
    filePath: path.join(REPO_ROOT, 'docs/requestCourse/requestCourseForm.png'),
  });
}

async function main() {
  console.log(`Capturing onboarding screenshots → ${path.relative(REPO_ROOT, OUT_DIR)}/`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Reset testCourse/: ${KEEP_CHANGES ? 'no (--keep)' : 'yes'}`);
  console.log();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  ensureCleanTestCourse();

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    // Per-navigation overrides: disable CSS animations (so modals don't render mid-fade)
    // and hide the dev-mode banner (the docs are written for production users).
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `*, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }`;
      document.documentElement.append(style);

      const hideBanner = () => {
        document.querySelectorAll('.card-header h2, .card-header').forEach((el) => {
          if ((el.textContent ?? '').trim() === 'Development Mode') {
            el.closest('.card')?.remove();
          }
        });
      };
      const start = () => {
        hideBanner();
        new MutationObserver(hideBanner).observe(document.body, {
          childList: true,
          subtree: true,
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    });

    await loadFromDisk(page);

    const courseUrl = await discoverCourseUrl(page);

    await captureHome(page);
    await captureCourseLanding(page, courseUrl);
    const courseInstanceUrl = await captureCreateInstanceModal(page, courseUrl);
    // Staff capture runs after course-instance capture so the Add users modal can grant
    // student-data access to the newly-created Fa25 instance.
    await captureStaffPage(page, courseUrl);
    await captureQuestionFlow(page, courseInstanceUrl);
    await captureAssessmentFlow(page, courseInstanceUrl);
    await captureStudentView(page);
    await capturePublishing(page, courseInstanceUrl);
    await captureExampleCourse(page);
    await captureRequestCourse(page);

    console.log();
    console.log(`✅ Captured ${shotCount} screenshots`);
  } finally {
    if (browser) await browser.close();
    if (!KEEP_CHANGES) restoreTestCourse();
  }
}

main().catch((err) => {
  console.error('\n❌ Capture failed:');
  console.error(err);
  process.exit(1);
});
