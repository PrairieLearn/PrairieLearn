import * as crypto from 'node:crypto';

import { createTRPCProxyClient, httpLink, unstable_localLink } from '@trpc/client';
import * as jose from 'jose';

import { type CourseFilesRouter, courseFilesRouter } from '../api/trpc/index.js';

import { config } from './config.js';

type CourseFilesClient = ReturnType<typeof createTRPCProxyClient<CourseFilesRouter>>;

function getCourseFilesLink() {
  if (config.courseFilesApiTransport === 'process') {
    return unstable_localLink({
      router: courseFilesRouter,
      createContext: async () => ({ jwt: null, bypassJwt: true }),
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
