/** Our deadline fired; unlike SDK text, this is an explicit timeout signal. */
export class OperationTimeout extends Error {
  override name = 'OperationTimeout';
}

/** RPC may preserve Error.name while dropping custom properties and subclass identity. */
export function safeFailure(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const name = error instanceof Error ? error.name : undefined;
  if (
    name === 'OperationTimeout' ||
    name === 'TimeoutError' ||
    code === 'PROCESS_READY_TIMEOUT' ||
    name === 'ProcessReadyTimeoutError'
  ) {
    return 'The operation timed out. Check Worker and container logs.';
  }
  if (code === 'CONTAINER_UNAVAILABLE' || name === 'ContainerUnavailableError') {
    return 'The container is unavailable. Check provisioning and capacity, then retry.';
  }
  if (code === 'INVALID_BACKUP_CONFIG' || name === 'InvalidBackupConfigError') {
    return 'Backup configuration is invalid. Check the bucket and backup settings.';
  }
  if (code === 'BACKUP_NOT_FOUND' || name === 'BackupNotFoundError') {
    return 'The checkpoint could not be found.';
  }
  if (code === 'BACKUP_EXPIRED' || name === 'BackupExpiredError') return 'The checkpoint expired.';
  return 'Check Worker and container logs for this stage.';
}

/** Persist only allowlisted diagnoses; SDK messages/context may contain signed URLs or process output. */
export function cleanupError(stage: 'stop' | 'backup' | 'destroy', error: unknown) {
  return `${stage} failed. ${safeFailure(error)}`;
}
