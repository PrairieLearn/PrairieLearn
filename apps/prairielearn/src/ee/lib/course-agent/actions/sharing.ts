import { z } from 'zod';

import { CourseSharingNameSchema } from '../../../../lib/client/course-sharing.js';
import {
  findCoursesBySharingNames,
  selectOptionalCourseBySharingToken,
  updateCourseSharingNameIfAllowed,
  updateCourseSharingToken,
} from '../../../../models/course.js';
import {
  insertSharingSetCourse,
  selectOptionalSharingSetByName,
  selectSharingSetsForCourse,
} from '../../../../models/sharing-set.js';

import { type CourseActionContext, CourseActionError, action, count } from './action.js';

const AddCourseInputSchema = z.strictObject({
  sharing_set_name: z
    .string()
    .min(1)
    .describe(
      'Name of one of this course\'s sharing sets, from the name column of the sharing_sets dataset or "sharingSets" in infoCourse.json.',
    ),
  course_sharing_token: z
    .string()
    .min(1)
    .describe(
      "The other course's sharing token, which its owner copies from that course's Sharing page and gives to the instructor. Ask the instructor for it; never guess it.",
    ),
});

/** The sharing set and the course it would be shared with, or an error the agent can act on. */
async function findSharingTarget(
  ctx: CourseActionContext,
  input: z.infer<typeof AddCourseInputSchema>,
) {
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
        ? `This course has no sharing set named "${input.sharing_set_name}". Its sharing sets: ${names.join(', ')}.`
        : `This course has no sharing sets yet. Add one to "sharingSets" in infoCourse.json and have the change saved first.`,
    );
  }
  if (input.course_sharing_token === ctx.course.sharing_token) {
    throw new CourseActionError(
      "That is this course's own sharing token. The token to use is the other course's, which its owner copies from that course's Sharing page.",
    );
  }
  const consumingCourse = await selectOptionalCourseBySharingToken(input.course_sharing_token);
  if (!consumingCourse) {
    throw new CourseActionError(
      'No course has that sharing token. Ask the instructor to check that it was copied in full from the other course.',
    );
  }
  return { sharingSet, consumingCourse };
}

export const sharingActions = {
  sharing_add_course_to_set: action({
    group: 'sharing_sets',
    description:
      "Let another course use the questions in one of this course's sharing sets. Which questions are in a sharing set is set in each question's info.json, and the sets themselves in infoCourse.json; change those in the course files.",
    effects:
      'Staff of the other course can add the questions in the sharing set to their assessments. Students see nothing change.',
    undo: null,
    permission: 'course_owner',
    feature: 'question-sharing',
    input: AddCourseInputSchema,
    describe: async ({ ctx, input }) => {
      const { sharingSet, consumingCourse } = await findSharingTarget(ctx, input);
      const sets = await selectSharingSetsForCourse({ course_id: ctx.course.id });
      const current = sets.find((set) => set.id === sharingSet.id);
      if (current?.shared_with.includes(consumingCourse.short_name ?? '')) {
        throw new CourseActionError(
          `The sharing set "${sharingSet.name}" is already shared with ${consumingCourse.short_name}.`,
        );
      }
      return {
        title: `Share the sharing set "${sharingSet.name}" with ${consumingCourse.short_name}`,
        context: 'PrairieLearn has no way to take this access back.',
        rows: [
          {
            label: `${consumingCourse.short_name}: ${consumingCourse.title}`,
            detail: 'Gets access',
          },
          {
            label: `Sharing set "${sharingSet.name}"`,
            detail: count(current?.question_count ?? 0, 'question'),
          },
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const { sharingSet, consumingCourse } = await findSharingTarget(ctx, input);
      const added = await insertSharingSetCourse({
        sharing_course_id: ctx.course.id,
        sharing_set_id: sharingSet.id,
        course_sharing_token: input.course_sharing_token,
      });
      if (added === null) throw new CourseActionError('PrairieLearn could not share the set.');
      return {
        summary: `Shared the sharing set "${sharingSet.name}" with ${consumingCourse.short_name}.`,
      };
    },
  }),
  sharing_choose_name: action({
    group: 'sharing_sets',
    description:
      'Set the name other courses use to refer to this course when they import its shared questions, as in @name/question. A course needs one before it can share questions.',
    effects:
      "Other courses import this course's shared questions under this name. Students see nothing change.",
    undo: 'Choose another name, but only until the first question is shared. After that the name is fixed.',
    permission: 'course_owner',
    feature: 'question-sharing',
    input: z.strictObject({
      sharing_name: CourseSharingNameSchema.describe(
        'The name, made of letters, digits, hyphens, and underscores.',
      ),
    }),
    describe: async ({ ctx, input }) => {
      if (input.sharing_name === ctx.course.sharing_name) {
        throw new CourseActionError(
          `The course's sharing name is already "${input.sharing_name}".`,
        );
      }
      const owner = (await findCoursesBySharingNames([input.sharing_name])).get(input.sharing_name);
      if (owner && owner.id !== ctx.course.id) {
        throw new CourseActionError(
          `Another course already uses the sharing name "${input.sharing_name}". Ask the instructor for a different one.`,
        );
      }
      return {
        title: `Set the course's sharing name to "${input.sharing_name}"`,
        context: 'It can be changed only until the first question is shared.',
        rows: [{ label: 'Sharing name now', detail: ctx.course.sharing_name ?? 'None' }],
      };
    },
    run: async ({ ctx, input }) => {
      const updated = await updateCourseSharingNameIfAllowed({
        course_id: ctx.course.id,
        sharing_name: input.sharing_name,
      });
      if (!updated) {
        throw new CourseActionError(
          'The sharing name can no longer be changed, because the course has already shared a question.',
        );
      }
      return { summary: `Set the course's sharing name to "${input.sharing_name}".` };
    },
  }),
  sharing_regenerate_token: action({
    group: 'sharing_sets',
    description:
      "Replace this course's sharing token, the code its owner gives to other courses so they can share sets with this course. Use it when the token went to someone it should not have.",
    effects:
      'The old token stops working for new sharing. Sets already shared with this course stay shared.',
    undo: null,
    permission: 'course_owner',
    feature: 'question-sharing',
    input: z.strictObject({}),
    describe: async () => ({
      title: "Replace this course's sharing token",
      context: 'The old token stops working, and it cannot be brought back.',
    }),
    run: async ({ ctx }) => {
      if ((await updateCourseSharingToken(ctx.course.id)) === null) {
        throw new CourseActionError('PrairieLearn could not replace the sharing token.');
      }
      // The token is the instructor's to hand out, so it is shown on the page, not sent here.
      return {
        summary: "Replaced the sharing token. The new one is on the course's Sharing page.",
      };
    },
  }),
};
