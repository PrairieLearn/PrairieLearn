const fetch = require('node-fetch').default;
const cheerio = require('cheerio');
const fs = require('fs-extra');

const COURSE_URL = 'http://localhost:3000/pl/course/2';
const QUESTIONS_URL = `${COURSE_URL}/course_admin/questions`;
const QUESTION_URL_BASE = `${COURSE_URL}/question`;

async function loadQuestions() {
  const response = await fetch(QUESTIONS_URL);
  const text = await response.text();
  const $ = cheerio.load(text);
  const questionData = $('#questionsTable').attr('data-data');
  return JSON.parse(questionData);
}

async function loadQuestion(id) {
  const questionUrl = `${QUESTION_URL_BASE}/${id}/preview`;
  const response = await fetch(questionUrl);
  const text = await response.text();
  const $ = cheerio.load(text);
  return $('.question-body').html();
}

async function main() {
  const outputDir = process.argv[2];
  await fs.ensureDir(outputDir);
  console.log(`Writing HTML to ${outputDir}...`);

  const questions = await loadQuestions();

  for (const question of questions) {
    const html = await loadQuestion(question.id);
    const sanitizedQid = question.qid.replaceAll('/', '_');
    await fs.writeFile(`${outputDir}/${sanitizedQid}.html`, html);
    console.log(`Wrote HTML for ${question.qid} to ${sanitizedQid}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
