import { config } from '../../lib/config';

export type AuthUser = {
  name: string;
  uid: string;
  uin: string;
};

export async function withUser<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
  const originalName = config.authName;
  const originalUid = config.authUid;
  const originalUin = config.authUin;

  try {
    config.authName = user.name;
    config.authUid = user.uid;
    config.authUin = user.uin;

    return await fn();
  } finally {
    config.authName = originalName;
    config.authUid = originalUid;
    config.authUin = originalUin;
  }
}
