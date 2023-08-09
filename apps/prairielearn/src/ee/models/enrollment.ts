import { z } from 'zod';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

const EnrollmentCountsSchema = z.object({
  paid: z.number().nullable(),
  free: z.number().nullable(),
});

interface EnrollmentCounts {
  paid: number;
  free: number;
}

export async function getEnrollmentCountsForInstitution({
  institution_id,
  created_since,
}: {
  institution_id: string;
  created_since: string;
}): Promise<EnrollmentCounts> {
  const result = await queryOptionalRow(
    sql.select_enrollment_counts_for_institution,
    { institution_id, created_since },
    EnrollmentCountsSchema,
  );

  return {
    paid: result?.paid ?? 0,
    free: result?.free ?? 0,
  };
}

export async function getEnrollmentCountsForCourseInstance(
  course_instance_id: string,
): Promise<EnrollmentCounts> {
  const result = await queryOptionalRow(
    sql.select_enrollment_counts_for_course_instance,
    { course_instance_id },
    EnrollmentCountsSchema,
  );

  return {
    paid: result?.paid ?? 0,
    free: result?.free ?? 0,
  };
}
