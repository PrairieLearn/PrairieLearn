import { z } from 'zod';
import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types';
import { features } from '../../lib/features';
import { LTI13InstancePlatforms } from '../pages/institutionAdminLti13/institutionAdminLti13.types';

const sql = loadSqlEquiv(__filename);

export async function selectLti13Instance(lti13_instance_id: string): Promise<Lti13Instance> {
  const lti13_instance = await queryOptionalRow(
    sql.select_lti13_instance,
    {
      lti13_instance_id,
    },
    Lti13InstanceSchema,
  );

  if (!lti13_instance) {
    throw new Error(`LTI 1.3 instance ID ${lti13_instance_id} is unavailable`);
  }

  return lti13_instance;
}

export async function validateLti13CourseInstance(resLocals: Record<string, any>): Promise<boolean> {

  const feature_enabled = await features.enabledFromLocals('lti13', resLocals);

  // Shortcut to save a SQL query if we don't need to run it
  if (!feature_enabled) {
    return false;
  }

  const ci_lti13_connected = await queryRow(sql.select_ci_validation, {
    course_instance_id: resLocals.course_instance.id,
  }, z.boolean());

  return feature_enabled && ci_lti13_connected;
}

export async function selectLti13InstancesByCourseInstance(course_instance_id: string): Promise<Lti13Instance[]> {

  const instances = await queryRows(sql.get_instances_ci, {
    course_instance_id,
  }, Lti13InstanceSchema,
  );

  if (!instances?.length) {
    throw new Error('No LTI 1.3 instances configured for course instance');
  }

  return instances;
}
