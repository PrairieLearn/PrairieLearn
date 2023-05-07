import { loadSqlEquiv, queryAsync, queryValidatedSingleColumnOneRow } from '@prairielearn/postgres';
import { z } from 'zod';

import { config } from '../config';

const sql = loadSqlEquiv(__filename);

const CONTEXT_HIERARCHY = ['institution_id', 'course_id', 'course_instance_id'];
const DEFAULT_CONTEXT = {
  institution_id: null,
  course_id: null,
  course_instance_id: null,
  user_id: null,
};

/**
 * Grants can have different types, which can be used to determine how they
 * were applied. These are mostly meant to be consumed by administrators who
 * need to be able to tell if a feature was enabled by default, set manually
 * by another administrator, or enabled as part of a subscription plan.
 */
export enum FeatureGrantType {
  /**
   * A feature grant that was applied by default for a given context. For
   * instance, we might want to enable a certain feature for all courses when
   * they are created.
   */
  Default = 'default',
  /**
   * A feature flag that has been manually enabled by an administrator.
   */
  Manual = 'manual',
  /**
   * A feature flag that has been enabled as part of a subscription plan.
   */
  Subscription = 'subscription',
}

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

function validateContext(context: FeatureContext) {
  let hasAllParents = true;
  CONTEXT_HIERARCHY.forEach((key, index) => {
    const hasKey = !!context[key];
    if (hasKey && !hasAllParents) {
      const missingKeys = CONTEXT_HIERARCHY.slice(0, index - 1);
      throw new Error(`Missing required context keys: ${missingKeys.join(', ')}`);
    }
    hasAllParents = hasKey;
  });
}

export class FeatureManager<FeatureNames extends string> {
  features: Set<string>;

  constructor(features: FeatureNames[]) {
    features.forEach((feature) => {
      if (!feature.match(/^[a-z0-9:_-]+$/)) {
        throw new Error(`Invalid feature name: ${feature}`);
      }
    });
    this.features = new Set(features);
  }

  private validateFeature(name: FeatureNames, context: FeatureContext) {
    if (!this.features.has(name)) {
      throw new Error(`Unknown feature: ${name}`);
    }
    validateContext(context);
  }

  allFeatures() {
    return [...this.features];
  }

  /**
   * Checks if the given feature is enabled for the given context.
   *
   * @param name The name of the feature.
   * @param context A context to use when evaluating the feature.
   * @returns Whether or not the feature is enabled
   */
  async enabled(name: FeatureNames, context: FeatureContext = {}): Promise<boolean> {
    this.validateFeature(name, context);

    // Allow config to globally override a feature.
    if (name in config.features) return config.features[name];

    const featureIsEnabled = await queryValidatedSingleColumnOneRow(
      sql.is_feature_enabled,
      {
        name,
        ...DEFAULT_CONTEXT,
        ...context,
      },
      z.boolean()
    );
    if (featureIsEnabled) return true;

    // Default to disabled if not explicitly enabled by a specific grant or config.
    return false;
  }

  /**
   * Enables the feature for the given context.
   *
   * @param name The name of the feature.
   * @param type The type of grant that is being applied.
   * @param context The context for which the feature should be enabled.
   */
  async enable(name: FeatureNames, type: FeatureGrantType, context: FeatureContext = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.enable_feature, { name, type, ...DEFAULT_CONTEXT, ...context });
  }

  /**
   * Disables the feature for the given context.
   *
   * @param name The name of the feature.
   * @param context The context for which the feature should be disabled.
   */
  async disable(name: FeatureNames, context: FeatureContext = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.disable_feature, { name, ...DEFAULT_CONTEXT, ...context });
  }
}
