import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

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

async function selectQuestions(page: Page, qids: string[]) {
  for (const qid of qids) {
    await page.getByLabel(`Select ${qid}`, { exact: true }).check();
  }
  await expect(
    page.getByText(new RegExp(`Selected ${qids.length} of \\d+ questions?`)),
  ).toBeVisible();
}

test.describe('Bulk question table actions', () => {
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
    await expect(deleteModal.getByText(/assessment zones will be removed/)).toHaveCount(0);

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

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await expect(
      deleteModal.getByText(/1 assessment zone will be removed as they contain no questions/),
    ).toBeVisible();
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

  test('blocks deletion when the new first zone would have lockpoint: true', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qid = `bulkblocklockpoint${suffix}`;
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qid,
      title: 'Lockpoint blocker question',
    });

    const assessmentTid = `bulkblocklockpoint${suffix}`;
    const assessmentNumber = `8${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'Lockpoint blocker target',
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
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Delete 1 question' }).click();

    await expect(
      deleteModal.getByText(
        'This deletion would leave the following assessments in an invalid state. Remove the questions from these assessments first, then try again.',
      ),
    ).toBeVisible();
    await expect(
      deleteModal.getByRole('listitem').filter({
        hasText: `Sp15: HW${assessmentNumber} — the new first zone has lockpoint: true`,
      }),
    ).toBeVisible();
    await expect(fs.access(path.join(testCoursePath, 'questions', qid))).resolves.toBeUndefined();
    const after = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(after.zones).toHaveLength(2);
  });

  test('blocks deletion when every zone would be empty', async ({
    page,
    testCoursePath,
    courseInstance,
  }) => {
    const suffix = uniqueSuffix();
    const qid = `bulkblocknozones${suffix}`;
    await copyQuestion({
      testCoursePath,
      sourceQid: 'addNumbers',
      targetQid: qid,
      title: 'No-zones blocker question',
    });

    const assessmentTid = `bulkblocknozones${suffix}`;
    const assessmentNumber = `9${suffix.slice(0, 4)}`;
    await fs.mkdir(assessmentPath(testCoursePath, assessmentTid), { recursive: true });
    await fs.writeFile(
      infoAssessmentPath(testCoursePath, assessmentTid),
      `${JSON.stringify(
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: 'No-zones blocker target',
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
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const deleteModal = page.getByRole('dialog', { name: 'Delete selected questions' });
    await expect(deleteModal).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Delete 1 question' }).click();

    await expect(
      deleteModal.getByText(
        'This deletion would leave the following assessments in an invalid state. Remove the questions from these assessments first, then try again.',
      ),
    ).toBeVisible();
    await expect(
      deleteModal.getByRole('listitem').filter({
        hasText: `Sp15: HW${assessmentNumber} — all zones would be empty`,
      }),
    ).toBeVisible();
    await expect(fs.access(path.join(testCoursePath, 'questions', qid))).resolves.toBeUndefined();
    const after = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(after.zones).toHaveLength(1);
  });
});
