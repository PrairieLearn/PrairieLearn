// @ts-check
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import fetch from 'node-fetch';

const COURSE_URL = 'http://localhost:3000/pl/course/4';
const QUESTIONS_URL = `${COURSE_URL}/course_admin/questions`;
const QUESTION_URL_BASE = `${COURSE_URL}/question`;

async function loadQuestions() {
  const response = await fetch(QUESTIONS_URL);
  const text = await response.text();
  const $ = cheerio.load(text);
  const questionData = $('#questionsTable').attr('data-data') ?? '[]';
  return JSON.parse(questionData);
}

async function loadQuestion(id) {
  // Hardcode the variant seed for consistent results.
  const questionUrl = `${QUESTION_URL_BASE}/${id}/preview?variant_seed=1`;
  const response = await fetch(questionUrl);
  const text = await response.text();
  const $ = cheerio.load(text);
  return $('.question-body').html();
}

function sanitizeHtml(html) {
  // Replace dynamic values (UUIDs, IDs, etc.) with static placeholders.
  return html
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<UUID>')
    .replace(/(generatedFilesQuestion\/variant\/)(\d+)/, '$1<VARIANT_ID>')
    .replace(/(\/pl\/workspace\/)(\d+)/, '$1<WORKSPACE_ID>');
}

/**
 * Usage:
 *
 * ```sh
 * node tools/snapshot-question-html.mjs ./old-renderer
 * node tools/snapshot-question-html.mjs ./new-renderer
 * git diff --no-index ./old-renderer ./new-renderer
 * ```
 */
async function main() {
  const outputDir = process.argv[2];
  await fs.ensureDir(outputDir);
  console.log(`Writing HTML to ${outputDir}...`);

  const questions = await loadQuestions();

  for (const question of questions) {
    const html = await loadQuestion(question.id);
    const sanitizedHtml = sanitizeHtml(html);
    const sanitizedQid = question.qid.replaceAll('/', '_');
    await fs.writeFile(`${outputDir}/${sanitizedQid}.html`, sanitizedHtml);
    console.log(`Wrote HTML for ${question.qid} to ${sanitizedQid}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
