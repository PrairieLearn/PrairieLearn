import * as courseDB from '../apps/prairielearn/dist/sync/course-db.js';
(async () => {
  const courseData = await courseDB.loadFullCourse(null, '/course');
  const errors = [];
  courseDB.writeErrorsAndWarningsForCourseData(null, courseData, (line) =>
    line ? errors.push(line) : null,
  );
  if (errors.length !== 0) {
    errors.forEach((line) => console.error(line));
    process.exit(1);
  }
})().then(() => {});
