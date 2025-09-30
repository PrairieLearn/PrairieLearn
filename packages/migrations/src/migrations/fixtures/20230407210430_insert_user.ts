import { execute } from '@prairielearn/postgres';

export default async function migrate() {
  await execute("INSERT INTO users (name) VALUES ('Test User')");
}
