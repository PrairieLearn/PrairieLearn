import { range } from 'es-toolkit';
import { z } from 'zod';

import {
  SECOND_IN_MILLISECONDS,
  formatDate,
  formatDateYMD,
  formatInterval,
} from '@prairielearn/formatter';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { Scorebar } from '../../components/Scorebar.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  getAssessmentStatisticsDownloadUrl,
  getManualGradingAssessmentQuestionUrl,
  getQuestionUrl,
} from '../../lib/client/url.js';
import {
  AlternativePoolSchema,
  type Assessment,
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  CourseInstanceSchema,
  CourseSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';
import { formatFloat } from '../../lib/format.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { STAT_DESCRIPTIONS } from '../shared/assessmentStatDescriptions.js';

export const AssessmentScoreHistogramByDateSchema = z.object({
  date: DateFromISOString,
  number: z.number(),
  mean_score_perc: z.number(),
  histogram: z.array(z.number()),
});
type AssessmentScoreHistogramByDate = z.infer<typeof AssessmentScoreHistogramByDateSchema>;

export const UserScoreSchema = z.object({
  duration: AssessmentInstanceSchema.shape.duration,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
});
type UserScore = z.infer<typeof UserScoreSchema>;

export const AssessmentQuestionStatsRowSchema = AssessmentQuestionSchema.extend({
  course_short_name: CourseSchema.shape.short_name,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  assessment_label: z.string(),
  qid: QuestionSchema.shape.qid,
  question_title: QuestionSchema.shape.title,
  topic: TopicSchema,
  question_tags: z.array(TagSchema.shape.name),
  question_id: IdSchema,
  assessment_question_number: z.string(),
  alternative_pool_number: AlternativePoolSchema.shape.number,
  alternative_pool_size: z.number(),
  zone_title: ZoneSchema.shape.title,
  start_new_zone: z.boolean(),
  start_new_alternative_pool: z.boolean(),
});
export type AssessmentQuestionStatsRow = z.infer<typeof AssessmentQuestionStatsRowSchema>;

export interface Filenames {
  scoreStatsCsvFilename: string;
  durationStatsCsvFilename: string;
  statsByDateCsvFilename: string;
  questionStatsCsvFilename: string;
}

export function InstructorAssessmentStatistics({
  resLocals,
  assessment,
  assessmentScoreHistogramByDate,
  userScores,
  rows,
  filenames,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  assessment: Assessment;
  assessmentScoreHistogramByDate: AssessmentScoreHistogramByDate[];
  userScores: UserScore[];
  rows: AssessmentQuestionStatsRow[];
  filenames: Filenames;
}) {
  const histminiOptions = { width: 60, height: 20, ymax: 1 };
  // Use assessments.stats_last_updated (the time when we last updated
  // the _question_ statistics for this assessment). Note that this is
  // different to assessments.statistics_last_updated_at (the time we last
  // updated the assessment instance statistics stored in the assessments
  // row itself).
  const statsLastUpdated =
    resLocals.assessment.stats_last_updated == null
      ? 'never'
      : formatDate(
          resLocals.assessment.stats_last_updated,
          resLocals.course_instance.display_timezone,
        );

  return PageLayout({
    resLocals,
    pageTitle: 'Assessment Statistics',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'assessment_statistics',
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledScriptTag('instructorAssessmentStatisticsClient.ts'),
    content: (
      <>
        <h1 className="visually-hidden">
          {resLocals.assessment_set.name} {assessment.number} Statistics
        </h1>

        <h2 className="h4">Assessment statistics</h2>
        <div className="mb-4">
          <details open>
            <summary>Score statistics</summary>
            {assessment.score_stat_number > 0 ? (
              <>
                <div className="card-body">
                  <div
                    className="js-histogram"
                    data-histogram={JSON.stringify(assessment.score_stat_hist)}
                    data-xgrid={JSON.stringify(range(0, 110, 10))}
                    data-options={JSON.stringify({
                      ymin: 0,
                      xlabel: 'score / %',
                      ylabel: 'number of students',
                    })}
                  />
                </div>

                <div className="table-responsive">
                  <table
                    className="table table-sm table-hover"
                    aria-label="Assessment score statistics"
                  >
                    <tbody>
                      <tr>
                        <td>Number of students</td>
                        <td>{assessment.score_stat_number}</td>
                      </tr>
                      <tr>
                        <td>Mean score</td>
                        <td>{Math.round(assessment.score_stat_mean)}%</td>
                      </tr>
                      <tr>
                        <td>Standard deviation</td>
                        <td>{Math.round(assessment.score_stat_std)}%</td>
                      </tr>
                      <tr>
                        <td>Median score</td>
                        <td>{Math.round(assessment.score_stat_median)}%</td>
                      </tr>
                      <tr>
                        <td>Minimum score</td>
                        <td>{Math.round(assessment.score_stat_min)}%</td>
                      </tr>
                      <tr>
                        <td>Maximum score</td>
                        <td>{Math.round(assessment.score_stat_max)}%</td>
                      </tr>
                      <tr>
                        <td>Number of 0%</td>
                        <td>
                          {assessment.score_stat_n_zero} (
                          {Math.round(assessment.score_stat_n_zero_perc)}% of{' '}
                          {assessment.score_stat_number})
                        </td>
                      </tr>
                      <tr>
                        <td>Number of 100%</td>
                        <td>
                          {assessment.score_stat_n_hundred} (
                          {Math.round(assessment.score_stat_n_hundred_perc)}% of{' '}
                          {assessment.score_stat_number})
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card-footer">
                  <small>
                    Download{' '}
                    <a
                      href={getAssessmentStatisticsDownloadUrl({
                        courseInstanceId: resLocals.course_instance.id,
                        assessmentId: assessment.id,
                        filename: filenames.scoreStatsCsvFilename,
                      })}
                    >
                      {filenames.scoreStatsCsvFilename}
                    </a>
                    . Data outside of the plotted range is included in the last bin.
                  </small>
                </div>
              </>
            ) : (
              <div className="card-body">No student data.</div>
            )}
          </details>
          <details>
            <summary>Duration statistics</summary>
            {assessment.score_stat_number > 0 ? (
              <>
                <div className="card-body">
                  <div
                    className="js-histogram"
                    data-histogram={JSON.stringify(assessment.duration_stat_hist)}
                    data-xgrid={JSON.stringify(
                      assessment.duration_stat_thresholds.map(
                        (durationMs) => durationMs / SECOND_IN_MILLISECONDS,
                      ),
                    )}
                    data-options={JSON.stringify({
                      ymin: 0,
                      xlabel: 'duration',
                      ylabel: 'number of students',
                      xTickLabels: assessment.duration_stat_thresholds.map(durationLabel),
                    })}
                  />
                </div>

                <div className="table-responsive">
                  <table
                    className="table table-sm table-hover"
                    aria-label="Assessment duration statistics"
                  >
                    <tbody>
                      <tr>
                        <td>Mean duration</td>
                        <td>{formatInterval(assessment.duration_stat_mean)}</td>
                      </tr>
                      <tr>
                        <td>Median duration</td>
                        <td>{formatInterval(assessment.duration_stat_median)}</td>
                      </tr>
                      <tr>
                        <td>Minimum duration</td>
                        <td>{formatInterval(assessment.duration_stat_min)}</td>
                      </tr>
                      <tr>
                        <td>Maximum duration</td>
                        <td>{formatInterval(assessment.duration_stat_max)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card-footer">
                  <small>
                    Download{' '}
                    <a
                      href={getAssessmentStatisticsDownloadUrl({
                        courseInstanceId: resLocals.course_instance.id,
                        assessmentId: assessment.id,
                        filename: filenames.durationStatsCsvFilename,
                      })}
                    >
                      {filenames.durationStatsCsvFilename}
                    </a>
                    . Data outside of the plotted range is included in the last bin.
                  </small>
                </div>
              </>
            ) : (
              <div className="card-body">No student data.</div>
            )}
          </details>
          <details>
            <summary>Duration versus score</summary>
            {assessment.score_stat_number > 0 ? (
              <>
                <div className="card-body">
                  <div
                    className="js-scatter"
                    data-xdata={JSON.stringify(
                      userScores.map((user) => (user.duration ?? 0) / SECOND_IN_MILLISECONDS),
                    )}
                    data-ydata={JSON.stringify(userScores.map((user) => user.score_perc))}
                    data-options={JSON.stringify({
                      xgrid: assessment.duration_stat_thresholds.map(
                        (durationMs) => durationMs / SECOND_IN_MILLISECONDS,
                      ),
                      ygrid: range(0, 110, 10),
                      xlabel: 'duration',
                      ylabel: 'score / %',
                      xTickLabels: assessment.duration_stat_thresholds.map(durationLabel),
                    })}
                  />
                </div>

                <div className="card-footer">
                  <small>
                    Each point is one student assessment. Points beyond the plot range are plotted
                    on the edge.
                  </small>
                </div>
              </>
            ) : (
              <div className="card-body">No student data.</div>
            )}
          </details>
          <details>
            <summary>Score statistics by date</summary>
            {assessment.score_stat_number > 0 ? (
              <>
                <div className="card-body">
                  <div
                    style={{ overflowX: 'scroll', overflowY: 'hidden' }}
                    className="js-parallel-histograms"
                    data-histograms={JSON.stringify(
                      assessmentScoreHistogramByDate.map((day) => ({
                        // The date is already extracted from the timestamp in the
                        // query and returned as UTC, so we can safely format it
                        // without worrying about timezones here.
                        label: formatDateYMD(day.date, 'UTC'),
                        mean: day.mean_score_perc,
                        histogram: day.histogram,
                      })),
                    )}
                    data-options={JSON.stringify({
                      ygrid: range(0, 110, 10),
                      xgrid: assessmentScoreHistogramByDate.length,
                      xlabel: 'start date',
                      ylabel: 'score / %',
                      yTickLabels: range(100, -10, -10),
                      width: assessmentScoreHistogramByDate.length * 200,
                    })}
                  />
                </div>

                <div className="card-footer">
                  <small>
                    Download{' '}
                    <a
                      href={getAssessmentStatisticsDownloadUrl({
                        courseInstanceId: resLocals.course_instance.id,
                        assessmentId: assessment.id,
                        filename: filenames.statsByDateCsvFilename,
                      })}
                    >
                      {filenames.statsByDateCsvFilename}
                    </a>
                    .
                    <br />
                    Each day shows a histogram of the scores on this assessment for that day. The
                    widths are scaled relative to the maximum value across all bins and days. The
                    thick black horizontal lines are the mean scores for each day.
                  </small>
                </div>
              </>
            ) : (
              <div className="card-body">No student data.</div>
            )}
          </details>
        </div>

        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h2 className="h4 mb-0">Question statistics</h2>
          {resLocals.authz_data.has_course_permission_edit ? (
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small">Last calculated: {statsLastUpdated}</span>
              <form method="post" className="mb-0">
                <input type="hidden" name="__action" value="refresh_stats" />
                <input type="hidden" name="__csrf_token" value={resLocals.__csrf_token} />
                <button type="submit" className="btn btn-sm btn-primary text-nowrap">
                  <i className="fa fa-sync" aria-hidden="true" /> Recalculate
                </button>
              </form>
            </div>
          ) : null}
        </div>
        <div className="mb-4">
          <details open>
            <summary>Overall statistics</summary>
            <div className="table-responsive">
              <table
                className="table table-sm table-hover tablesorter"
                aria-label="Question statistics"
              >
                <thead>
                  <tr>
                    <th className="text-center">Question</th>
                    <th className="text-center">Mean score</th>
                    <th className="text-center">Discrimination</th>
                    <th className="text-center">Auto-graded Attempts</th>
                    <th className="text-center">Quintiles</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <a
                          href={getQuestionUrl({
                            courseInstanceId: resLocals.course_instance.id,
                            questionId: row.question_id,
                          })}
                        >
                          {row.assessment_question_number}. {row.question_title}
                        </a>
                      </td>
                      <td className="text-center align-middle">
                        <Scorebar
                          score={
                            row.mean_question_score ? Math.round(row.mean_question_score) : null
                          }
                        />
                      </td>
                      <td className="text-center align-middle">
                        <Scorebar
                          score={row.discrimination ? Math.round(row.discrimination) : null}
                        />
                      </td>
                      <td className="text-center">
                        {(row.max_auto_points ?? 0) > 0 ||
                        row.max_manual_points === 0 ||
                        (row.average_number_submissions ?? 0) > 0
                          ? formatFloat(row.average_number_submissions)
                          : '—'}
                      </td>
                      {(row.number ?? 0) > 0 ? (
                        <td className="text-center">
                          <div
                            className="js-histmini"
                            data-data={JSON.stringify(row.quintile_question_scores)}
                            data-options={JSON.stringify({
                              ...histminiOptions,
                              ymax: 100,
                            })}
                          />
                        </td>
                      ) : (
                        <td className="text-center" />
                      )}
                      <td className="align-middle text-nowrap" style={{ width: '1em' }}>
                        {resLocals.authz_data.has_course_instance_permission_edit ? (
                          <a
                            className="btn btn-xs btn-primary"
                            href={getManualGradingAssessmentQuestionUrl({
                              courseInstanceId: resLocals.course_instance.id,
                              assessmentId: resLocals.assessment.id,
                              assessmentQuestionId: row.id,
                            })}
                          >
                            Manual grading
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-footer">
              <p>
                Download{' '}
                <a
                  href={getAssessmentStatisticsDownloadUrl({
                    courseInstanceId: resLocals.course_instance.id,
                    assessmentId: resLocals.assessment.id,
                    filename: filenames.questionStatsCsvFilename,
                  })}
                >
                  {filenames.questionStatsCsvFilename}
                </a>
              </p>
              <div className="small">
                <ul>
                  <li>
                    <strong>Mean score</strong> of a question is the average score for all students
                    on the question. It is best to have a range of questions with different mean
                    scores on the test, with some easy (mean score above 90%) and some hard (mean
                    score below 50%).
                  </li>
                  <li>
                    <strong>Discrimination</strong> of a question is the correlation coefficient
                    between the scores on the question and the total assessment scores.
                    Discrimination values should be above 20%, unless a question is very easy (mean
                    score above 95%), in which case it is acceptable to have lower discriminations.
                    It is always better to have higher discriminations for all questions, and a
                    range of discriminations is not desired.
                  </li>
                  <li>
                    <strong>Auto-graded Attempts</strong> for a question is the average number of
                    auto-graded attempts made per student at the question.
                  </li>
                  <li>
                    <strong>Quintiles</strong> shows the average scores on the question for students
                    in the lowest 20% of the class, the next 20%, etc, where the quintiles are
                    determined by total assessment score. Good questions should have very low scores
                    for the lowest quintile (the left-most), and very high scores for the highest
                    quintile (the right-most). This is essentially a graphical representation of the
                    discrimination.
                  </li>
                </ul>
              </div>
            </div>
          </details>
          <details>
            <summary>Difficulty vs discrimination</summary>
            {resLocals.assessment.score_stat_number > 0 ? (
              <>
                <div className="card-body">
                  <div
                    id="difficultyDiscriminationScatter"
                    className="js-scatter"
                    data-xdata={JSON.stringify(rows.map((q) => q.mean_question_score))}
                    data-ydata={JSON.stringify(rows.map((q) => q.discrimination))}
                    data-options={JSON.stringify({
                      xgrid: range(0, 110, 10),
                      ygrid: range(0, 110, 10),
                      xlabel: 'mean score / %',
                      ylabel: 'discrimination / %',
                      radius: 2,
                      topMargin: 30,
                      labels: rows.map((q) => q.assessment_question_number),
                    })}
                  />
                </div>
                <div className="card-footer small">
                  <ul>
                    <li>
                      <strong>Mean score</strong> of a question is the average score for all
                      students on the question. It is best to have a range of questions with
                      different mean scores on the test, with some easy (mean score above 90%) and
                      some hard (mean score below 50%).
                    </li>
                    <li>
                      <strong>Discrimination</strong> of a question is the correlation coefficient
                      between the scores on the question and the total assessment scores.
                      Discrimination values should be above 20%, unless a question is very easy
                      (mean score above 95%), in which case it is acceptable to have lower
                      discriminations. It is always better to have higher discriminations for all
                      questions, and a range of discriminations is not desired.
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="card-body">No student data.</div>
            )}
          </details>
          <details>
            <summary>Detailed statistics</summary>
            <div className="table-responsive">
              <table
                className="table table-sm table-hover tablesorter table-bordered"
                aria-label="Detailed question statistics"
              >
                <thead>
                  <tr>
                    <th className="text-center">Question</th>
                    {Object.keys(STAT_DESCRIPTIONS).map((stat) => {
                      if (
                        stat !== 'INCREMENTAL_SUBMISSION_SCORE_POINTS_AVERAGES' ||
                        resLocals.assessment.type !== 'Homework'
                      ) {
                        return (
                          <th
                            key={stat}
                            className="text-center"
                            title={STAT_DESCRIPTIONS[stat].description}
                          >
                            {STAT_DESCRIPTIONS[stat].title}
                          </th>
                        );
                      }
                      return null;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <a
                          href={getQuestionUrl({
                            courseInstanceId: resLocals.course_instance.id,
                            questionId: row.question_id,
                          })}
                        >
                          {row.assessment_question_number}. {row.qid}
                        </a>
                      </td>
                      <td className="text-center">{formatFloat(row.mean_question_score, 1)}</td>
                      <td className="text-center">{formatFloat(row.median_question_score, 1)}</td>
                      <td className="text-center">{formatFloat(row.question_score_variance, 1)}</td>
                      <td className="text-center">{formatFloat(row.discrimination, 1)}</td>
                      {(row.max_auto_points ?? 0) > 0 || row.max_manual_points === 0 ? (
                        <>
                          <td className="text-center">
                            {formatFloat(row.some_submission_perc, 1)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.some_perfect_submission_perc, 1)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.some_nonzero_submission_perc, 1)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.average_first_submission_score, 2)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.first_submission_score_variance, 2)}
                          </td>
                          <td className="text-center">
                            {row.first_submission_score_hist !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.first_submission_score_hist)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  normalize: true,
                                })}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.average_last_submission_score, 2)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.last_submission_score_variance, 2)}
                          </td>
                          <td className="text-center">
                            {row.last_submission_score_hist !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.last_submission_score_hist)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  normalize: true,
                                })}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.average_max_submission_score, 2)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.max_submission_score_variance, 2)}
                          </td>
                          <td className="text-center">
                            {row.max_submission_score_hist !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.max_submission_score_hist)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  normalize: true,
                                })}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.average_average_submission_score, 2)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.average_submission_score_variance, 2)}
                          </td>
                          <td className="text-center">
                            {row.average_submission_score_hist !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.average_submission_score_hist)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  normalize: true,
                                })}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {row.submission_score_array_averages !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.submission_score_array_averages)}
                                data-options={JSON.stringify(histminiOptions)}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {row.incremental_submission_score_array_averages !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(
                                  row.incremental_submission_score_array_averages,
                                )}
                                data-options={JSON.stringify(histminiOptions)}
                              />
                            ) : null}
                          </td>
                          {resLocals.assessment.type !== 'Homework' ? (
                            <td className="text-center">
                              {row.incremental_submission_points_array_averages != null ? (
                                <div
                                  className="js-histmini"
                                  data-data={JSON.stringify(
                                    row.incremental_submission_points_array_averages,
                                  )}
                                  data-options={JSON.stringify({
                                    ...histminiOptions,
                                    ymax: row.max_points,
                                  })}
                                />
                              ) : null}
                            </td>
                          ) : null}
                          <td className="text-center">
                            {formatFloat(row.average_number_submissions, 2)}
                          </td>
                          <td className="text-center">
                            {formatFloat(row.number_submissions_variance, 2)}
                          </td>
                          <td className="text-center">
                            {row.number_submissions_hist !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.number_submissions_hist)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  normalize: true,
                                })}
                              />
                            ) : null}
                          </td>
                          <td className="text-center">
                            {row.quintile_question_scores !== null ? (
                              <div
                                className="js-histmini"
                                data-data={JSON.stringify(row.quintile_question_scores)}
                                data-options={JSON.stringify({
                                  ...histminiOptions,
                                  ymax: 100,
                                })}
                              />
                            ) : null}
                          </td>
                        </>
                      ) : (
                        <td
                          className="text-center"
                          colSpan={resLocals.assessment.type === 'Homework' ? 21 : 22}
                        >
                          Manually-graded question
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-footer">
              <p>
                Download{' '}
                <a
                  href={getAssessmentStatisticsDownloadUrl({
                    courseInstanceId: resLocals.course_instance.id,
                    assessmentId: resLocals.assessment.id,
                    filename: filenames.questionStatsCsvFilename,
                  })}
                >
                  {filenames.questionStatsCsvFilename}
                </a>
              </p>
              <div className="small">
                <ul>
                  {Object.keys(STAT_DESCRIPTIONS).map((stat) => (
                    <li key={stat}>
                      <strong>{STAT_DESCRIPTIONS[stat].title}: </strong>{' '}
                      {STAT_DESCRIPTIONS[stat].description}
                    </li>
                  ))}
                </ul>
                <p className="mb-0">
                  In the case that a student takes this assessment multiple times (e.g., if this
                  assessment is a practice exam), we are calculating the above statistics by first
                  averaging over all assessment instances for each student, then averaging over
                  students.
                </p>
              </div>
            </div>
          </details>
        </div>
      </>
    ),
  });
}

function durationLabel(durationMs: number) {
  return formatInterval(durationMs).replaceAll(' ', '');
}
