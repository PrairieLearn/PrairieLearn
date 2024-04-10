import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';

import { config } from '../config';

const sql = loadSqlEquiv(__filename);

const IsFeatureEnabledSchema = z.object({
  has_feature_grant: z.boolean(),
  course_dev_mode_features: z.unknown(),
});

const CONTEXT_HIERARCHY = ['institution_id', 'course_id', 'course_instance_id'];
const DEFAULT_CONTEXT = {
  institution_id: null,
  course_id: null,
  course_instance_id: null,
  user_id: null,
};

export type FeatureOverrides = Record<string, boolean>;

type EmptyContext = Record<string, never>;

interface UserContext {
  user_id: string;
}

interface InstitutionContext extends Partial<UserContext> {
  institution_id: string;
}

interface CourseContext extends InstitutionContext {
  course_id: string;
}

interface CourseInstanceContext extends CourseContext {
  course_instance_id: string;
}

type FeatureContext =
  | EmptyContext
  | UserContext
  | InstitutionContext
  | CourseContext
  | CourseInstanceContext;

export class FeatureManager<FeatureName extends string> {
  features: Set<string>;
  als: AsyncLocalStorage<FeatureOverrides>;
  globalOverrides: FeatureOverrides = {};

  constructor(features: readonly FeatureName[]) {
    features.forEach((feature) => {
      if (!feature.match(/^[a-z0-9:_-]+$/)) {
        throw new Error(`Invalid feature name: ${feature}`);
      }
    });
    this.features = new Set(features);
    this.als = new AsyncLocalStorage<FeatureOverrides>();
  }

  private validateFeature(name: FeatureName, context: FeatureContext) {
    if (!this.features.has(name)) {
      throw new Error(`Unknown feature: ${name}`);
    }
    this.validateContext(context);
  }

  hasFeature(feature: string): feature is FeatureName {
    return this.features.has(feature);
  }

  allFeatures() {
    return [...this.features] as FeatureName[];
  }

  /**
   * Checks if the given feature is enabled for the given context.
   *
   * @param name The name of the feature.
   * @param context A context to use when evaluating the feature.
   * @returns Whether or not the feature is enabled
   */
  async enabled(name: FeatureName, context: FeatureContext = {}): Promise<boolean> {
    this.validateFeature(name, context);

    // Allow features to be overridden by `runWithOverrides`.
    const featureOverrides = this.als.getStore() ?? {};
    if (name in featureOverrides) return featureOverrides[name];

    // Allow global overrides, e.g. for tests.
    if (name in this.globalOverrides) return this.globalOverrides[name];

    // Allow config to globally override a feature.
    if (name in config.features) return config.features[name];

    const featureIsEnabled = await queryRow(
      sql.is_feature_enabled,
      {
        name,
        ...DEFAULT_CONTEXT,
        ...context,
      },
      IsFeatureEnabledSchema,
    );

    if (featureIsEnabled.has_feature_grant) return true;

    // Allow features to be enabled in dev mode via `options.devModeFeatures`
    // in `infoCourse.json`.
    //
    // We could check for the feature in the array in SQL, but it's easier to
    // write this more defensively in JavaScript.
    if (
      config.devMode &&
      Array.isArray(featureIsEnabled.course_dev_mode_features) &&
      featureIsEnabled.course_dev_mode_features.includes(name)
    ) {
      return true;
    }

    // Default to disabled if not explicitly enabled by a specific grant, config,
    // or course options.
    return false;
  }

  /**
   * Checks if the given feature is enabled based on the context derived from locals populated from
   * middlewares.
   *
   * @param name The name of the feature.
   * @param locals The locals field authenticated and populated by middlewares.
   * @returns Whether or not the feature is enabled
   */
  async enabledFromLocals(
    name: FeatureName,
    locals: {
      institution?: { id: string };
      course?: { id: string };
      course_instance?: { id: string };
      user?: { user_id: string };
    },
  ): Promise<boolean> {
    const user_context = locals.user && { user_id: locals.user.user_id };
    if (!locals.institution) {
      return this.enabled(name, user_context);
    } else if (!locals.course) {
      return this.enabled(name, {
        institution_id: locals.institution.id,
        ...user_context,
      });
    } else if (!locals.course_instance) {
      return this.enabled(name, {
        institution_id: locals.institution.id,
        course_id: locals.course.id,
        ...user_context,
      });
    } else {
      return this.enabled(name, {
        institution_id: locals.institution.id,
        course_id: locals.course.id,
        course_instance_id: locals.course_instance.id,
        ...user_context,
      });
    }
  }

  /**
   * Enables the feature for the given context.
   *
   * @param name The name of the feature.
   * @param type The type of grant that is being applied.
   * @param context The context for which the feature should be enabled.
   */
  async enable(name: FeatureName, context: FeatureContext = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.enable_feature, { name, ...DEFAULT_CONTEXT, ...context });
  }

  /**
   * Disables the feature for the given context.
   *
   * @param name The name of the feature.
   * @param context The context for which the feature should be disabled.
   */
  async disable(name: FeatureName, context: FeatureContext = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.disable_feature, { name, ...DEFAULT_CONTEXT, ...context });
  }

  /**
   * Runs the given function with a set of feature overrides persisted in
   * {@link AsyncLocalStorage}. This allows for a feature to be enabled or
   * disabled in the context of a single request.
   */
  runWithOverrides<T>(overrides: FeatureOverrides, fn: () => T): T {
    return this.als.run(overrides, fn);
  }

  /**
   * Globally sets the given feature overrides and automatically cleans them up
   * once the provided function has executed.
   *
   * Note that this should generally only be used in tests. If used while serving
   * actual requests, this will have unintended behavior since the overrides will
   * apply to all code that is running at the same time.
   */
  async runWithGlobalOverrides<T>(overrides: FeatureOverrides, fn: () => Promise<T>): Promise<T> {
    const originalGlobalOverrides = this.globalOverrides;
    this.globalOverrides = { ...originalGlobalOverrides, ...overrides };
    try {
      return await fn();
    } finally {
      this.globalOverrides = originalGlobalOverrides;
    }
  }

  validateContext(context: object): FeatureContext {
    let hasAllParents = true;
    CONTEXT_HIERARCHY.forEach((key, index) => {
      const hasKey = !!context[key];
      if (hasKey && !hasAllParents) {
        const missingKeys = CONTEXT_HIERARCHY.slice(0, index - 1);
        throw new Error(`Missing required context keys: ${missingKeys.join(', ')}`);
      }
      hasAllParents = hasKey;
    });
    return context as FeatureContext;
  }
}
