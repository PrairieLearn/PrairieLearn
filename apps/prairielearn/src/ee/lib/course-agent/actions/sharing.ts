import { z } from 'zod';

import { features } from '../../../../lib/features/index.js';
import { selectOptionalCourseBySharingToken } from '../../../../models/course.js';
import {
  insertSharingSetCourse,
  selectOptionalSharingSetByName,
  selectSharingSetsForCourse,
} from '../../../../models/sharing-set.js';

import { CourseActionError, action } from './action.js';

export const sharingActions = {
  sharing_sets_add_course: action({
    description:
      "Let another course use the questions in one of this course's sharing sets, as on the course's Sharing page. It needs the other course's sharing token, which that course's owner copies from its Sharing page. PrairieLearn has no way to take this access back.",
    requiredRole: ['Owner'],
    input: z.strictObject({
      sharing_set_name: z
        .string()
        .min(1)
        .describe('Name of the sharing set, from the name column of the sharing_sets dataset.'),
      course_sharing_token: z
        .string()
        .min(1)
        .describe(
          "The other course's sharing token, as the instructor gave it. Ask the instructor for it; never guess it.",
        ),
    }),
    run: async ({ ctx, input }) => {
      // The Sharing page is shown only where question sharing is enabled.
      if (
        !(await features.enabled('question-sharing', {
          institution_id: ctx.course.institution_id,
          course_id: ctx.course.id,
          user_id: ctx.user.id,
        }))
      ) {
        throw new CourseActionError(
          'Question sharing is not enabled for this course. Tell the instructor, and do not retry.',
        );
      }
      const sharingSet = await selectOptionalSharingSetByName({
        course_id: ctx.course.id,
        name: input.sharing_set_name,
      });
      if (!sharingSet) {
        const names = (await selectSharingSetsForCourse({ course_id: ctx.course.id })).map(
          ({ name }) => name,
        );
        throw new CourseActionError(
          names.length > 0
            ? `This course has no sharing set named "${input.sharing_set_name}". Its sharing sets are: ${names.join(', ')}.`
            : 'This course has no sharing sets. Add one to "sharingSets" in infoCourse.json first.',
        );
      }
      if (input.course_sharing_token === ctx.course.sharing_token) {
        throw new CourseActionError(
          "That is this course's own sharing token. Ask the instructor for the other course's token, which its owner copies from that course's Sharing page.",
        );
      }
      const consumingCourse = await selectOptionalCourseBySharingToken(input.course_sharing_token);
      if (!consumingCourse) {
        throw new CourseActionError(
          'No course has that sharing token. Ask the instructor to check that it was copied in full from the other course.',
        );
      }
      const added = await insertSharingSetCourse({
        sharing_course_id: ctx.course.id,
        sharing_set_id: sharingSet.id,
        course_sharing_token: input.course_sharing_token,
      });
      if (added === null) throw new Error('Failed to add course to sharing set');
      return {
        summary: `${consumingCourse.short_name} can now use the questions in the sharing set "${sharingSet.name}".`,
      };
    },
  }),
};
