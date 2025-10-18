import * as crypto from 'crypto';

import * as sqldb from '@prairielearn/postgres';

export async function insertAccessToken(user_id: string, token_name: string) {
  const sql = sqldb.loadSqlEquiv(import.meta.url);

  const name = token_name;
  const token = crypto.randomUUID();
  const token_hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

  await sqldb.execute(sql.insert_access_token, {
    user_id,
    name,
    token,
    token_hash,
  });

  return token;
}
