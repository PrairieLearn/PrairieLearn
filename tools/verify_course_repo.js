const courseDB = require('../sync/course-db');
(async () => {
  const courseData = await courseDB.loadFullCourseNew('/course');
  const errors = [];
  courseDB.writeErrorsAndWarningsForCourseData(null, courseData, (line) =>
    line ? errors.push(line) : null,
  );
  if (errors.length !== 0) {
    errors.forEach((line) => console.error(line));
    process.exit(1);
  }
})();
