import { queryAsync } from '@prairielearn/postgres';

module.exports = async function migrate() {
  await queryAsync("INSERT INTO users (name) VALUES ('Test User')", {});
};
