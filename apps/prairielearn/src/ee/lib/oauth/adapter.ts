import * as crypto from 'node:crypto';

import type { Adapter, AdapterPayload } from 'oidc-provider';

import { IdSchema } from '@prairielearn/zod';

import {
  consumeOauthRecord,
  deleteOauthRecord,
  deleteOauthRecordsByGrantId,
  selectOptionalOauthRecord,
  selectOptionalOauthRecordByUid,
  upsertOauthRecord,
} from '../../models/oauth-record.js';

// The library asks for an adapter per kind of record. Any other kind belongs to a feature that is
// turned off, some of which need guarantees this adapter does not make, so it is refused.
const MODELS = new Set([
  'AccessToken',
  'AuthorizationCode',
  'Client',
  'Grant',
  'Interaction',
  'RefreshToken',
  'Session',
]);

// The ID of one of these is the value its holder presents to get access, so only its hash is
// stored, and the copy the library puts in the payload (`jti`) is left out. A session's or
// interaction's ID is also presented, but in a cookie the library signs, so the ID alone is no use.
const HASHED_ID_MODELS = new Set(['AccessToken', 'AuthorizationCode', 'RefreshToken']);

/** Stores the oidc-provider library's records in `oauth_records`. */
export class OauthRecordAdapter implements Adapter {
  private readonly hashed: boolean;

  constructor(private readonly model: string) {
    if (!MODELS.has(model)) throw new Error(`OAuth record kind ${model} is not supported`);
    this.hashed = HASHED_ID_MODELS.has(model);
  }

  private key(id: string) {
    return {
      model: this.model,
      id: this.hashed ? crypto.createHash('sha256').update(id, 'utf8').digest('hex') : id,
    };
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
    const { jti: _jti, ...stored } = payload;
    await upsertOauthRecord({
      ...this.key(id),
      payload: this.hashed ? stored : payload,
      grant_id: payload.grantId ?? null,
      uid: payload.uid ?? null,
      // Accounts are PrairieLearn users, so the account ID is the user's ID.
      user_id: payload.accountId == null ? null : IdSchema.parse(payload.accountId),
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const record = await selectOptionalOauthRecord(this.key(id));
    if (!record) return undefined;
    return {
      ...record.payload,
      jti: id,
      ...(record.consumed_at && { consumed: Math.floor(record.consumed_at.getTime() / 1000) }),
    };
  }

  // Only sessions are looked up this way, and their payloads are stored whole.
  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const record = await selectOptionalOauthRecordByUid({ model: this.model, uid });
    return record?.payload;
  }

  async findByUserCode(): Promise<undefined> {
    throw new Error('The device flow is not supported');
  }

  async consume(id: string) {
    // A second use must fail here, where it is atomic, and not only where the library reads
    // `consumed` beforehand.
    if (!(await consumeOauthRecord(this.key(id)))) {
      throw new Error(`${this.model} was already used`);
    }
  }

  async destroy(id: string) {
    await deleteOauthRecord(this.key(id));
  }

  async revokeByGrantId(grantId: string) {
    await deleteOauthRecordsByGrantId(grantId);
  }
}
