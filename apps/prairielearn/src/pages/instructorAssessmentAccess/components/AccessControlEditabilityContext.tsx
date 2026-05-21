import { type ReactNode, createContext, use } from 'react';

const AccessControlEditabilityContext = createContext<boolean | null>(null);

export function AccessControlEditabilityProvider({
  canEdit,
  children,
}: {
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <AccessControlEditabilityContext value={canEdit}>{children}</AccessControlEditabilityContext>
  );
}

export function useAccessControlCanEdit(): boolean {
  const canEdit = use(AccessControlEditabilityContext);
  if (canEdit == null) {
    throw new Error('useAccessControlCanEdit must be used within AccessControlEditabilityProvider');
  }
  return canEdit;
}
