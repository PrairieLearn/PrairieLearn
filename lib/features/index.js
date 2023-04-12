// @ts-check
const config = require('../config');

/**
 * @typedef {Object} Feature
 */

/**
 * @typedef {Object} UserContext
 * @property {string} user_id
 */

/**
 * @typedef {Object} InstitutionContext
 * @property {string} institution_id
 */

/**
 * @typedef {Object} CourseContext
 * @extends {InstitutionContext}
 * @property {string} course_id
 */

/**
 * @typedef {Object} CourseInstanceContext
 * @extends {CourseContext}
 * @property {string} course_instance_id
 */

/**
 * @typedef {UserContext | InstitutionContext | CourseContext | CourseInstanceContext} FeatureContext
 */

class FeatureManager {
  /**
   * @private
   * @type {Object<string, Feature>}
   */
  registeredFeatures = Object.create(null);

  /**
   * Registers the given feature.
   * @param {string} name
   * @param {Feature} feature
   */
  register(name, feature) {
    this.registeredFeatures[name] = feature;
  }

  /**
   * Checks if the given feature is enabled for the given context.
   *
   * @param {string} name The name of the feature.
   * @param {FeatureContext} context A context to use when evaluating the feature.
   * @returns {Promise<boolean>} Whether or not the feature is enabled
   */
  async enabled(name, context) {
    // Fall back to picking the default value from the config.
    const configEnabled = config.features[name];
    if (configEnabled) return configEnabled;

    // Default to disabled if not explicitly enabled by a specific grant or default.
    return false;
  }

  async enable(name, context) {}
}

const defaultFeatureManager = new FeatureManager();

defaultFeatureManager.register('course:manual-grading');

module.exports = { features: defaultFeatureManager };
