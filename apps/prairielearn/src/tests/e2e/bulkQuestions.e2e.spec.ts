import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { selectAssessmentByTid } from '../../models/assessment.js';
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
  await page.goto(`/pl/course_instance/${courseInstanceId}/instructor/course_admin/questions`);
  const searchInput = page.getByLabel('Search by QID, title...');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(search);
}

async function selectQuestions(page: Page, qids: string[]) {
  for (const qid of qids) {
    await page.getByLabel(`Select ${qid}`, { exact: true }).check();
  }
  await expect(
    page.getByText(new RegExp(`Selected ${qids.length} of \\d+ questions`)),
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

    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: assessmentTid,
    });
    const assessmentLabel = `HW${assessmentNumber}`;
    const qids = ['addNumbers', 'addVectors'];

    await openQuestionsTable(page, courseInstance.id, 'add');
    await selectQuestions(page, qids);

    await page.getByRole('button', { name: 'Add to assessment' }).click();
    const addModal = page.getByRole('dialog', { name: 'Add selected questions to assessment' });
    await expect(addModal).toBeVisible();
    await expect(addModal.getByLabel('Course instance')).toHaveValue(courseInstance.id);
    await expect(addModal.getByLabel('Assessment')).toContainText('Bulk question table target');
    await addModal.getByLabel('Assessment').selectOption(assessment.id);
    await expect(addModal.getByLabel('Zone')).toContainText('Bulk target zone');
    await addModal.getByLabel('Zone').selectOption('1');
    await addModal.getByRole('button', { name: 'Add 2 questions' }).click();

    await expect(addModal).not.toBeVisible();
    await expect(page.getByRole('link', { name: assessmentLabel, exact: true })).toHaveCount(2);

    const savedAfterAdd = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(savedAfterAdd.zones[0].questions.map((question: { id: string }) => question.id)).toEqual(
      ['downloadFile', ...qids],
    );

    await selectQuestions(page, qids);
    const removeButton = page.getByRole('button', { name: 'Remove from assessment' });
    await expect(removeButton).toBeEnabled();
    await removeButton.click();

    const removeModal = page.getByRole('dialog', {
      name: 'Remove selected questions from assessment',
    });
    await expect(removeModal).toBeVisible();
    await removeModal.getByLabel('Assessment').selectOption(assessment.id);
    await removeModal.getByRole('button', { name: 'Remove 2 questions' }).click();

    await expect(removeModal).not.toBeVisible();
    await expect(page.getByRole('link', { name: assessmentLabel, exact: true })).toHaveCount(0);

    const savedAfterRemove = await readInfoAssessment(testCoursePath, assessmentTid);
    expect(
      savedAfterRemove.zones[0].questions.map((question: { id: string }) => question.id),
    ).toEqual(['downloadFile']);
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
});
