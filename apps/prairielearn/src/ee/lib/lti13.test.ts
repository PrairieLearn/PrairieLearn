import express, { type Request, type Response } from 'express';
import { assert, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { withServer } from '@prairielearn/express-test-utils';

import { fetchRetry, fetchRetryPaginated, findValueByKey } from './lti13.js';

const PRODUCTS = [
  'Apple',
  'Banana',
  'Cherry',
  'Date',
  'Eggplant',
  'Fig',
  'Grapes',
  'Honeydew',
  'Iceberg',
  'Jackfruit',
  'Kiwi',
  'Lemon',
  'Mango',
  'Nectarine',
  'Orange',
  'Papaya',
  'Quince',
  'Raspberry',
  'Strawberry',
  'Tomato',
  'Ugli fruit',
  'Vanilla',
  'Watermelon',
  'Xigua',
  'Yam',
  'Zucchini',
];

function productApi(req: Request, res: Response) {
  const page = Number.parseInt(req.query.page as string) || 1;
  const limit = Number.parseInt(req.query.limit as string) || 10;

  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const totalPages = Math.ceil(PRODUCTS.length / limit);

  // Base URL for links
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

  // Generate Link Header
  const links: string[] = [];

  if (page < totalPages) {
    links.push(`<${baseUrl}?page=${page + 1}&limit=${limit}>; rel="next"`);
  }
  if (page > 1) {
    links.push(`<${baseUrl}?page=${page - 1}&limit=${limit}>; rel="prev"`);
  }
  links.push(
    `<${baseUrl}?page=1&limit=${limit}>; rel="first"`,
    `<${baseUrl}?page=${totalPages}&limit=${limit}>; rel="last"`,
  );

  res.set('Link', links.join(', '));

  const returning = PRODUCTS.slice(startIndex, endIndex);
  res.json(returning);
}

describe('fetchRetry()', () => {
  const app = express();

  // Run a server to respond to API requests.
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    apiCount++;
    next();
  });

  app.get('/403all', (req, res) => {
    res.status(403).json([]);
  });

  app.get('/403oddAttempt', (req, res) => {
    if (apiCount % 2 === 1) {
      res.status(403).json([]);
    } else {
      productApi(req, res);
    }
  });

  app.get('/', productApi);

  let apiCount: number;

  test.sequential('should return the full list by iterating', async () => {
    apiCount = 0;
    await withServer(app, async ({ url }) => {
      const resultArray = await fetchRetryPaginated(url, {}, { sleepMs: 100 });
      assert.equal(resultArray.length, 3);
      // Unwrap to one combined array
      const products = z.string().array().array().parse(resultArray);
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 3);
    });
  });

  test.sequential('should return the full list with a large limit', async () => {
    apiCount = 0;
    await withServer(app, async ({ url }) => {
      const res = await fetchRetry(url + '?limit=100', {}, { sleepMs: 100 });
      const products = z
        .string()
        .array()
        .parse(await res.json());
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 1);
    });
  });

  test.sequential('should throw an error on all 403s', async () => {
    apiCount = 0;
    await withServer(app, async ({ url }) => {
      await expect(fetchRetry(url + '/403all', {}, { sleepMs: 100 })).rejects.toThrow(
        /fetch error/,
      );
      assert.equal(apiCount, 5);
    });
  });

  test.sequential('should return the full list by iterating with intermittent 403s', async () => {
    apiCount = 0;
    await withServer(app, async ({ url }) => {
      const resultArray = await fetchRetryPaginated(url + '/403oddAttempt', {}, { sleepMs: 100 });
      assert.equal(resultArray.length, 3);
      const products = z.string().array().array().parse(resultArray);
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 6);
    });
  });
});

describe('findValueByKey() generic tests', () => {
  const generic = {
    val1: 'one',
    nest1: {
      val2: 'two',
    },
    array1: [null, { val3: 'three' }],
    nest2: {
      val1: 'nest2',
    },
  };

  test('Top level', () => {
    assert.equal(findValueByKey(generic, 'val1'), 'one');
  });
  test('Nested object', () => {
    assert.equal(findValueByKey(generic, 'val2'), 'two');
  });
  test('Nested array', () => {
    assert.equal(findValueByKey(generic, 'val3'), 'three');
  });
  test('Missing value is undefined', () => {
    assert.isUndefined(findValueByKey(generic, 'missing'));
  });
});

describe('findValueByKey() Canvas errors', () => {
  test('course concluded', () => {
    assert.equal(
      findValueByKey(
        {
          errors: {
            type: 'unprocessable_entity',
            message:
              'This course has concluded. AGS requests will no longer be accepted for this course.',
          },
        },
        'message',
      ),
      'This course has concluded. AGS requests will no longer be accepted for this course.',
    );
  });
  test('user not found', () => {
    assert.equal(
      findValueByKey(
        {
          errors: {
            type: 'unprocessable_entity',
            message: 'User not found in course or is not a student',
          },
        },
        'message',
      ),
      'User not found in course or is not a student',
    );
  });
});
