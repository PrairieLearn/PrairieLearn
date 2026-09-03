import { createWriteStream } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { TRPCClientError } from '@trpc/client';
import { ZipArchive } from 'archiver';
import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  getCourseAdminQtiImportUrl,
  getCourseAdminQuestionsUrl,
  getCourseTrpcUrl,
} from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectOptionalQuestionByQid } from '../models/question.js';
import type { UploadResponse } from '../pages/instructorQtiImport/instructorQtiImport.types.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const COURSE_ID = '1';
const importUrl = getCourseAdminQtiImportUrl({ courseId: COURSE_ID });

async function populateOrigin(originDir: string) {
  await fs.ensureDir(originDir);
  await fs.writeJSON(path.join(originDir, 'infoCourse.json'), {
    uuid: '01234567-89ab-cdef-0123-456789abcdef',
    name: 'TEST 101',
    title: 'Test Course',
    topics: [{ name: 'Test', color: 'gray3', description: 'Test topic' }],
  });
}

/** Build a minimal QTI 1.2 quiz export zip with one multiple-choice question. */
async function buildQtiZip(destPath: string): Promise<void> {
  const qtiXml = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="test_assess_1" title="Import Quiz">
    <section ident="root_section">
      <item ident="q_mc_1" title="Sample MC Question">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>multiple_choice_question</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>1.0</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">&lt;p&gt;What color is the sky?&lt;/p&gt;</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="1001">
                <material><mattext texttype="text/plain">Blue</mattext></material>
              </response_label>
              <response_label ident="1002">
                <material><mattext texttype="text/plain">Green</mattext></material>
              </response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">1001</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
        </resprocessing>
      </item>
    </section>
  </assessment>
</questestinterop>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="test_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <resources>
    <resource identifier="test_assess_1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="test_assess_1/test_assess_1.xml"/>
    </resource>
  </resources>
</manifest>`;

  const archive = new ZipArchive();
  const output = createWriteStream(destPath);
  archive.append(manifest, { name: 'imsmanifest.xml' });
  archive.append(qtiXml, { name: 'test_assess_1/test_assess_1.xml' });
  void archive.finalize();
  await pipeline(archive, output);
}

async function uploadQtiZip(zipPath: string, courseInstanceId?: string): Promise<Response> {
  const csrfToken = generatePrefixCsrfToken(
    { url: importUrl, authn_user_id: '1' },
    config.secretKey,
  );
  const formData = new FormData();
  if (courseInstanceId != null) {
    formData.set('course_instance_id', courseInstanceId);
  }
  formData.set(
    'file',
    new Blob([await fs.readFile(zipPath)], { type: 'application/zip' }),
    path.basename(zipPath),
  );
  return await fetch(`${siteUrl}${importUrl}/upload`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, Accept: 'application/json' },
    body: formData,
  });
}

function createTrpcClient() {
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl(COURSE_ID), authn_user_id: '1' },
    config.secretKey,
  );
  return createCourseTrpcClient({ csrfToken, courseId: COURSE_ID, urlBase: siteUrl });
}

describe('QTI import into a course without course instances', { timeout: 60_000 }, () => {
  let courseRepo: CourseRepoFixture;
  let zipPath: string;
  let uploadResponse: UploadResponse;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture({ populateOrigin });
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: COURSE_ID, repository: courseRepo.courseOriginDir });

    zipPath = path.join(courseRepo.baseDir, 'qti-fixture.zip');
    await buildQtiZip(zipPath);
  });

  afterAll(helperServer.after);

  it('links to the importer from the questions page', async () => {
    const res = await fetch(`${siteUrl}${getCourseAdminQuestionsUrl({ courseId: COURSE_ID })}`);
    assert.equal(res.status, 200);
    assert.include(
      await res.text(),
      getCourseAdminQtiImportUrl({ courseId: COURSE_ID, returnTo: 'questions' }),
    );
  });

  it('renders the importer page', async () => {
    const res = await fetch(`${siteUrl}${importUrl}`);
    assert.equal(res.status, 200);
    assert.include(await res.text(), 'Import QTI content');
  });

  it('rejects an upload that targets an unknown course instance', async () => {
    const res = await uploadQtiZip(zipPath, '999');
    assert.equal(res.status, 400);
  });

  it('accepts an upload without a course instance', async () => {
    const res = await uploadQtiZip(zipPath);
    assert.equal(res.status, 200);

    uploadResponse = (await res.json()) as UploadResponse;
    assert.lengthOf(uploadResponse.results, 1);
    assert.equal(uploadResponse.results[0].sourceType, 'assessment');
    assert.lengthOf(uploadResponse.results[0].questions, 1);
    assert.deepEqual(uploadResponse.existingAssessmentLabels, []);
  });

  it('refuses to import assessments without a course instance', async () => {
    const result = uploadResponse.results[0];
    assert(result.sourceType === 'assessment');

    const error = await createTrpcClient()
      .qtiImport.create.mutate({
        courseInstanceId: null,
        assessments: [
          {
            directoryName: result.assessment.directoryName,
            infoJson: { ...result.assessment.infoJson },
            questions: result.questions.map((question) => ({
              draftId: question.draftId,
              originalDirectoryName: question.originalDirectoryName,
              directoryName: question.directoryName,
              infoJson: { ...question.infoJson },
            })),
          },
        ],
      })
      .then(
        () => null,
        (err: unknown) => err,
      );

    assert(error instanceof TRPCClientError);
    assert.equal(error.data?.code, 'BAD_REQUEST');
  });

  it('imports quiz questions as standalone questions', async () => {
    const question = uploadResponse.results[0].questions[0];

    await createTrpcClient().qtiImport.create.mutate({
      courseInstanceId: null,
      questions: [
        {
          draftId: question.draftId,
          originalDirectoryName: question.originalDirectoryName,
          directoryName: question.directoryName,
          infoJson: { ...question.infoJson },
        },
      ],
    });

    const importedQuestion = await selectOptionalQuestionByQid({
      qid: question.directoryName,
      course_id: COURSE_ID,
    });
    assert.isNotNull(importedQuestion);
    assert.equal(importedQuestion.title, 'Sample MC Question');

    await execa('git', ['pull'], { cwd: courseRepo.courseDevDir, env: process.env });
    assert.isTrue(
      await fs.pathExists(
        path.join(courseRepo.courseDevDir, 'questions', question.directoryName, 'info.json'),
      ),
    );
    assert.isFalse(await fs.pathExists(path.join(courseRepo.courseDevDir, 'courseInstances')));
  });
});
