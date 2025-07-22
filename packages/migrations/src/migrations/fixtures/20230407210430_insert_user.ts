import { queryRows } from '@prairielearn/postgres';

export default async function migrate() {
  await queryRows("INSERT INTO users (name) VALUES ('Test User')", {});
}
