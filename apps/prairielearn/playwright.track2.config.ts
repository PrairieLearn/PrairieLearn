import base from './playwright.config.js';
process.env.PL_TEST_DATABASE_NAMESPACE = 'pltest_track2';
export default { ...base, workers: 2, reporter: 'list' };
