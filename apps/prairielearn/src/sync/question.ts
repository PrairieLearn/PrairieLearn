export function isDraftQid(qid: string): boolean {
  return qid.startsWith('__drafts__/');
}
