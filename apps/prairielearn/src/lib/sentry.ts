import * as Sentry from '@prairielearn/sentry';
import type { NextFunction, Request, Response } from 'express';

export function enrichSentryEventMiddleware(req: Request, res: Response, next: NextFunction) {
  // This will ensure that this middleware is always run in an isolated
  // context so that we don't accidentally leak data between requests.
  Sentry.runWithAsyncContext(() => {
    const scope = Sentry.getCurrentScope();

    // This event processor will run whenever an event is captured by Sentry.
    // It will use as much context as it can, but will gracefully handle the
    // case where context is missing.
    scope.addEventProcessor((event) => {
      event.tags ??= {};

      event.tags.response_id = res.locals.response_id;
      event.tags.method = req.method;
      event.tags.url = req.originalUrl;

      if (res.locals.error_id) {
        event.tags.error_id = res.locals.error_id;
      }

      if (res.locals.authn_user?.user_id) {
        event.user = {
          id: res.locals.authn_user.user_id.toString(),
          // To comply with GDPR and other data protection laws, you can
          // configure Sentry to not store IP addresses. Sentry will then
          // only use the IP address to compute a country code and
          // immediately discard it.
          ip_address: req.ip,
        };
      }

      if (res.locals?.course?.id) {
        event.tags['course.id'] = res.locals.course?.id;
        event.tags['course.short_name'] = res.locals.course?.short_name;
        event.tags['course.title'] = res.locals.course?.title;
      }

      if (res.locals?.course_instance?.id) {
        event.tags['course_instance.id'] = res.locals.course_instance?.id;
        event.tags['course_instance.short_name'] = res.locals.course_instance?.short_name;
        event.tags['course_instance.long_name'] = res.locals.course_instance?.long_name;
      }

      if (res.locals?.assessment?.id) {
        event.tags['assessment.id'] = res.locals.assessment?.id;
        event.tags['assessment.directory'] = res.locals.assessment?.directory;
      }

      if (res.locals?.assessment_instance?.id) {
        event.tags['assessment_instance.id'] = res.locals.assessment_instance?.id;
      }

      if (res.locals?.question?.id) {
        event.tags['question.id'] = res.locals.question?.id;
        event.tags['question.directory'] = res.locals.question?.directory;
      }

      if (res.locals?.instance_question?.id) {
        event.tags['instance_question.id'] = res.locals.instance_question?.id;
      }

      return event;
    });

    next();
  });
}
