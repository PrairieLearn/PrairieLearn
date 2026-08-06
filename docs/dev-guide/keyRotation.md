# Rotating application-managed keys

PrairieLearn accepts either a scalar string or an ordered, nonempty array for `secretKey`, `databaseEncryptionKey`, `prairieTestSharedAuthSecret`, and `stripeWebhookSigningSecret`. Empty arrays and invalid array members are rejected during configuration validation.

For credentials PrairieLearn uses to create signatures or ciphertext, the first key is active and every configured key is accepted for verification or decryption. `stripeWebhookSigningSecret` is verification-only, but its order remains deterministic. Continue to use scalar configuration until array-compatible application code has been deployed everywhere that reads a shared credential.

## Standard rollout

Given an old key and a new key:

1. Deploy array-compatible code while retaining the scalar old key.
2. Configure `[old, new]` and refresh every application instance.
3. Configure `[new, old]` and refresh every application instance. New signatures and ciphertext now use the new key.
4. Satisfy the credential-specific old-key retirement conditions below.
5. Configure `[new]` and refresh every application instance. For `databaseEncryptionKey`, first complete the re-encryption and verification procedure below.

Do not skip the `[old, new]` stage. It ensures every instance can verify with the new key before any instance begins signing with it. During the subsequent rolling change to `[new, old]`, updated instances can sign with the new key while instances still using `[old, new]` can verify signatures from either key.

## `secretKey`

`secretKey` signs session cookies and the signed tokens used for CSRF protection, assessment-password cookies, load testing, workspaces, jobs, variants, actions, and trace sampling. Session cookies have a maximum lifetime of `sessionStoreExpireSeconds` (30 days by default); assessment-password, load-test, and variant checks are bounded at 24 hours or less in their verification paths, and workspace authorization cookies default to one minute.

Job-sequence tokens accepted through the Socket.IO join path, along with some page-scoped CSRF and other socket tokens, do not have a hard time limit. Keep the fallback key for at least the configured session lifetime and any longer operationally configured artifact lifetime. Retiring the fallback after that window can still invalidate an exceptionally old open form or socket page; a page refresh obtains a token signed by the new active key.

The trace-sampling cookie generator accepts a scalar or array-valued `secretKey` and explicitly signs with array index 0.

## `databaseEncryptionKey`

The known persisted use of `databaseEncryptionKey` is `course_instance_ai_grading_credentials.encrypted_secret_key`. PrairieLearn continues to use its existing authenticated AES-256-GCM ciphertext format. It encrypts new values with the first configured key and attempts decryption with each key in order.

After every PrairieLearn instance is using `[new, old]`, run the normal server entrypoint with `--database-encryption check` to count values requiring rotation. Run it with `--database-encryption rotate` to acquire a database-backed named lock, process bounded batches, and replace each value only if it has not changed concurrently. Rotation makes up to three passes to resolve concurrent-update conflicts and then rereads and authenticates every value with the primary key; it fails unless every row observed by the final scan is current. The operation is idempotent and may be rerun after a failure.

The named lock serializes rotation commands; it does not block ordinary application writes or inspect the configuration of other instances. Do not rotate until every writer uses the new primary key. Keep the fallback key configured through an operational grace period, repeat the check before retirement, and investigate any value written by a stale instance.

After rotation succeeds, run `--database-encryption check` again with only `[new]` configured in a one-off process. A zero `needsRotation` result proves the live rows are readable without the old key. The normal instances may then be refreshed with `[new]` only.

Database backups retain the ciphertext present when they were captured. Retain old keys under the same controls as retained backups; restoring a pre-rotation backup must restore the corresponding fallback keys and run the rotation and verification operation before those keys are removed from the restored environment.

## `prairieTestSharedAuthSecret`

PrairieLearn and PrairieTest both mint and verify JWTs with this credential. Do not switch either service to array configuration until array-compatible versions of both services are deployed. Apply each rollout configuration to both services and refresh all instances before moving to the next stage.

The longest current shared-auth token lifetime is five minutes for PrairieLearn's end-exam JWT; interactive authentication JWTs expire after one minute. After every instance of both services is using `[new, old]`, wait at least five minutes plus deployment and clock-skew margin before removing `old`; ten minutes after the last old-primary instance is stopped is a conservative minimum.

## `stripeWebhookSigningSecret`

PrairieLearn verifies each inbound Stripe webhook against every configured signing secret and does not use this credential to mint outbound signatures. Keep both secrets configured for the entire provider-side overlap, then remove the old secret only after Stripe no longer signs deliveries with it. This does not change the outbound `stripeSecretKey`.
