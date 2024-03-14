import { assert } from 'chai';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as helperServer from './helperServer';

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
    it(`redirects ${redirect.original}`, async () => {
      const response = await fetch(`${siteUrl}${redirect.original}`, {
        // No need to actually request the redirected page; we just
        // want to assert that the response is a redirect and that
        // it will redirect to the right place.
        redirect: 'manual',
      });
      assert.equal(response.status, 302);
      const locationHeader = response.headers.get('location');
      assert(locationHeader);
      const location = new URL(locationHeader, siteUrl);
      assert.equal(location.pathname + location.search, redirect.redirect);
    });
  });
});
