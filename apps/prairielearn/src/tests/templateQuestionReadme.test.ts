import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { QuestionAddEditor } from '../lib/editors.js';

describe('Template question README.md handling', function () {
  let courseLiveDir: string;
  let courseOriginDir: string;
  let course: any;

  beforeAll(async () => {
    // Create a temporary directory for the test course
    const baseDir = tmp.dirSync().name;
    courseOriginDir = path.join(baseDir, 'courseOrigin');
    courseLiveDir = path.join(baseDir, 'courseLive');

    // Initialize git repo
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });
    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    // Create minimal course structure
    const infoCourse = {
      uuid: '00000000-0000-0000-0000-000000000001',
      name: 'Test Course',
      title: 'Test Course',
      timezone: 'America/Chicago',
      topics: [{ name: 'Default', description: 'Default topic' }],
      tags: [],
    };

    await fs.writeJson(path.join(courseLiveDir, 'infoCourse.json'), infoCourse);
    await fs.ensureDir(path.join(courseLiveDir, 'questions'));

    // Commit the course structure
    await execa('git', ['config', 'user.email', 'test@example.com'], {
      cwd: courseLiveDir,
      env: process.env,
    });
    await execa('git', ['config', 'user.name', 'Test User'], {
      cwd: courseLiveDir,
      env: process.env,
    });
    await execa('git', ['add', '-A'], {
      cwd: courseLiveDir,
      env: process.env,
    });
    await execa('git', ['commit', '-m', 'initial commit'], {
      cwd: courseLiveDir,
      env: process.env,
    });
    await execa('git', ['push'], {
      cwd: courseLiveDir,
      env: process.env,
    });

    // Create course object
    course = {
      id: '1',
      path: courseLiveDir,
      example_course: false,
      template_course: false,
    };
  });

  afterAll(async () => {
    // Clean up temp directory
    if (courseLiveDir) {
      await fs.remove(path.dirname(courseLiveDir));
    }
  });

  it('should not copy README.md from example course template questions', async () => {
    // Create a question from an example course template
    const editor = new QuestionAddEditor({
      locals: { course, authn_user: { user_id: '1' } } as any,
      qid: 'test_from_example_template',
      title: 'Test From Example Template',
      template_source: 'example',
      template_qid: 'template/string-input/random',
    });

    await editor.write();

    // Check that README.md was NOT copied
    const readmePath = path.join(
      courseLiveDir,
      'questions',
      'test_from_example_template',
      'README.md',
    );
    const readmeExists = await fs.pathExists(readmePath);
    assert.isFalse(readmeExists, 'README.md should not be copied from example course template');

    // Check that other files were copied
    const infoJsonPath = path.join(
      courseLiveDir,
      'questions',
      'test_from_example_template',
      'info.json',
    );
    const infoJsonExists = await fs.pathExists(infoJsonPath);
    assert.isTrue(infoJsonExists, 'info.json should be copied from template');

    const questionHtmlPath = path.join(
      courseLiveDir,
      'questions',
      'test_from_example_template',
      'question.html',
    );
    const questionHtmlExists = await fs.pathExists(questionHtmlPath);
    assert.isTrue(questionHtmlExists, 'question.html should be copied from template');
  });

  it('should copy README.md from course-specific template questions', async () => {
    // First create a course-specific template with a README.md
    const courseTemplateDir = path.join(courseLiveDir, 'questions', 'template', 'my-template');
    await fs.ensureDir(courseTemplateDir);

    const templateInfoJson = {
      uuid: '00000000-0000-0000-0000-000000000002',
      title: 'My Template',
      topic: 'Template',
      type: 'v3',
    };
    await fs.writeJson(path.join(courseTemplateDir, 'info.json'), templateInfoJson);
    await fs.writeFile(
      path.join(courseTemplateDir, 'question.html'),
      '<pl-question></pl-question>',
    );
    await fs.writeFile(path.join(courseTemplateDir, 'server.py'), '# server code');
    await fs.writeFile(
      path.join(courseTemplateDir, 'README.md'),
      'This is a course-specific template README',
    );

    // Create a question from the course-specific template
    const editor = new QuestionAddEditor({
      locals: { course, authn_user: { user_id: '1' } } as any,
      qid: 'test_from_course_template',
      title: 'Test From Course Template',
      template_source: 'course',
      template_qid: 'template/my-template',
    });

    await editor.write();

    // Check that README.md WAS copied from course-specific template
    const readmePath = path.join(
      courseLiveDir,
      'questions',
      'test_from_course_template',
      'README.md',
    );
    const readmeExists = await fs.pathExists(readmePath);
    assert.isTrue(readmeExists, 'README.md should be copied from course-specific template');

    const readmeContent = await fs.readFile(readmePath, 'utf-8');
    assert.equal(
      readmeContent,
      'This is a course-specific template README',
      'README.md content should match',
    );
  });
});
