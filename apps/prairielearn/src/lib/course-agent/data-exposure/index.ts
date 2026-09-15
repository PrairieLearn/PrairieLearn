import { loadPublicCatalog } from './catalog.js';
import { assertCourseAgentManifestValid, validateCourseAgentManifest } from './validate.js';

export async function assertCourseAgentDataExposureMatchesDatabase(): Promise<void> {
  const catalog = await loadPublicCatalog();
  assertCourseAgentManifestValid(
    validateCourseAgentManifest({
      columns: catalog.columns,
      foreignKeys: catalog.foreignKeys,
    }),
  );
}

export {
  assertCanAccessRelation,
  contextSatisfiesAuthz,
  hasCourseWideConfigurationAccess,
} from './authorize.js';
export { loadPublicCatalog } from './catalog.js';
export {
  getCourseAgentLogicalSchema,
  renderCourseAgentLogicalSchemaMarkdown,
} from './logical-schema.js';
export { COURSE_AGENT_RELATIONS, getCourseAgentRelation } from './manifest.js';
export { bindScopeParams, buildRelationScopePredicate } from './scope-sql.js';
export type { CourseAgentLogicalSchema } from './logical-schema.js';
export type { CourseAgentAuthzContext, CourseAgentRelation } from './types.js';
export { assertCourseAgentManifestValid, validateCourseAgentManifest } from './validate.js';
