import { describe, expect, it } from 'vitest';

import { ConfigSchema } from './config.js';

const CourseAgentWorkerOriginSchema = ConfigSchema.shape.courseAgentWorkerOrigin;

describe('courseAgentWorkerOrigin', () => {
  it.each([
    'https://course-agent.example.com',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
    'http://[::1]:8787',
  ])('accepts %s', (origin) => {
    expect(CourseAgentWorkerOriginSchema.parse(origin)).toBe(origin);
  });

  it.each(['http://course-agent.example.com', 'http://localhost.example.com'])(
    'rejects %s',
    (origin) => {
      expect(() => CourseAgentWorkerOriginSchema.parse(origin)).toThrow(
        'Course-agent Worker origin must use HTTPS unless it is a loopback development URL',
      );
    },
  );
});
