// @ts-check
const {
  loadSqlEquiv,
  queryAsync,
  queryValidatedSingleColumnOneRow,
} = require('@prairielearn/postgres');
const { z } = require('zod');

const config = require('../config');

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
 *
 * @enum {string}
 */
const FeatureGrantType = {
  /**
   * A feature grant that was applied by default for a given context. For
   * instance, we might want to enable a certain feature for all courses when
   * they are created.
   */
  Default: 'default',
  /**
   * A feature flag that has been manually enabled by an administrator.
   */
  Manual: 'manual',
  /**
   * A feature flag that has been enabled as part of a subscription plan.
   */
  Subscription: 'subscription',
};

/**
 * @typedef {{}} EmptyContext
 */

/**
 * @typedef {Object} UserContext
 * @property {string} user_id
 */

/**
 * @typedef {Partial<UserContext> & { institution_id: string }} InstitutionContext
 */

/**
 * @typedef {InstitutionContext & { course_id: string }} CourseContext
 */

/**
 * @typedef {CourseContext & { course_instance_id: string }} CourseInstanceContext
 */

/**
 * @typedef {EmptyContext | UserContext | InstitutionContext | CourseContext | CourseInstanceContext} FeatureContext
 */

/**
 * @param {FeatureContext} context
 */
function validateContext(context) {
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

class FeatureManager {
  /** @param {string[]} features */
  constructor(features) {
    this.features = new Set(features);
  }

  /**
   * @private
   * @param {string} name
   * @param {FeatureContext} context
   */
  validateFeature(name, context) {
    if (!this.features.has(name)) {
      throw new Error(`Unknown feature: ${name}`);
    }
    validateContext(context);
  }

  /**
   * Checks if the given feature is enabled for the given context.
   *
   * @param {string} name The name of the feature.
   * @param {FeatureContext} [context] A context to use when evaluating the feature.
   * @returns {Promise<boolean>} Whether or not the feature is enabled
   */
  async enabled(name, context = {}) {
    this.validateFeature(name, context);

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

    // Allow config to globally enable a feature; mostly useful for testing.
    if (config.enabledFeatures.includes(name)) return true;

    // Default to disabled if not explicitly enabled by a specific grant or config.
    return false;
  }

  /**
   * Enables the feature for the given context.
   *
   * @param {string} name The name of the feature.
   * @param {FeatureGrantType} type The type of grant that is being applied.
   * @param {FeatureContext} [context] The context for which the feature should be enabled.
   */
  async enable(name, type, context = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.enable_feature, { name, type, ...DEFAULT_CONTEXT, ...context });
  }

  /**
   * Disables the feature for the given context.
   *
   * @param {string} name The name of the feature.
   * @param {FeatureContext} [context] The context for which the feature should be disabled.
   */
  async disable(name, context = {}) {
    this.validateFeature(name, context);
    await queryAsync(sql.disable_feature, { name, ...DEFAULT_CONTEXT, ...context });
  }
}

module.exports.FeatureManager = FeatureManager;
module.exports.FeatureGrantType = FeatureGrantType;
