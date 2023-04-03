// @ts-check
const { z } = require('zod');
const { ConfigLoader } = require('@prairielearn/config');

const ConfigSchema = z.object({
  startServer: z.boolean(),
  postgresqlUser: z.string().default('postgres'),
  postgresqlPassword: z.string().nullable().default(null),
  postgresqlDatabase: z.string().default('postgres'),
  postgresqlHost: z.string().default('localhost'),
  postgresqlPoolSize: z.number().default(100),
  postgresqlIdleTimeoutMillis: z.number().default(30_000),

  courseDirs: z
    .array(z.string())
    .default([
      '/course',
      '/course2',
      '/course3',
      '/course4',
      '/course5',
      '/course6',
      '/course7',
      '/course8',
      '/course9',
      'exampleCourse',
      'testCourse',
    ]),
});

/** @typedef {z.infer<typeof ConfigSchema>} Config */

const loader = new ConfigLoader({
  schema: ConfigSchema,
  // TODO: use schema to define defaults?
  defaults: {},
});
