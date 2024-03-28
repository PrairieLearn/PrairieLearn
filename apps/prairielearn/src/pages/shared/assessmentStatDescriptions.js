var stat_descriptions = {
  MEAN_SCORE: {
    title: 'Mean (μ)',
    non_html_title: 'Mean',
    description: 'Mean score of a question is the average score for all students on the question.',
  },
  MEDIAN_SCORE: {
    title: 'Median',
    non_html_title: 'Median',
    description:
      'Median score of a question is the score which separates the lower half and the upper half of students scores.',
  },
  VARIANCE: {
    title: 'SD (σ)',
    non_html_title: 'SD',
    description: 'This is the standard deviation of student scores on this question.',
  },
  DISCRIMINATION: {
    title: 'Discrim.',
    non_html_title: 'Discrim.',
    description:
      'Discrimination of a question is the correlation coefficient between the scores on the question and the total assessment scores.',
  },
  SOME_SUBMISSION_PERCENTAGE: {
    title: 'Some sub. (%)',
    non_html_title: 'Some sub. (%)',
    description:
      '(some submission percentage): The percentage of students that submitted a valid, auto-gradable answer.',
  },
  SOME_PERFECT_SUBMISSION_PERCENTAGE: {
    title: 'Some perfect sub. (%)',
    non_html_title: 'Some perfect sub. (%)',
    description:
      '(some perfect submission percentage): The percentage of students that submitted an answer that got full auto-graded credit.',
  },
  SOME_NONZERO_SUBMISSION_PERCENTAGE: {
    title: 'Some nonzero sub. (%)',
    non_html_title: 'Some nonzero sub. (%)',
    description:
      '(some nonzero submission percentage): The percentage of students that submitted some answer that got some auto-graded credit.',
  },
  AVERAGE_FIRST_SUBMISSION_SCORE: {
    title: 'μ<sub>First Sub. Score</sub>',
    non_html_title: 'First sub. score average',
    description:
      '(first submission score average): The average auto-graded score on the first submission over students that had at least one submission.',
  },
  FIRST_SUBMISSION_SCORE_VARIANCE: {
    title: 'σ<sub>First Sub. Score</sub>',
    non_html_title: 'First sub. score SD',
    description:
      '(first submission score standard deviation): The standard deviation of first submission auto-graded scores.',
  },
  FIRST_SUBMISSION_SCORE_HIST: {
    title: 'First Sub. Score Hist.',
    non_html_title: 'First Sub. Score Hist.',
    description:
      '(first submission score histogram): The histogram of first submission auto-graded scores.',
  },
  AVERAGE_LAST_SUBMISSION_SCORE: {
    title: 'μ<sub>Last Sub. Score</sub>',
    non_html_title: 'Last Sub. Score Average',
    description:
      '(last submission score average): The average auto-graded score on last submission over students that had at least one submission.',
  },
  LAST_SUBMISSION_SCORE_VARIANCE: {
    title: 'σ<sub>Last Sub. Score</sub>',
    non_html_title: 'Last Sub. Score SD',
    description:
      '(last submission score standard deviation): The standard deviation of last submission auto-graded scores.',
  },
  LAST_SUBMISSION_SCORE_HIST: {
    title: 'Last Sub. Score Hist.',
    non_html_title: 'Last Sub. Score Hist.',
    description:
      '(last submission score histogram): The histogram of last submission auto-graded scores.',
  },
  AVERAGE_MAX_SUBMISSION_SCORE: {
    title: 'μ<sub>Max Sub. Score</sub>',
    non_html_title: 'Max Sub. Score average',
    description:
      '(max submission score average): The average best-submission score over students that had at least one submission.',
  },
  MAX_SUBMISSION_SCORE_VARIANCE: {
    title: 'σ<sub>Max Sub. Score</sub>',
    non_html_title: 'Max Sub. Score SD',
    description:
      '(max submission score standard deviation): The standard deviation of best-submission auto-graded scores.',
  },
  MAX_SUBMISSIONS_SCORE_HIST: {
    title: 'Max Sub. Score Hist.',
    non_html_title: 'Max Sub. Score Hist.',
    description:
      '(max submission score histogram): The histogram of best-submission auto-graded scores.',
  },
  AVERAGE_AVERAGE_SUBMISSION_SCORE: {
    title: 'μ<sub>Avg. Sub. Score</sub>',
    non_html_title: 'Avg. Sub. Score average',
    description:
      '(average of submission score averages): The average of average submission auto-graded scores over students that had at least one submission.',
  },
  AVERAGE_SUBMISSION_SCORE_VARIANCE: {
    title: 'σ<sub>Avg. Sub. Score</sub>',
    non_html_title: 'Avg. Sub. Score SD',
    description:
      '(variance of submission score averages): The variance of average submission auto-graded scores over students that had at least one submission.',
  },
  AVERAGE_SUBMISSION_SCORE_HIST: {
    title: 'Avg. Sub. Score Hist.',
    non_html_title: 'Avg. Sub. Score Hist.',
    description:
      '(submission score averages histogram): The histogram of average submission auto-graded scores over students that had at least one submission.',
  },
  SUBMISSION_SCORE_ARRAY_AVERAGES: {
    title: 'μ<sub>Sub. Score Array</sub>',
    non_html_title: 'Sub. Score Array average',
    description:
      '(submission score array): The average submission auto-graded scores (over students that had at least one submission) for the 1st submission, 2nd submission, etc. Submission score arrays are padded with zeros when some students have more submissions than others.',
  },
  INCREMENTAL_SUBMISSION_SCORE_ARRAY_AVERAGES: {
    title: 'μ<sub>Incr. Sub. Score Array</sub>',
    non_html_title: 'Incr. Sub. Score Array average',
    description:
      '(incremental submission score array): The average incremental submission auto-graded score gain (over students that had at least one submission) for the 1st submission, 2nd submission, etc. arr[n] = The incremental score gain from submitting the nth submission.',
  },
  INCREMENTAL_SUBMISSION_SCORE_POINTS_AVERAGES: {
    title: 'μ<sub>Incr. Sub. Points Array</sub>',
    non_html_title: 'Incr. Sub. Points Array average',
    description:
      '(incremental submission points array): The average incremental submission auto-graded points gain (over students that had at least one submission) for the 1st submission, 2nd submission, etc. arr[n] = The incremental points gained by submitting the nth submission. Only available for exams.',
  },
  AVERAGE_NUMBER_SUBMISSIONS: {
    title: 'μ<sub>Num. Sub.</sub>',
    non_html_title: 'Num. Sub. average',
    description: '(average number of submissions): The average number of auto-graded submissions.',
  },
  NUMBER_SUBMISSIONS_VARIANCE: {
    title: 'σ<sub>Num. Sub.</sub>',
    non_html_title: 'Num. Sub. SD',
    description:
      '(number of submissions standard deviation): The standard deviation of the number of auto-graded submissions.',
  },
  NUMBER_SUBMISSIONS_HIST: {
    title: 'Num. Sub. Hist.',
    non_html_title: 'Num. Sub. Hist.',
    description:
      '(number of submissions histogram): The histogram of the number of auto-graded submissions.',
  },
  QUINTILE_SCORES_AS_ARRAY: {
    title: 'Quintile Scores',
    non_html_title: 'Quintile Scores',
    description:
      'Quintiles show the average auto-graded scores on the question for students in the lowest 20% of the class, the next 20%, etc, where the quintiles are determined by total assessment score.',
  },
};

module.exports = function (req, res, next) {
  res.locals.stat_descriptions = stat_descriptions;
  next();
};
