import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, assert, beforeEach, describe, it } from 'vitest';

import { detectCourseExport, findQtiFilesFromManifest, findQtiXmlFiles } from './course-export.js';

// Minimal Canvas IMS CC manifest with two assessment resources:
// one with a non_cc_assessments companion, one without.
const CANVAS_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course1" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata>
    <lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string language="en-US">Test Course</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <resources>
    <resource identifier="quiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="quiz1/assessment_qti.xml"/>
      <dependency identifierref="quiz1_meta"/>
    </resource>
    <resource identifier="quiz1_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="quiz1/assessment_meta.xml">
      <file href="quiz1/assessment_meta.xml"/>
      <file href="non_cc_assessments/quiz1.xml.qti"/>
    </resource>
    <resource identifier="quiz2" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
      <file href="quiz2/assessment_qti.xml"/>
      <dependency identifierref="quiz2_meta"/>
    </resource>
    <resource identifier="quiz2_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="quiz2/assessment_meta.xml">
      <file href="quiz2/assessment_meta.xml"/>
    </resource>
    <resource identifier="bank1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/bank1.xml.qti">
      <file href="non_cc_assessments/bank1.xml.qti"/>
    </resource>
    <resource identifier="other" type="webcontent" href="some/page.html">
      <file href="some/page.html"/>
    </resource>
  </resources>
</manifest>`;

// Standard IMS QTI manifest (non-Canvas): href on <resource> directly, no dependency.
const STANDARD_IMS_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="std1">
  <resources>
    <resource identifier="assess1" type="imsqti_xmlv1p2/assessment" href="assessments/quiz.xml"/>
    <resource identifier="nonqti" type="webcontent" href="page.html"/>
  </resources>
</manifest>`;

const COURSE_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<course>
  <title>XC 101: Example Course</title>
  <course_code>XC101</course_code>
  <timezone>America/Chicago</timezone>
</course>`;

const MANIFEST_TITLE_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<manifest>
  <metadata>
    <lom:lom xmlns:lom="http://ltsc.ieee.org/xsd/LOM">
      <lom:general>
        <lom:title>
          <lom:string>Manifest Title Course</lom:string>
        </lom:title>
      </lom:general>
    </lom:lom>
  </metadata>
  <resources/>
</manifest>`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp('course-export-test-');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function mkdtemp(prefix: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `${prefix}${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// detectCourseExport
// ---------------------------------------------------------------------------

describe('detectCourseExport', () => {
  it('returns null when no imsmanifest.xml exists', async () => {
    const result = await detectCourseExport(tmpDir);
    assert.isNull(result);
  });

  it('returns null when imsmanifest.xml has no title', async () => {
    await writeFile(
      path.join(tmpDir, 'imsmanifest.xml'),
      '<?xml version="1.0"?><manifest><resources/></manifest>',
    );
    const result = await detectCourseExport(tmpDir);
    assert.isNull(result);
  });

  it('extracts title, courseCode, and timezone from course_settings.xml', async () => {
    await writeFile(path.join(tmpDir, 'imsmanifest.xml'), MANIFEST_TITLE_ONLY);
    await mkdir(path.join(tmpDir, 'course_settings'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'course_settings', 'course_settings.xml'),
      COURSE_SETTINGS_XML,
    );

    const result = await detectCourseExport(tmpDir);
    assert.deepEqual(result, {
      title: 'XC 101: Example Course',
      courseCode: 'XC101',
      timezone: 'America/Chicago',
    });
  });

  it('falls back to manifest title when course_settings.xml is absent', async () => {
    await writeFile(path.join(tmpDir, 'imsmanifest.xml'), MANIFEST_TITLE_ONLY);

    const result = await detectCourseExport(tmpDir);
    assert.deepEqual(result, { title: 'Manifest Title Course' });
  });

  it('falls back to manifest title when course_settings.xml has no title', async () => {
    await writeFile(path.join(tmpDir, 'imsmanifest.xml'), MANIFEST_TITLE_ONLY);
    await mkdir(path.join(tmpDir, 'course_settings'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'course_settings', 'course_settings.xml'),
      '<?xml version="1.0"?><course><timezone>America/Denver</timezone></course>',
    );

    const result = await detectCourseExport(tmpDir);
    assert.deepEqual(result, { title: 'Manifest Title Course' });
  });
});

// ---------------------------------------------------------------------------
// findQtiFilesFromManifest
// ---------------------------------------------------------------------------

describe('findQtiFilesFromManifest', () => {
  it('returns [] when no imsmanifest.xml exists', async () => {
    const result = await findQtiFilesFromManifest(tmpDir);
    assert.deepEqual(result, []);
  });

  it('returns [] when manifest has no QTI content resources', async () => {
    await writeFile(
      path.join(tmpDir, 'imsmanifest.xml'),
      `<?xml version="1.0"?><manifest><resources>
        <resource identifier="r1" type="webcontent" href="page.html"/>
      </resources></manifest>`,
    );
    const result = await findQtiFilesFromManifest(tmpDir);
    assert.deepEqual(result, []);
  });

  describe('Canvas course export (IMS CC)', () => {
    beforeEach(async () => {
      await writeFile(path.join(tmpDir, 'imsmanifest.xml'), CANVAS_MANIFEST);
    });

    it('prefers non_cc_assessments QTI when dependency lists one', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      const quiz1 = entries.find((e) => e.qtiPath.includes('quiz1'));
      assert.ok(quiz1, 'quiz1 entry should be present');
      assert.include(quiz1.qtiPath, path.join('non_cc_assessments', 'quiz1.xml.qti'));
    });

    it('sets assessmentDir to the CC QTI directory (not non_cc_assessments)', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      const quiz1 = entries.find((e) => e.qtiPath.includes('quiz1'));
      assert.ok(quiz1);
      assert.equal(quiz1.assessmentDir, path.join(tmpDir, 'quiz1'));
    });

    it('falls back to CC QTI when dependency has no non_cc_assessments file', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      const quiz2 = entries.find((e) => e.assessmentDir.endsWith('quiz2'));
      assert.ok(quiz2, 'quiz2 entry should be present');
      assert.include(quiz2.qtiPath, path.join('quiz2', 'assessment_qti.xml'));
    });

    it('sets assessmentDir correctly for the CC fallback case', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      const quiz2 = entries.find((e) => e.assessmentDir.endsWith('quiz2'));
      assert.ok(quiz2);
      assert.equal(quiz2.assessmentDir, path.join(tmpDir, 'quiz2'));
    });

    it('skips non-QTI web resources', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      assert.isTrue(
        entries.every((e) => !e.qtiPath.includes('page.html')),
        'should not include webcontent resource',
      );
    });

    it('returns one entry per QTI content resource', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      assert.equal(entries.filter((e) => !e.qtiPath.includes('bank1')).length, 2);
    });

    it('includes standalone non_cc_assessments object banks', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      const bank = entries.find((e) => e.qtiPath.includes('bank1'));
      assert.ok(bank);
      assert.equal(bank.qtiPath, path.join(tmpDir, 'non_cc_assessments', 'bank1.xml.qti'));
      assert.equal(bank.assessmentDir, path.join(tmpDir, 'non_cc_assessments'));
    });
  });

  describe('standard IMS QTI manifest (non-Canvas)', () => {
    beforeEach(async () => {
      await writeFile(path.join(tmpDir, 'imsmanifest.xml'), STANDARD_IMS_MANIFEST);
    });

    it('resolves QTI path from href on <resource> when no <file> child', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      assert.equal(entries.length, 1);
      assert.include(entries[0].qtiPath, path.join('assessments', 'quiz.xml'));
    });

    it('sets assessmentDir to the directory of the resource href', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      assert.equal(entries[0].assessmentDir, path.join(tmpDir, 'assessments'));
    });

    it('skips non-QTI resources', async () => {
      const entries = await findQtiFilesFromManifest(tmpDir);
      assert.isTrue(entries.every((e) => !e.qtiPath.includes('page.html')));
    });
  });

  it('resolves QTI object bank resources', async () => {
    await writeFile(
      path.join(tmpDir, 'imsmanifest.xml'),
      `<?xml version="1.0"?><manifest><resources>
        <resource identifier="bank1" type="imsqti_xmlv1p2/objectbank" href="banks/bank1.xml.qti"/>
      </resources></manifest>`,
    );

    const entries = await findQtiFilesFromManifest(tmpDir);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].qtiPath, path.join(tmpDir, 'banks', 'bank1.xml.qti'));
    assert.equal(entries[0].assessmentDir, path.join(tmpDir, 'banks'));
  });

  it('resolves Canvas quiz-export resources typed only as imsqti_xmlv1p2', async () => {
    await writeFile(
      path.join(tmpDir, 'imsmanifest.xml'),
      `<?xml version="1.0"?><manifest><resources>
        <resource identifier="quiz1" type="imsqti_xmlv1p2">
          <file href="quiz1/quiz1.xml"/>
        </resource>
      </resources></manifest>`,
    );

    const entries = await findQtiFilesFromManifest(tmpDir);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].qtiPath, path.join(tmpDir, 'quiz1', 'quiz1.xml'));
    assert.equal(entries[0].assessmentDir, path.join(tmpDir, 'quiz1'));
  });
});

describe('findQtiXmlFiles', () => {
  it('finds direct QTI XML files when no manifest exists', async () => {
    await writeFile(path.join(tmpDir, 'quiz.xml'), '<questestinterop/>');

    const result = await findQtiXmlFiles(tmpDir);

    assert.deepEqual(result, [path.join(tmpDir, 'quiz.xml')]);
  });

  it('ignores known non-QTI XML files', async () => {
    await writeFile(path.join(tmpDir, 'assessment_meta.xml'), '<quiz/>');
    await writeFile(path.join(tmpDir, 'imsmanifest.xml'), '<manifest/>');

    const result = await findQtiXmlFiles(tmpDir);

    assert.deepEqual(result, []);
  });

  it('finds QTI XML files one directory deep', async () => {
    await mkdir(path.join(tmpDir, 'bank'), { recursive: true });
    await writeFile(path.join(tmpDir, 'bank', 'bank.xml'), '<questestinterop/>');

    const result = await findQtiXmlFiles(tmpDir);

    assert.deepEqual(result, [path.join(tmpDir, 'bank', 'bank.xml')]);
  });

  it('finds QTI .xml.qti files one directory deep', async () => {
    await mkdir(path.join(tmpDir, 'non_cc_assessments'), { recursive: true });
    await writeFile(path.join(tmpDir, 'non_cc_assessments', 'bank.xml.qti'), '<questestinterop/>');

    const result = await findQtiXmlFiles(tmpDir);

    assert.deepEqual(result, [path.join(tmpDir, 'non_cc_assessments', 'bank.xml.qti')]);
  });
});
