/**
 * DOM CustomEvent name dispatched by the server-rendered "AI grade" button in
 * `gradingPanel.html.ts` and listened for by the hydrated React component in
 * `components/InstanceQuestionAiGrade.tsx`. Defined in a separate file so the
 * server-side template renderer and the client-side React module can share the
 * string without pulling each other's transitive imports.
 */
export const OPEN_AI_GRADE_MODAL_EVENT = 'open-ai-grade-modal';
