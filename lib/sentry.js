const Sentry = require('@prairielearn/sentry');

/**
 * Enriches the current Sentry scope with data from the given Express request
 * and response objects.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
module.exports.enrichSentryScope = function (req, res) {
  Sentry.configureScope((scope) => {
    scope.setTags({
      response_id: res.locals.response_id,
      method: req.method,
      url: req.originalUrl,
    });

    if (res.locals.error_id) {
      scope.setTags({ error_id: res.locals.error_id });
    }

    if (res.locals.authn_user?.user_id) {
      scope.setUser({
        id: res.locals.authn_user.user_id.toString(),
        // To comply with GDPR and other data protection laws, you can
        // configure Sentry to not store IP addresses. Sentry will then
        // only use the IP address to compute a country code and
        // immediately discard it.
        ip_address: req.ip,
      });
    }

    if (res.locals?.course?.id) {
      scope.setTags({
        'course.id': res.locals.course?.id,
        'course.short_name': res.locals.course?.short_name,
        'course.title': res.locals.course?.title,
      });
    }

    if (res.locals?.course_instance?.id) {
      scope.setTags({
        'course_instance.id': res.locals.course_instance?.id,
        'course_instance.short_name': res.locals.course_instance?.short_name,
        'course_instance.long_name': res.locals.course_instance?.long_name,
      });
    }

    if (res.locals?.assessment?.id) {
      scope.setTags({
        'assessment.id': res.locals.assessment?.id,
        'assessment.directory': res.locals.assessment?.directory,
      });
    }

    if (res.locals?.assessment_instance?.id) {
      scope.setTags({
        'assessment_instance.id': res.locals.assessment_instance?.id,
      });
    }

    if (res.locals?.question?.id) {
      scope.setTags({
        'question.id': res.locals.question?.id,
        'question.directory': res.locals.question?.directory,
      });
    }

    if (res.locals?.instance_question?.id) {
      scope.setTags({
        'instance_question.id': res.locals.instance_question?.id,
      });
    }
  });
};
