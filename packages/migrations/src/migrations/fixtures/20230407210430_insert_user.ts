import { queryAsync } from '@prairielearn/postgres';

export default async function migrate() {
  await queryAsync("INSERT INTO users (name) VALUES ('Test User')", {});
}
