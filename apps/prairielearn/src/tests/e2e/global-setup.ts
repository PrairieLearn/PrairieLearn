import { createTemplate, databaseExists } from '../helperDb.js';

const POSTGRES_DATABASE_TEMPLATE = 'pltest_template';

export default async function globalSetup() {
  // We setup the template once, so that each worker does not try to create it.
  const templateExists = await databaseExists(POSTGRES_DATABASE_TEMPLATE);
  if (!templateExists) {
    await createTemplate();
  }
}
