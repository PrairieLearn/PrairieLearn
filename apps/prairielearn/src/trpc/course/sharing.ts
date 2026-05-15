import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getOriginalHash } from '../../lib/editorUtil.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import {
  findCoursesBySharingNames,
  selectOptionalCourseBySharingToken,
  updateCourseSharingNameIfAllowed,
} from '../../models/course.js';
import { selectSharingSetUsage, selectSharingSetsForCourse } from '../../models/sharing-set.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionOwn, requireNotExampleCourse, t } from './init.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface SharingError {
  ListSharingSets: never;
  RegenerateSharingToken: never;
  AddCourseToSharingSet: never;
  CreateSharingSet:
    | { code: 'DUPLICATE_NAME'; name: string }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  UpdateSharingSetDescription:
    | { code: 'NOT_FOUND'; name: string }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DeleteSharingSet:
    | { code: 'IN_USE'; name: string }
    | { code: 'NOT_FOUND'; name: string }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  ChooseSharingName: { code: 'DUPLICATE_NAME'; name: string };
}

const SharingSetNameSchema = z
  .string()
  .trim()
  .min(1, 'Sharing set name is required.')
  .refine((v) => !v.includes('/') && !v.includes('@'), {
    message: 'Sharing set name cannot contain "/" or "@".',
  });

const SharingNameSchema = z
  .string()
  .trim()
  .min(1, 'Course sharing name is required.')
  .refine((v) => !v.includes('/') && !v.includes('@'), {
    message: 'Course sharing name cannot contain "/" or "@".',
  });

const requireQuestionSharingEnabled = t.middleware(async (opts) => {
  if (!opts.ctx.locals.question_sharing_enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (feature not available)',
    });
  }
  return opts.next();
});

async function readCourseInfo(coursePath: string) {
  const infoCoursePath = path.join(coursePath, 'infoCourse.json');
  if (!(await fs.pathExists(infoCoursePath))) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'infoCourse.json does not exist',
    });
  }
  const courseInfo = JSON.parse(await fs.readFile(infoCoursePath, 'utf8'));
  const sharingSets: { name: string; description?: string }[] = Array.isArray(
    courseInfo.sharingSets,
  )
    ? courseInfo.sharingSets
    : [];
  return { infoCoursePath, courseInfo, sharingSets };
}

type WriteCourseInfoResult = { ok: true; newHash: string } | { ok: false; jobSequenceId: string };

async function writeCourseInfo({
  locals,
  coursePath,
  infoCoursePath,
  courseInfo,
  sharingSets,
  origHash,
}: {
  locals: ResLocalsForPage<'course'>;
  coursePath: string;
  infoCoursePath: string;
  courseInfo: Record<string, unknown>;
  sharingSets: { name: string; description?: string }[];
  origHash: string;
}): Promise<WriteCourseInfoResult> {
  if (sharingSets.length > 0) {
    courseInfo.sharingSets = sharingSets;
  } else {
    delete courseInfo.sharingSets;
  }

  const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

  const editor = new FileModifyEditor({
    locals,
    container: {
      rootPath: coursePath,
      invalidRootPaths: [],
    },
    filePath: infoCoursePath,
    editContents: b64EncodeUnicode(formattedJson),
    origHash,
  });

  const serverJob = await editor.prepareServerJob();
  try {
    await editor.executeWithServerJob(serverJob);
  } catch {
    return { ok: false, jobSequenceId: serverJob.jobSequenceId };
  }

  const newHash = (await getOriginalHash(infoCoursePath)) ?? '';
  return { ok: true, newHash };
}

const regenerateSharingToken = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .mutation(async ({ ctx }) => {
    const sharingToken = await sqldb.queryOptionalScalar(
      sql.update_sharing_token,
      { course_id: ctx.course.id },
      z.string(),
    );
    if (sharingToken === null) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to regenerate sharing token.',
      });
    }
    return { sharingToken };
  });

const addCourseToSharingSet = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      sharingSetId: IdSchema,
      courseSharingToken: z.string().min(1, 'Course sharing token is required.'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (input.courseSharingToken === ctx.locals.course.sharing_token) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          "This is your own course's sharing token. Paste another course's sharing token here to grant them access to this sharing set; your course already owns it.",
      });
    }
    const consumingCourse = await selectOptionalCourseBySharingToken(input.courseSharingToken);
    if (consumingCourse === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Unknown sharing token. Verify that you copied the token correctly from the other course.',
      });
    }
    const consuming_course_id = await sqldb.queryOptionalScalar(
      sql.course_sharing_set_add,
      {
        sharing_course_id: ctx.course.id,
        sharing_set_id: input.sharingSetId,
        course_sharing_token: input.courseSharingToken,
      },
      z.string().nullable(),
    );
    if (consuming_course_id === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Failed to add course to sharing set.',
      });
    }
  });

const createSharingSet = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      name: SharingSetNameSchema,
      description: z.string().trim().optional(),
      origHash: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { infoCoursePath, courseInfo, sharingSets } = await readCourseInfo(ctx.course.path);

    if (sharingSets.some((s) => s.name === input.name)) {
      throwAppError<SharingError['CreateSharingSet']>({
        code: 'DUPLICATE_NAME',
        message: `A sharing set named "${input.name}" already exists.`,
        name: input.name,
      });
    }

    sharingSets.push({
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
    });

    const result = await writeCourseInfo({
      locals: ctx.locals,
      coursePath: ctx.course.path,
      infoCoursePath,
      courseInfo,
      sharingSets,
      origHash: input.origHash,
    });

    if (!result.ok) {
      throwAppError<SharingError['CreateSharingSet']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to create sharing set',
        jobSequenceId: result.jobSequenceId,
      });
    }

    return { origHash: result.newHash };
  });

const updateSharingSetDescription = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      name: z.string().min(1),
      description: z.string().trim().optional(),
      origHash: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { infoCoursePath, courseInfo, sharingSets } = await readCourseInfo(ctx.course.path);

    const index = sharingSets.findIndex((s) => s.name === input.name);
    if (index === -1) {
      throwAppError<SharingError['UpdateSharingSetDescription']>({
        code: 'NOT_FOUND',
        message: `Sharing set "${input.name}" not found in infoCourse.json.`,
        name: input.name,
      });
    }

    if (input.description) {
      sharingSets[index] = { ...sharingSets[index], description: input.description };
    } else {
      const { description: _description, ...rest } = sharingSets[index];
      sharingSets[index] = rest;
    }

    const result = await writeCourseInfo({
      locals: ctx.locals,
      coursePath: ctx.course.path,
      infoCoursePath,
      courseInfo,
      sharingSets,
      origHash: input.origHash,
    });

    if (!result.ok) {
      throwAppError<SharingError['UpdateSharingSetDescription']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to update sharing set description',
        jobSequenceId: result.jobSequenceId,
      });
    }

    return { origHash: result.newHash };
  });

const deleteSharingSetProcedure = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      name: z.string().min(1),
      origHash: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { infoCoursePath, courseInfo, sharingSets } = await readCourseInfo(ctx.course.path);

    const usage = await selectSharingSetUsage({
      course_id: ctx.course.id,
      name: input.name,
    });
    if (usage.question_count > 0 || usage.consumer_count > 0) {
      throwAppError<SharingError['DeleteSharingSet']>({
        code: 'IN_USE',
        message: `Cannot delete sharing set "${input.name}" because it contains questions or has been shared with other courses.`,
        name: input.name,
      });
    }

    const before = sharingSets.length;
    const filtered = sharingSets.filter((s) => s.name !== input.name);
    if (filtered.length === before) {
      throwAppError<SharingError['DeleteSharingSet']>({
        code: 'NOT_FOUND',
        message: `Sharing set "${input.name}" not found in infoCourse.json.`,
        name: input.name,
      });
    }

    sharingSets.splice(0, sharingSets.length, ...filtered);

    const result = await writeCourseInfo({
      locals: ctx.locals,
      coursePath: ctx.course.path,
      infoCoursePath,
      courseInfo,
      sharingSets,
      origHash: input.origHash,
    });

    if (!result.ok) {
      throwAppError<SharingError['DeleteSharingSet']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to delete sharing set',
        jobSequenceId: result.jobSequenceId,
      });
    }

    return { origHash: result.newHash };
  });

const chooseSharingName = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .use(requireNotExampleCourse)
  .input(z.object({ courseSharingName: SharingNameSchema }))
  .mutation(async ({ input, ctx }) => {
    const existing = await findCoursesBySharingNames([input.courseSharingName]);
    const owner = existing.get(input.courseSharingName);
    if (owner && owner.id !== ctx.course.id) {
      throwAppError<SharingError['ChooseSharingName']>({
        code: 'DUPLICATE_NAME',
        name: input.courseSharingName,
        message: `Another course already uses the sharing name "${input.courseSharingName}".`,
      });
    }

    const updated = await updateCourseSharingNameIfAllowed({
      course_id: ctx.course.id,
      sharing_name: input.courseSharingName,
    });
    if (!updated) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Unable to change sharing name. At least one question has been shared.',
      });
    }
  });

const listSharingSets = t.procedure
  .use(requireCoursePermissionOwn)
  .use(requireQuestionSharingEnabled)
  .query(async ({ ctx }) => {
    return await selectSharingSetsForCourse({ course_id: ctx.course.id });
  });

export const sharingRouter = t.router({
  listSharingSets,
  regenerateSharingToken,
  addCourseToSharingSet,
  createSharingSet,
  updateSharingSetDescription,
  deleteSharingSet: deleteSharingSetProcedure,
  chooseSharingName,
});
