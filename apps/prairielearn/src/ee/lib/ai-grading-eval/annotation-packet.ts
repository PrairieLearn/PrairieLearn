import path from 'node:path';

import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import { markdownToHtml } from '@prairielearn/markdown';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type Course, InstanceQuestionSchema, type User } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { type ServerJob } from '../../../lib/server-jobs.js';
import * as questionServers from '../../../question-servers/index.js';
import { type AiGradingModelId } from '../ai-grading/ai-grading-models.shared.js';
import { selectLastVariantAndSubmission } from '../ai-grading/ai-grading-util.js';

import { type ClassifiedCase } from './classify.js';
import { type LoadedEval, type RubricItem } from './manifest.js';
import { type ResolvedTarget } from './resolve-target.js';
import { encodeDescriptions } from './verdicts.js';

const sql = loadSqlEquiv(import.meta.url);

const InstanceQuestionRowSchema = z.object({
  instance_question: InstanceQuestionSchema,
  submission_identifier: z.string(),
});

interface ClassifiedCaseInput {
  case_data: ClassifiedCase;
  models: AiGradingModelId[];
}

interface RenderedCase {
  case_id: string;
  submission_id: string;
  submission_identifier: string;
  ai_descriptions: string[];
  ai_explanation: string | null;
  classification: 'correct' | 'incorrect' | 'unsure';
  verdict_source: string;
  question_html: string;
  answer_html: string;
}

export async function generateAnnotationPacket({
  loadedEval,
  cases,
  target,
  course,
  user,
  packetDir,
  job,
}: {
  loadedEval: LoadedEval;
  cases: ClassifiedCaseInput[];
  target: ResolvedTarget;
  course: Course;
  user: User;
  packetDir: string;
  job: ServerJob;
}): Promise<string> {
  // Only render question HTML for the unsure cases (the only ones the annotator
  // sees in the UI). Auto-classified cases are still embedded so the exported
  // CSV groups them, but they don't need rendered prose.
  const unsureCases = cases.filter((c) => c.case_data.classification === 'unsure');
  const identifiers = [...new Set(unsureCases.map((c) => c.case_data.submission_identifier))];
  const rows = await queryRows(
    sql.select_instance_questions_for_identifiers,
    {
      assessment_question_id: target.assessment_question.id,
      submission_identifiers: identifiers,
    },
    InstanceQuestionRowSchema,
  );
  const rowByIdentifier = new Map(rows.map((r) => [r.submission_identifier, r]));

  const question_course = await getQuestionCourse(target.question, course);
  const questionModule = questionServers.getModule(target.question.type);
  const urlPrefix = `/pl/course_instance/${target.course_instance.id}/instructor`;

  const renderedCases: RenderedCase[] = [];
  for (const entry of cases) {
    const c = entry.case_data;
    const row = rowByIdentifier.get(c.submission_identifier);
    let submission_id = '';
    let questionHtml = '';
    let answerHtml = '';

    // Only the unsure cases get rendered question/answer/image HTML — that's
    // what the annotator sees. Auto-classified cases are recorded so they
    // make it into the CSV but don't need rendered prose.
    if (c.classification === 'unsure' && row) {
      const { variant, submission } = await selectLastVariantAndSubmission(
        row.instance_question.id,
      );
      submission_id = submission.id;

      const locals = {
        ...buildQuestionUrls(urlPrefix, variant, target.question, row.instance_question),
        urlPrefix,
        showCorrectAnswer: true,
        allowAnswerEditing: false,
        questionRenderContext: 'manual_grading' as const,
      };

      const renderQuestion = await questionModule.render({
        renderSelection: { question: true, submissions: false, answer: true },
        variant,
        question: target.question,
        submission: null,
        submissions: [],
        course: question_course,
        locals,
      });
      if (renderQuestion.courseIssues.length > 0) {
        logger.error(
          `Annotation packet render issues for ${c.submission_identifier}: ` +
            renderQuestion.courseIssues.toString(),
        );
      }

      questionHtml = inlineImageCaptures(
        renderQuestion.data.questionHtml,
        submission.submitted_answer,
      );
      answerHtml = renderQuestion.data.answerHtml;
    } else if (c.classification === 'unsure' && !row) {
      job.warn(
        `Annotation packet: could not resolve instance question for ${c.submission_identifier}; skipping.`,
      );
      continue;
    }

    renderedCases.push({
      case_id: c.case_id,
      submission_id,
      submission_identifier: c.submission_identifier,
      ai_descriptions: c.ai_descriptions,
      ai_explanation: c.ai_explanation,
      classification: c.classification,
      verdict_source: c.verdict_source,
      question_html: questionHtml,
      answer_html: answerHtml,
    });
  }

  await fs.ensureDir(packetDir);
  const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\..*$/, '');
  const evalSlug = loadedEval.entry.id.replaceAll('/', '__');
  const packetPath = path.join(packetDir, `${evalSlug}-${timestamp}.html`);

  await fs.writeFile(
    packetPath,
    renderPacketHtml({
      evalId: loadedEval.entry.id,
      timestamp,
      user,
      rubricItems: loadedEval.rubric.rubric_items,
      cases: renderedCases,
    }),
    'utf8',
  );
  job.info(`Annotation packet for ${loadedEval.entry.id}: ${packetPath}`);
  return packetPath;
}

/**
 * Walks the rendered HTML for `<pl-image-capture>` placeholder divs and replaces
 * each with an inline base64 `<img>` tag (so the packet renders offline without
 * the PL server's authenticated image fetch). Tolerates placeholders without a
 * `data-file-name` attribute by falling back to the first file in `_files`;
 * removes the placeholder entirely when no submitted file is available.
 */
function inlineImageCaptures(
  htmlString: string,
  submitted_answer: Record<string, any> | null,
): string {
  if (!htmlString) return '';
  const $ = cheerio.load(htmlString);
  const elements = $('[data-image-capture-uuid]');
  if (elements.length === 0) return htmlString;

  const files: { name: string; contents: string }[] = submitted_answer?._files ?? [];
  const filesByName = new Map(files.map((f) => [f.name, f.contents]));

  elements.each((_, el) => {
    const $el = $(el);
    const explicitName = $el.data('file-name');
    const options = $el.data('options') as Record<string, string> | undefined;
    const fileName =
      (typeof explicitName === 'string' && explicitName.trim()) ||
      options?.submitted_file_name ||
      files[0]?.name ||
      null;
    const fileData = fileName ? (filesByName.get(fileName) ?? null) : null;
    if (fileData) {
      $el.replaceWith(
        `<img class="img-fluid border rounded mb-2" alt="${escapeAttr(fileName ?? '')}" src="data:image/jpeg;base64,${fileData}" />`,
      );
    } else {
      $el.remove();
    }
  });

  return $('body').html() ?? '';
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  return String(points);
}

function renderRubricTable(
  rubricItems: RubricItem[],
  aiSelected: Set<string>,
): ReturnType<typeof html> {
  if (rubricItems.length === 0) {
    return html`<p class="text-muted mb-0">(no rubric items)</p>`;
  }
  return html`<div class="table-responsive">
    <table class="table table-sm align-middle mb-0">
      <thead>
        <tr>
          <th style="width: 3rem;" class="text-center">AI</th>
          <th>Description</th>
          <th style="width: 4rem;">Points</th>
        </tr>
      </thead>
      <tbody>
        ${rubricItems.map(
          (item) => html`
            <tr>
              <td class="text-center align-top">
                ${aiSelected.has(item.description)
                  ? html`<span class="text-success fw-bold">✓</span>`
                  : ''}
              </td>
              <td>
                <div class="fw-medium rubric-description">
                  ${unsafeHtml(markdownToHtml(item.description, { inline: true }))}
                </div>
                ${item.grader_note
                  ? html`<div class="rubric-detail">
                      <span class="rubric-detail-label">Grader note</span>
                      <div class="rubric-md">${unsafeHtml(markdownToHtml(item.grader_note))}</div>
                    </div>`
                  : ''}
                ${item.explanation
                  ? html`<div class="rubric-detail">
                      <span class="rubric-detail-label">Explanation</span>
                      <div class="rubric-md">${unsafeHtml(markdownToHtml(item.explanation))}</div>
                    </div>`
                  : ''}
              </td>
              <td class="align-top">
                <span class="badge bg-secondary">${formatPoints(item.points)}</span>
              </td>
            </tr>
          `,
        )}
      </tbody>
    </table>
  </div>`;
}

function renderPacketHtml({
  evalId,
  timestamp,
  user,
  rubricItems,
  cases,
}: {
  evalId: string;
  timestamp: string;
  user: User;
  rubricItems: RubricItem[];
  cases: RenderedCase[];
}): string {
  // Embed every classified case (correct + incorrect + unsure) so the exported
  // CSV groups everything by classification source. The UI only renders unsure
  // cases (filtered below in renderCaseCard mapping) — annotator-graded results
  // are still written to localStorage / CSV under the same case_id.
  const packetMeta = {
    eval_id: evalId,
    timestamp,
    generated_by: user.uid,
    cases: cases.map((c) => ({
      case_id: c.case_id,
      submission_identifier: c.submission_identifier,
      rubric_descriptions: c.ai_descriptions.join('|'),
      classification: c.classification,
      verdict_source: c.verdict_source,
    })),
  };
  // Dedupe unsure cases by submission so the annotator sees one card per
  // submission even when multiple models flagged it with different rubric
  // selections. The first encountered case_id stays "primary" for display
  // (its AI selection / explanation drive the card); every duplicate
  // case_id is bundled so the exported CSV emits one row per case_id with
  // the annotator's verdict applied uniformly.
  const bundledBySubmission = new Map<string, RenderedCase & { bundled_case_ids: string[] }>();
  for (const c of cases) {
    if (c.classification !== 'unsure') continue;
    const existing = bundledBySubmission.get(c.submission_identifier);
    if (existing) {
      if (!existing.bundled_case_ids.includes(c.case_id)) {
        existing.bundled_case_ids.push(c.case_id);
      }
    } else {
      bundledBySubmission.set(c.submission_identifier, {
        ...c,
        bundled_case_ids: [c.case_id],
      });
    }
  }
  const unsureCases = [...bundledBySubmission.values()];

  const document = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AI grading verdicts — ${evalId}</title>
        <script>
          // Mirrors PL's runtime MathJax config (apps/prairielearn/src/lib/client/mathjax.ts).
          window.MathJax = {
            options: {
              ignoreHtmlClass: 'mathjax_ignore|tex2jax_ignore',
              processHtmlClass: 'mathjax_process',
            },
            tex: {
              inlineMath: [
                ['$', '$'],
                ['\\(', '\\)'],
              ],
            },
            svg: { blacker: 13, linebreaks: { inline: false } },
            loader: { load: ['input/tex', 'ui/menu', 'output/svg'] },
          };
        </script>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        />
        <style>
          body {
            background: #f4f4f6;
          }
          .case-card {
            scroll-margin-top: 4rem;
            transition: border-color 0.4s ease;
          }
          .panel-heading {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #6c757d;
          }
          .rich-content {
            font-size: 0.95rem;
          }
          .rich-content img {
            max-width: 100%;
          }
          .verdict-card {
            border: 2px solid var(--bs-primary);
            background: #fff;
          }
          .verdict-card .btn {
            min-width: 6rem;
          }
          pre.ai-explanation {
            font-family: inherit;
            font-size: 0.95rem;
            color: inherit;
          }
          .rubric-detail {
            margin-top: 0.5rem;
            font-size: 0.85rem;
            line-height: 1.4;
            color: #495057;
          }
          .rubric-detail-label {
            display: inline-block;
            margin-right: 0.4rem;
            margin-bottom: 0.2rem;
            padding: 0.05rem 0.4rem;
            background: #e9ecef;
            color: #495057;
            border-radius: 0.25rem;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
            vertical-align: middle;
          }
          .rubric-md {
            color: #495057;
          }
          .rubric-md > :first-child {
            margin-top: 0;
          }
          .rubric-md > :last-child {
            margin-bottom: 0;
          }
          .rubric-md p,
          .rubric-md ul,
          .rubric-md ol {
            margin-bottom: 0.4rem;
          }
          .rubric-description p {
            display: inline;
            margin: 0;
          }
          .table > tbody > tr > td {
            padding-top: 0.5rem;
            padding-bottom: 0.5rem;
            vertical-align: top;
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/mathjax@4.1.2/tex-svg.js" defer></script>
      </head>
      <body class="mathjax_process">
        <div class="container-fluid py-3" style="max-width: 1400px;">
          <h1 class="h4 mb-2">${evalId}</h1>
          <p class="mb-1"><strong>Select whether or not each grading is correct.</strong></p>
          <p class="mb-1 text-muted">All decisions autosave in your browser.</p>
          <p class="mb-4 text-muted">
            When done, click <strong>Export CSV</strong> at the bottom of the page.
          </p>

          ${unsureCases.map((c, idx) => renderCaseCard(c, idx, unsureCases.length, rubricItems))}

          <div class="text-center py-4">
            <p class="text-muted mb-3">
              Reached the end — your decisions are saved in this browser. Export the CSV to send
              back.
            </p>
            <button type="button" id="btn-export-bottom" class="btn btn-primary btn-lg">
              Export CSV
            </button>
          </div>
        </div>

        <script id="packet-meta" type="application/json">
          ${unsafeHtml(JSON.stringify(packetMeta))}
        </script>
        <script>
          ${unsafeHtml(packetJs())};
        </script>
      </body>
    </html>`;

  return document.toString();
}

function renderCaseCard(
  c: RenderedCase & { bundled_case_ids?: string[] },
  idx: number,
  total: number,
  rubricItems: RubricItem[],
): ReturnType<typeof html> {
  const rubricEncoded = encodeDescriptions(c.ai_descriptions);
  const aiSelected = new Set(c.ai_descriptions);
  const bundled = (c.bundled_case_ids ?? [c.case_id]).join(',');
  return html`
    <div
      class="card case-card mb-4"
      id="case-${c.case_id}"
      data-case-id="${c.case_id}"
      data-bundled-case-ids="${bundled}"
      data-submission-identifier="${c.submission_identifier}"
      data-rubric-descriptions="${rubricEncoded}"
    >
      <div class="card-header d-flex align-items-center gap-2 flex-wrap">
        <span class="badge bg-secondary">${idx + 1}/${total}</span>
        <code title="Submission identifier from submissions.csv (stable across runs)"
          >${c.submission_identifier}</code
        >
        <span
          class="text-muted small"
          title="Stable case id = hash(eval_id + submission + AI selection)"
        >
          case ${c.case_id.slice(0, 10)}
        </span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-lg-7">
            <div class="panel-heading mb-1">Question</div>
            <div class="rich-content border rounded p-2 bg-light">
              ${unsafeHtml(c.question_html)}
            </div>
            ${c.answer_html
              ? html`
                  <div class="panel-heading mt-3 mb-1">Solution</div>
                  <div class="rich-content border rounded p-2 bg-light">
                    ${unsafeHtml(c.answer_html)}
                  </div>
                `
              : ''}
            ${c.ai_explanation
              ? html`
                  <div class="panel-heading mt-3 mb-1">AI explanation</div>
                  <div class="border rounded p-2 bg-light">
                    <pre
                      class="ai-explanation mb-0 overflow-visible mathjax_process"
                      style="white-space: pre-wrap;"
                    >
${c.ai_explanation}</pre
                    >
                  </div>
                `
              : ''}
          </div>
          <div class="col-lg-5">
            <div class="grading-panel">
              <div class="panel-heading mb-1">Grading</div>
              ${renderRubricTable(rubricItems, aiSelected)}

              <div class="card verdict-card mt-4">
                <div class="card-body">
                  <h6 class="card-title mb-3">Is this grading correct?</h6>
                  <div class="d-flex flex-wrap gap-2" role="group" aria-label="Verdict">
                    <button
                      type="button"
                      class="btn btn-outline-success verdict-btn"
                      data-verdict="correct"
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-danger verdict-btn"
                      data-verdict="incorrect"
                    >
                      Incorrect
                    </button>
                  </div>
                  <textarea
                    class="form-control mt-3 notes-field"
                    rows="2"
                    placeholder="Notes (optional)"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function packetJs(): string {
  return `
    (function () {
      const meta = JSON.parse(document.getElementById('packet-meta').textContent);
      const storageKey = 'pl-ai-eval-verdicts::' + meta.eval_id + '::' + meta.timestamp;
      const state = loadState();
      const VERDICT_COLORS = { correct: 'success', incorrect: 'danger' };

      function loadState() {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return {};
          return JSON.parse(raw);
        } catch (e) {
          return {};
        }
      }
      function saveState() {
        localStorage.setItem(storageKey, JSON.stringify(state));
      }

      function setButtonState(btn, isActive) {
        const color = VERDICT_COLORS[btn.dataset.verdict];
        if (!color) return;
        btn.classList.remove('btn-' + color, 'btn-outline-' + color, 'active');
        btn.classList.add(isActive ? 'btn-' + color : 'btn-outline-' + color);
        if (isActive) btn.classList.add('active');
      }

      function applyToUi() {
        document.querySelectorAll('.case-card').forEach((card) => {
          const caseId = card.dataset.caseId;
          const entry = state[caseId];
          card.querySelectorAll('.verdict-btn').forEach((btn) => {
            setButtonState(btn, !!entry && btn.dataset.verdict === entry.verdict);
          });
          const notes = card.querySelector('.notes-field');
          if (notes && entry && entry.notes != null) notes.value = entry.notes;
        });
      }

      document.querySelectorAll('.verdict-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.case-card');
          const caseId = card.dataset.caseId;
          const notes = card.querySelector('.notes-field')?.value ?? '';
          state[caseId] = {
            verdict: btn.dataset.verdict,
            notes,
            submission_identifier: card.dataset.submissionIdentifier,
            rubric_descriptions: card.dataset.rubricDescriptions,
            updated_at: new Date().toISOString(),
          };
          saveState();
          applyToUi();
        });
      });

      document.querySelectorAll('.notes-field').forEach((field) => {
        field.addEventListener('input', () => {
          const card = field.closest('.case-card');
          const caseId = card.dataset.caseId;
          if (!state[caseId]) return;
          state[caseId].notes = field.value;
          state[caseId].updated_at = new Date().toISOString();
          saveState();
        });
      });

      function firstUngradedCard() {
        return [...document.querySelectorAll('.case-card')].find((c) => {
          const entry = state[c.dataset.caseId];
          return !entry || (entry.verdict !== 'correct' && entry.verdict !== 'incorrect');
        });
      }

      function exportCsv() {
        const rows = [];
        rows.push([
          'eval_id',
          'case_id',
          'submission_identifier',
          'rubric_descriptions',
          'verdict',
          'classification_source',
          'annotator',
          'timestamp',
          'notes',
        ]);
        const annotatorByCase = state || {};
        const exportedIds = new Set();
        // Emit annotator-graded unsure cases first. When a card bundles
        // multiple case_ids (multiple models flagged the same submission
        // with different selections), emit one CSV row per bundled case_id
        // so the verdict applies to every grading variant.
        document.querySelectorAll('.case-card').forEach((card) => {
          const primaryCaseId = card.dataset.caseId;
          const entry = annotatorByCase[primaryCaseId];
          if (!entry || !entry.verdict) return;
          const bundled = (card.dataset.bundledCaseIds || primaryCaseId)
            .split(',')
            .filter((id) => id.length > 0);
          for (const caseId of bundled) {
            if (exportedIds.has(caseId)) continue;
            exportedIds.add(caseId);
            rows.push([
              meta.eval_id,
              caseId,
              entry.submission_identifier,
              entry.rubric_descriptions,
              entry.verdict,
              'annotator',
              '',
              entry.updated_at,
              entry.notes ?? '',
            ]);
          }
        });
        // Then emit the auto-classified cases (correct / incorrect) embedded
        // in packet meta so the CSV is a complete record of this run.
        (meta.cases || []).forEach((c) => {
          if (c.classification !== 'correct' && c.classification !== 'incorrect') return;
          if (exportedIds.has(c.case_id)) return;
          rows.push([
            meta.eval_id,
            c.case_id,
            c.submission_identifier,
            c.rubric_descriptions,
            c.classification,
            'auto:' + (c.verdict_source || 'unknown'),
            '',
            meta.timestamp,
            '',
          ]);
        });
        const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = meta.eval_id.replace(/\\//g, '__') + '-verdicts-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      function onExportClick() {
        const pending = firstUngradedCard();
        if (pending) {
          pending.scrollIntoView({ behavior: 'smooth', block: 'start' });
          pending.classList.add('border-warning');
          setTimeout(() => pending.classList.remove('border-warning'), 1500);
          return;
        }
        exportCsv();
      }

      document.getElementById('btn-export-bottom').addEventListener('click', onExportClick);

      function csvEscape(v) {
        const s = String(v ?? '');
        if (/[",\\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }

      // Default every case to "incorrect" so the annotator only flips the ones
      // they want to mark correct. Existing decisions in localStorage win.
      let seededDefaults = false;
      document.querySelectorAll('.case-card').forEach((card) => {
        const caseId = card.dataset.caseId;
        if (state[caseId]) return;
        state[caseId] = {
          verdict: 'incorrect',
          notes: '',
          submission_identifier: card.dataset.submissionIdentifier,
          rubric_descriptions: card.dataset.rubricDescriptions,
          updated_at: new Date().toISOString(),
        };
        seededDefaults = true;
      });
      if (seededDefaults) saveState();

      applyToUi();
    })();
  `;
}
