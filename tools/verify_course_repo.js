const courseDB = require('../apps/prairielearn/dist/sync/course-db');
(async () => {
  const courseData = await courseDB.loadFullCourse('/course');
  const errors = [];
  courseDB.writeErrorsAndWarningsForCourseData(null, courseData, (line) =>
    line ? errors.push(line) : null,
  );
  if (errors.length !== 0) {
    errors.forEach((line) => console.error(line));
    process.exit(1);
  }
})().then(() => {});
