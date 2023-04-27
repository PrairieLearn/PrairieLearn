const assert = require('assert');
const request = require('request');

const { config } = require('../lib/config');
const helperServer = require('./helperServer');

const siteUrl = 'http://localhost:' + config.serverPort;

const redirects = [
  {
    original: '/pl/course/1/question/4',
    redirect: '/pl/course/1/question/4/preview',
  },
  {
    original: '/pl/course_instance/1/instructor/question/4',
    redirect: '/pl/course_instance/1/instructor/question/4/preview',
  },
  {
    original: '/pl/course/1/question/4?variant_id=99',
    redirect: '/pl/course/1/question/4/preview?variant_id=99',
  },
  {
    original: '/pl/course_instance/1/instructor/question/4?variant_id=99',
    redirect: '/pl/course_instance/1/instructor/question/4/preview?variant_id=99',
  },
];

describe('Redirects', function () {
  this.timeout(20000);

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  redirects.forEach((redirect) => {
    it(`redirects ${redirect.original}`, function (done) {
      request(
        {
          url: `${siteUrl}${redirect.original}`,
          // No need to actually request the redirected page; we just
          // want to assert that the response is a redirect and that
          // it will redirect to the right place.
          followRedirect: false,
        },
        (err, response) => {
          assert.ifError(err);
          assert.equal(response.statusCode, 302);
          assert.equal(response.headers.location, redirect.redirect);
          done();
        }
      );
    });
  });
});
