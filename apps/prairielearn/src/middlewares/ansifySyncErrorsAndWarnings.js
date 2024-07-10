// @ts-check
import { AnsiUp } from 'ansi_up';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  const ansiUp = new AnsiUp();
  // This remains until partials/courseInstanceSyncErrorsAndWarnings is removed
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

  // This remains until partials/courseInstanceSyncErrorsAndWarnings is removed
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
}
