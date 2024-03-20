const { default: AnsiUp } = require('ansi_up');

module.exports = function (req, res, next) {
  const ansiUp = new AnsiUp();
  if (res.locals.course) {
    if (res.locals.course.sync_errors) {
      res.locals.course.sync_errors_ansified = ansiUp.ansi_to_html(res.locals.course.sync_errors);
    }
    if (res.locals.course.sync_warnings) {
      res.locals.course.sync_warnings_ansified = ansiUp.ansi_to_html(
        res.locals.course.sync_warnings,
      );
    }
  }
  if (res.locals.course_instance) {
    if (res.locals.course_instance.sync_errors) {
      res.locals.course_instance.sync_errors_ansified = ansiUp.ansi_to_html(
        res.locals.course_instance.sync_errors,
      );
    }
    if (res.locals.course_instance.sync_warnings) {
      res.locals.course_instance.sync_warnings_ansified = ansiUp.ansi_to_html(
        res.locals.course_instance.sync_warnings,
      );
    }
  }
  if (res.locals.question) {
    if (res.locals.question.sync_errors) {
      res.locals.question.sync_errors_ansified = ansiUp.ansi_to_html(
        res.locals.question.sync_errors,
      );
    }
    if (res.locals.question.sync_warnings) {
      res.locals.question.sync_warnings_ansified = ansiUp.ansi_to_html(
        res.locals.question.sync_warnings,
      );
    }
  }
  if (res.locals.assessment) {
    if (res.locals.assessment.sync_errors) {
      res.locals.assessment.sync_errors_ansified = ansiUp.ansi_to_html(
        res.locals.assessment.sync_errors,
      );
    }
    if (res.locals.assessment.sync_warnings) {
      res.locals.assessment.sync_warnings_ansified = ansiUp.ansi_to_html(
        res.locals.assessment.sync_warnings,
      );
    }
  }
  next();
};
