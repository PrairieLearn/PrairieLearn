import * as crypto from 'node:crypto';

import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import * as jose from 'jose';

import { type CourseFilesRouter, courseFilesRouter } from '../api/trpc/index.js';

import { config } from './config.js';

export type CourseFilesClient = ReturnType<typeof createTRPCProxyClient<CourseFilesRouter>>;

function getCourseFilesLink() {
  if (config.courseFilesApiTransport === 'process') {
    // Based on code from the following issue:
    // https://github.com/trpc/trpc/issues/3768
    return httpLink({
      // Dummy URL; won't actually be used.
      url: 'https://local',
      async fetch(...args) {
        return await fetchRequestHandler({
          endpoint: '',
          req: new Request(...args),
          router: courseFilesRouter,
          createContext: () => ({ jwt: null, bypassJwt: true }),
        });
      },
    });
  }

  const { courseFilesApiUrl, trpcSecretKeys } = config;

  if (!courseFilesApiUrl) {
    throw new Error('Course files API URL is not configured');
  }

  if (!trpcSecretKeys?.length) {
    throw new Error('Internal API secret keys are not configured');
  }

  // The first secret key is always used for signing. Multiple keys can be
  // specified to allow for key rotation.
  const secretKey = trpcSecretKeys[0];

  return httpLink({
    url: courseFilesApiUrl,
    headers: async () => {
      const secret = crypto.createSecretKey(secretKey, 'utf-8');
      const jwt = await new jose.SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('PrairieLearn')
        .sign(secret);

      return {
        Authorization: `Bearer ${jwt}`,
      };
    },
  });
}

let cachedCourseFilesClient: CourseFilesClient | null = null;

export function getCourseFilesClient() {
  cachedCourseFilesClient ??= createTRPCProxyClient<CourseFilesRouter>({
    links: [getCourseFilesLink()],
  });

  return cachedCourseFilesClient;
}
