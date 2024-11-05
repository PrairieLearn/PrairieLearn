import * as crypto from 'node:crypto';

import { createTRPCProxyClient, httpLink } from '@trpc/client';
import * as jose from 'jose';

import { caller, type AppRouter } from '../api/trpc/index.js';

import { config } from './config.js';

export async function getCourseFilesApi() {
  if (config.courseFilesApiMode === 'process') {
    return caller.course;
  } else {
    if (!config.courseFilesApiUrl) {
      throw new Error('Course files API URL is not configured');
    }

    if (!config.internalApiSecretKey) {
      throw new Error('Internal API secret key is not configured');
    }

    const secret = crypto.createSecretKey(config.internalApiSecretKey, 'utf-8');
    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('PrairieLearn')
      .sign(secret);

    return createTRPCProxyClient<AppRouter>({
      links: [
        httpLink({
          url: config.courseFilesApiUrl,
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        }),
      ],
    }).course;
  }
}
