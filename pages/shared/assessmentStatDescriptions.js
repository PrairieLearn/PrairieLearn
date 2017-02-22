var stat_descriptions = {
  MEAN_SCORE: {
    title: 'Mean',
    description: 'Mean score of a question is the average score for all students on the question.' + ' It is best to have a range of questions with different mean scores on the test, with some easy (mean score above 90%) and some hard (mean score below 50%).'
  },
  DISCRIMINATION: {
    title: 'Disc',
    description: 'Discrimination of a question is the correlation coefficient between the' + ' scores on the question and the total assessment scores. Discrimination values should be above 20%, unless a question is very easy (mean score above 95%), in which case it is acceptable to have lower discriminations. It is always better to have higher discriminations for all questions, and a range of discriminations is not desired.'
  },
  ATTEMPTS: {
    title: 'Attempts',
    description: 'Attempts for a question is the average number of graded attempts made per student' + ' at the question.'
  },
  QUINTILES: {
    title: 'Quintiles',
    description: 'Quintiles shows the average scores on the question for students in the lowest' + ' 20%' + ' of the class, the next 20%, etc, where the quintiles are determined by total assessment score. Good questions should have very low scores for the lowest quintile (the left-most), and very high scores for the highest quintile (the right-most). This is essentially a graphical representation of the discrimination.'
  },
  SCSP: {
    title: 'Some cor%',
    description: '(some correct submission percentage): The average percentage of instance' + ' questions' + ' with some_correct_submission = true'
  },
  FACP: {
    title: 'First cor%',
    description: '(first attempt correct percentage): The average percentage of instance' + ' questions' + ' with' + ' first_attempt_correct = true, ignoring nulls.'
  },
  LACP: {

    title: 'Last cor%',
    description: '(last attempt correct percentage): The average percentage of instance questions with last_attempt_correct = true, ignoring nulls.',
  },
  SSP: {
    title: 'Some sub',
    description: '(some submission percentage): The average percentage of instance questions' + ' with' +' some_subsmission = true.'
  },
  AOASR: {
    title: 'ASR',
    description: '(average of average success rate): The average value of the' + ' average_success_rate over' +' all instance questions relating to an assessment question.'
  },
  ASRH: {
    title: 'ASRH',
    description: '(average success rate histogram): A histogram of the average_success_rate over' + ' all' + ' instance questions relating to an assessment question.'
  },
  ALOISWSCS: {
    title: 'LIS some cor',
    description: '(average length of incorrect streak with some correct submission) The' + ' average' + ' value of the length_of_incorrect_streak over all instance questions relating to an assessment question where some_correct_submission = true.'
  },
  LOISHWSCS: {
    title: 'LISH some cor',
    description: '(length of incorrect streak histogram with some correct submission): A' + ' histogram' + ' of the length_of_incorrect_streak over all instance questions relating to an assessment question where some_correct_submission = true.'
  },
  ALOISWNCS: {
    title: 'LIS none cor',
    description: '(average length of incorrect streak with no correct submission): The' + ' average' + ' value of the length_of_incorrect_streak over all instance questions relating to an assessment question where some_correct_submission = false.'
  },
  LOISHWNCS: {
    title: 'LISH none cor',
    description: '(length of incorrect streak histogram with no correct submission): A' + ' histogram' + ' of' + ' the length_of_incorrect_streak over all instance questions relating to an assessment question where some_correct_submission = false.'
  },
};

module.exports = function(req, res, next) {
  res.locals.stat_descriptions = stat_descriptions;
  next();
};

