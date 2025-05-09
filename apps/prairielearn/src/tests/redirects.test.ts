import fetch from 'node-fetch';
import { assert, describe, it, beforeAll, afterAll } from 'vitest';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

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
  // set up testing server
  beforeAll(helperServer.before());
  // shut down testing server
  afterAll(helperServer.after);

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
}, 20_000);
