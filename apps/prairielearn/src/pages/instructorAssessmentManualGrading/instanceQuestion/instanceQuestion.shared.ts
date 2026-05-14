// Constants shared between the server-rendered grading panel and its hydrated
// React companion. Kept in its own module to avoid pulling server-only
// rendering deps into the client bundle (or vice versa).
export const AI_GRADING_MODAL_OPEN_EVENT = 'ai-grading-modal-open';
