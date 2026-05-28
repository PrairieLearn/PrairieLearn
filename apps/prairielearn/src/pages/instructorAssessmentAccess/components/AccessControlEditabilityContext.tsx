import { type ReactNode, createContext, use } from 'react';

const AccessControlEditabilityContext = createContext<boolean | null>(null);

export function AccessControlEditabilityProvider({
  ruleEditable,
  children,
}: {
  ruleEditable: boolean;
  children: ReactNode;
}) {
  return (
    <AccessControlEditabilityContext value={ruleEditable}>
      {children}
    </AccessControlEditabilityContext>
  );
}

export function useAccessControlRuleEditable(): boolean {
  const ruleEditable = use(AccessControlEditabilityContext);
  if (ruleEditable == null) {
    throw new Error(
      'useAccessControlRuleEditable must be used within AccessControlEditabilityProvider',
    );
  }
  return ruleEditable;
}
