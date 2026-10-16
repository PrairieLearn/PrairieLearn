const fallback = new Map<string, string>();
export function readPanelState(key: string) {
  return fallback.get(key) ?? '';
}
export function savePanelState(key: string, value: string) {
  fallback.set(key, value);
  window.dispatchEvent(new Event('course-agent-panel-change'));
}
