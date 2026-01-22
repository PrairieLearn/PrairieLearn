import { execute, loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export async function updateCourseRepo(repo: string) {
  await execute(sql.update_course_repo, { repo });
}
