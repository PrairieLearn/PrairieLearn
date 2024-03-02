const serverJobs = require('../lib/server-jobs-legacy');

module.exports.run = async () => {
  await serverJobs.errorAbandonedJobs();
};
