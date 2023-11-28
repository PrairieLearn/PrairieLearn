// @ts-check
import { config } from './config';

/**
 * This function may only return `true` if the user has obtained a contract,
 * subscription, or other agreement for the use of PrairieLearn Enterprise
 * Edition from PrairieLearn, Inc., or if the user is doing local development/testing of features
 * that use Enterprise Edition code. See the license at `ee/LICENSE` for full
 * details.
 *
 * @returns Whether or not the server has access to Enterprise Edition features.
 */
export function isEnterprise() {
  return config.isEnterprise ?? false;
}
