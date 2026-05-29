import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { getCourseAdminQuestionsUrl } from '../../lib/client/url.js';
import { syncCourse } from '../helperCourse.js';

import { expect, test } from './fixtures.js';

function uniqueSuffix() {
  return randomUUID().replaceAll('-', '').slice(0, 8);
}

function assessmentPath(testCoursePath: string, tid: string) {
  return path.join(testCoursePath, 'courseInstances', 'Sp15', 'assessments', tid);
}

function infoAssessmentPath(testCoursePath: string, tid: string) {
  return path.join(assessmentPath(testCoursePath, tid), 'infoAssessment.json');
}

async function readInfoAssessment(testCoursePath: string, tid: string) {
  return JSON.parse(await fs.readFile(infoAssessmentPath(testCoursePath, tid), 'utf-8'));
}

async function writeBulkAssessment({
  testCoursePath,
  tid,
  number,
}: {
  testCoursePath: string;
  tid: string;
  number: string;
}) {
  await fs.mkdir(assessmentPath(testCoursePath, tid), { recursive: true });
  await fs.writeFile(
    infoAssessmentPath(testCoursePath, tid),
    `${JSON.stringify(
      {
        uuid: randomUUID(),
        type: 'Homework',
        title: 'Bulk question table target',
        set: 'Homework',
        number,
        allowAccess: [
          {
            credit: 100,
            startDate: '2014-07-07T00:00:01',
            endDate: '2034-07-10T23:59:59',
          },
        ],
        zones: [
          {
            title: 'Bulk target zone',
            questions: [{ id: 'downloadFile', autoPoints: 1 }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await syncCourse(testCoursePath);
}

async function copyQuestion({
  testCoursePath,
  sourceQid,
  targetQid,
  title,
}: {
  testCoursePath: string;
  sourceQid: string;
  targetQid: string;
  title: string;
}) {
  const sourcePath = path.join(testCoursePath, 'questions', sourceQid);
  const targetPath = path.join(testCoursePath, 'questions', targetQid);
  await fs.cp(sourcePath, targetPath, { recursive: true });

  const infoPath = path.join(targetPath, 'info.json');
  const infoJson = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
  infoJson.uuid = randomUUID();
  infoJson.title = title;
  await fs.writeFile(infoPath, `${JSON.stringify(infoJson, null, 2)}\n`);
}

async function openQuestionsTable(page: Page, courseInstanceId: string, search: string) {
  await page.goto(getCourseAdminQuestionsUrl({ courseInstanceId }));
  const searchInput = page.getByLabel('Search by QID, title...');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(search);
}

// The assessment checklist groups assessments under collapsed `<details>`
// blocks, so their checkboxes are hidden until each group is expanded. The
// assessments load asynchronously, so wait for the first group to render.
async function expandAssessmentGroups(modal: Locator) {
  const summaries = modal.locator('summary');
  await summaries.first().waitFor();
  for (const summary of await summaries.all()) {
    await summary.click();
  }
}

async function selectQuestions(page: Page, qids: string[]) {
  for (const qid of qids) {
    await page.getByLabel(`Select ${qid}`, { exact: true }).check();
  }
  await expect(
    page.getByText(new RegExp(`Selected ${qids.length} of \\d+ questions?`)),
  ).toBeVisible();
}

test.describe('Bulk question table actions', () => {
  test('can add selected questions to an assessment and remove them again', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const assessmentTid = `hw-bulk-questions-${suffix}`;
    const assessmentNumber = `9${suffix.slice(0, 4)}`;
    await writeBulkAssessment({ testCoursePath, tid: assessmentTid, number: assessmentNumber });

    const assessmentLabel = `HW${assessmentNumber}`;
    const qids = ['addNumbers', 'addVectors'];

    await openQuestionsTable(page, courseInstance.id, 'add');
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Add to assessments' }).click();
    const addModal = page.getByRole('dialog', { name: 'Add selected questions to assessments' });
    await expect(addModal).toBeVisible();
    await expect(addModal.getByLabel('Course instance')).toHaveValue(courseInstance.id);
    await expandAssessmentGroups(addModal);
    await addModal.getByRole('checkbox', { name: assessmentLabel }).check();
    await addModal.getByRole('button', { name: 'Add to 1 assessment' }).click();

    await expect(addModal).not.toBeVisible();
    await expect(page.getByRole('link', { name: assessmentLabel, exact: true })).toHaveCount(2);

    // The added questions go into a new zone appended to the end of the
    // assessment; the existing zone is left untouched.
    const savedAfterAdd = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(savedAfterAdd.zones).toHaveLength(2);
    expect(savedAfterAdd.zones[0].questions.map((question: { id: string }) => question.id)).toEqual(
      ['downloadFile'],
    );
    expect(savedAfterAdd.zones[1].questions.map((question: { id: string }) => question.id)).toEqual(
      qids,
    );

    await selectQuestions(page, qids);
    await page.getByRole('button', { name: 'Manage questions' }).click();
    const removeMenuItem = page.getByRole('button', { name: 'Remove from assessments' });
    await expect(removeMenuItem).toBeEnabled();
    await removeMenuItem.click();

    const removeModal = page.getByRole('dialog', {
      name: 'Remove selected questions from assessments',
    });
    await expect(removeModal).toBeVisible();
    await expandAssessmentGroups(removeModal);
    await removeModal.getByRole('checkbox', { name: assessmentLabel }).check();
    await removeModal.getByRole('button', { name: 'Remove from 1 assessment' }).click();

    await expect(removeModal).not.toBeVisible();
    await expect(page.getByRole('link', { name: assessmentLabel, exact: true })).toHaveCount(0);

    const savedAfterRemove = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(
      savedAfterRemove.zones[0].questions.map((question: { id: string }) => question.id),
    ).toEqual(['downloadFile']);
  });

  test('can add selected questions to multiple assessments at once', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const tidA = `hw-bulk-multi-a-${suffix}`;
    const tidB = `hw-bulk-multi-b-${suffix}`;
    const numberA = `7${suffix.slice(0, 4)}`;
    const numberB = `6${suffix.slice(0, 4)}`;
    await writeBulkAssessment({ testCoursePath, tid: tidA, number: numberA });
    await writeBulkAssessment({ testCoursePath, tid: tidB, number: numberB });

    const qids = ['addNumbers', 'addVectors'];

    await openQuestionsTable(page, courseInstance.id, 'add');
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Add to assessments' }).click();
    const addModal = page.getByRole('dialog', { name: 'Add selected questions to assessments' });
    await expect(addModal).toBeVisible();
    await expandAssessmentGroups(addModal);
    await addModal.getByRole('checkbox', { name: `HW${numberA}` }).check();
    await addModal.getByRole('checkbox', { name: `HW${numberB}` }).check();
    await addModal.getByRole('button', { name: 'Add to 2 assessments' }).click();

    await expect(addModal).not.toBeVisible();

    // Each assessment gets the questions appended in a new trailing zone, in a
    // single sync.
    for (const tid of [tidA, tidB]) {
      const saved = await readInfoAssessment(testCoursePath, tid);
      expect(saved.zones).toHaveLength(2);
      expect(saved.zones[0].questions.map((question: { id: string }) => question.id)).toEqual([
        'downloadFile',
      ]);
      expect(saved.zones[1].questions.map((question: { id: string }) => question.id)).toEqual(qids);
    }
  });

  test('removes questions present in an assessment and reports the rest as skipped', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const assessmentTid = `hw-bulk-remove-skip-${suffix}`;
    const assessmentNumber = `6${suffix.slice(0, 4)}`;
    // The assessment references `addNumbers` but not `addVectors`, so removing
    // both selected questions should skip `addVectors`.
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Bulk remove skip target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [
            {
              title: 'Bulk target zone',
              questions: [
                { id: 'downloadFile', autoPoints: 1 },
                { id: 'addNumbers', autoPoints: 1 },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    const assessmentLabel = `HW${assessmentNumber}`;

    await openQuestionsTable(page, courseInstance.id, 'add');
    await selectQuestions(page, ['addNumbers', 'addVectors']);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    const removeMenuItem = page.getByRole('button', { name: 'Remove from assessments' });
    await expect(removeMenuItem).toBeEnabled();
    await removeMenuItem.click();

    const removeModal = page.getByRole('dialog', {
      name: 'Remove selected questions from assessments',
    });
    await expect(removeModal).toBeVisible();
    await expandAssessmentGroups(removeModal);
    await removeModal.getByRole('checkbox', { name: assessmentLabel }).check();
    await removeModal.getByRole('button', { name: 'Remove from 1 assessment' }).click();

    await expect(removeModal).not.toBeVisible();
    await expect(
      page.getByText(
        'Removed selected questions from 1 assessment. Some questions were not present in one or more assessments.',
      ),
    ).toBeVisible();

    const savedAfterRemove = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(
      savedAfterRemove.zones[0].questions.map((question: { id: string }) => question.id),
    ).toEqual(['downloadFile']);
  });

  test('can remove selected questions from multiple assessments at once', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qids = ['addNumbers', 'addVectors'];
    const tids = [`hw-bulk-remove-multi-a-${suffix}`, `hw-bulk-remove-multi-b-${suffix}`];
    const numbers = [`5${suffix.slice(0, 4)}`, `4${suffix.slice(0, 4)}`];

    for (const [index, tid] of tids.entries()) {
      // Each assessment keeps `downloadFile` alongside the selected questions, so
      // removing the selected questions never empties the zone.
      await fs.mkdir(assessmentPath(testCoursePath, tid), { recursive: true });
      await fs.writeFile(
        infoAssessmentPath(testCoursePath, tid),
        `${JSON.stringify(
          {
            uuid: randomUUID(),
            type: 'Homework',
            title: 'Bulk remove multi target',
            set: 'Homework',
            number: numbers[index],
            allowAccess: [
              { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
            ],
            zones: [
              {
                title: 'Bulk target zone',
                questions: [
                  { id: 'downloadFile', autoPoints: 1 },
                  { id: qids[0], autoPoints: 1 },
                  { id: qids[1], autoPoints: 1 },
                ],
              },
            ],
          },
          null,
          2,
        )}\n`,
      );
    }
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, 'add');
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Remove from assessments' }).click();
    const removeModal = page.getByRole('dialog', {
      name: 'Remove selected questions from assessments',
    });
    await expect(removeModal).toBeVisible();
    await expandAssessmentGroups(removeModal);
    await removeModal.getByRole('checkbox', { name: `HW${numbers[0]}` }).check();
    await removeModal.getByRole('checkbox', { name: `HW${numbers[1]}` }).check();
    await removeModal.getByRole('button', { name: 'Remove from 2 assessments' }).click();

    await expect(removeModal).not.toBeVisible();
    await expect(page.getByText('Removed selected questions from 2 assessments.')).toBeVisible();

    for (const tid of tids) {
      const saved = await readInfoAssessment(testCoursePath, tid);
      expect(saved.zones[0].questions.map((question: { id: string }) => question.id)).toEqual([
        'downloadFile',
      ]);
    }
  });

  test('removes deleted questions from referencing assessments', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qids = [`bulkdeleteref${suffix}a`, `bulkdeleteref${suffix}b`];
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qids[0],
      title: 'Bulk cascade first question',
    });
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addVectors',
      targetQid: qids[1],
      title: 'Bulk cascade second question',
    });

    const assessmentTid = `bulkdeletecascade${suffix}`;
    const assessmentNumber = `8${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Bulk cascade delete target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [
            {
              title: 'Mixed zone',
              questions: [
                { id: 'downloadFile', autoPoints: 1 },
                { id: qids[0], autoPoints: 1 },
                { id: qids[1], autoPoints: 1 },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, `bulkdeleteref${suffix}`);
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    // Both selected questions share a Mixed zone in this Sp15 assessment, so the
    // assessment badge appears under each (per-question) row.
    await expect(deleteModal.getByText('Sp15:')).toHaveCount(2);
    await expect(
      deleteModal.getByRole('link', { name: new RegExp(`^HW${assessmentNumber}$`) }),
    ).toHaveCount(2);
    // The zone still has `downloadFile`, so no zones would be emptied.
    await expect(deleteModal.getByText(/empty zones? will be removed/)).toHaveCount(0);

    await deleteModal.getByRole('button', { name: 'Delete 2 questions' }).click();
    await expect(deleteModal).not.toBeVisible();

    for (const qid of qids) {
      await expect(fs.access(path.join(testCoursePath, 'questions', qid))).rejects.toThrow();
    }

    const savedAfterDelete = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(
      savedAfterDelete.zones[0].questions.map((question: { id: string }) => question.id),
    ).toEqual(['downloadFile']);
  });

  test('warns and removes empty zones when deleting all questions in a zone', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qids = [`bulkemptyzone${suffix}a`, `bulkemptyzone${suffix}b`];
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qids[0],
      title: 'Bulk empty-zone first question',
    });
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addVectors',
      targetQid: qids[1],
      title: 'Bulk empty-zone second question',
    });

    const assessmentTid = `bulkemptyzone${suffix}`;
    const assessmentNumber = `7${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Bulk empty-zone target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [
            {
              title: 'Survivor zone',
              questions: [{ id: 'downloadFile', autoPoints: 1 }],
            },
            {
              title: 'Doomed zone',
              questions: [
                { id: qids[0], autoPoints: 1 },
                { id: qids[1], autoPoints: 1 },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, `bulkemptyzone${suffix}`);
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal.getByText(/1 empty zone will be removed/)).toBeVisible();
    // Each selected question shows the affected assessment badge with a
    // zone-removal warning (icon prefix + tooltip).
    await expect(deleteModal.getByTestId('zone-removal-marker')).toHaveCount(2);

    await deleteModal.getByRole('button', { name: 'Delete 2 questions' }).click();
    await expect(deleteModal).not.toBeVisible();

    const savedAfterDelete = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(savedAfterDelete.zones).toHaveLength(1);
    expect(savedAfterDelete.zones[0].title).toBe('Survivor zone');
  });

  test('can delete selected questions', async ({ page, testCoursePath, courseInstance }) => {
    const suffix = uniqueSuffix();
    const qids = [`bulkdelete${suffix}a`, `bulkdelete${suffix}b`];
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qids[0],
      title: 'Bulk delete first question',
    });
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addVectors',
      targetQid: qids[1],
      title: 'Bulk delete second question',
    });
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, `bulkdelete${suffix}`);
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    for (const qid of qids) {
      await expect(deleteModal.getByText(qid)).toBeVisible();
    }
    await deleteModal.getByRole('button', { name: 'Delete 2 questions' }).click();

    await expect(deleteModal).not.toBeVisible();
    await expect(page.getByText('No questions found matching your search criteria.')).toBeVisible();
    for (const qid of qids) {
      await expect(fs.access(path.join(testCoursePath, 'questions', qid))).rejects.toThrow();
    }
  });

  test('removes the lockpoint when deleting promotes a lockpoint zone to first', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qid = `bulkfixlockpoint${suffix}`;
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qid,
      title: 'Lockpoint fix question',
    });

    const assessmentTid = `bulkfixlockpoint${suffix}`;
    const assessmentNumber = `8${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Lockpoint fix target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [
            { title: 'First zone', questions: [{ id: qid, autoPoints: 1 }] },
            {
              title: 'Locked zone',
              lockpoint: true,
              questions: [{ id: 'downloadFile', autoPoints: 1 }],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, qid);
    await selectQuestions(page, [qid]);
    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal.getByText(/1 lockpoint will be moved or removed/)).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Delete 1 question' }).click();
    await expect(deleteModal).not.toBeVisible();

    await expect(fs.access(path.join(testCoursePath, 'questions', qid))).rejects.toThrow();
    const after = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(after.zones).toHaveLength(1);
    expect(after.zones[0].title).toBe('Locked zone');
    expect(after.zones[0].lockpoint).toBeFalsy();
  });

  test('deletes the question when every zone would be empty, leaving no zones', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qid = `bulkfixnozones${suffix}`;
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qid,
      title: 'No-zones fix question',
    });

    const assessmentTid = `bulkfixnozones${suffix}`;
    const assessmentNumber = `9${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'No-zones fix target',
          set: 'Homework',
          number: assessmentNumber,
          allowAccess: [
            { credit: 100, startDate: '2014-07-07T00:00:01', endDate: '2034-07-10T23:59:59' },
          ],
          zones: [{ title: 'Only zone', questions: [{ id: qid, autoPoints: 1 }] }],
        },
        null,
        2,
      )}\n`,
    );
    await syncCourse(testCoursePath);

    await openQuestionsTable(page, courseInstance.id, qid);
    await selectQuestions(page, [qid]);
    await page.getByRole('button', { name: 'Manage questions' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Delete 1 question' }).click();
    await expect(deleteModal).not.toBeVisible();

    await expect(fs.access(path.join(testCoursePath, 'questions', qid))).rejects.toThrow();
    const after = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(after.zones).toHaveLength(0);
  });
});
