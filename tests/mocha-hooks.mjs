// @ts-check
import { createTemplate, dropTemplate } from './helperDb.js';

export async function mochaGlobalSetup() {
  // Create a global instance of our template database, dropping the existing
  // template database first if needed.
  await createTemplate(this);
}

export async function mochaGlobalTeardown() {
  // Drop the template database to clean up after ourselves.
  await dropTemplate();
}

/**
 * @type {import('mocha').RootHookObject}
 *
 * These hooks run once per worker when Mocha is running in parallel mode.
 * We take advantage of this to create a separate database for each worker.
 */
export const mochaHooks = {
  beforeAll: async function () {},

  afterAll: async function () {},
};
