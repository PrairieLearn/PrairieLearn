import { hostToolDefinitions } from '@prairielearn/course-agent-contract';

// Development tools cross the live PL socket. Publication tools arrive with the approval workflow.
export const toolDefinitions = (development: boolean) => (development ? hostToolDefinitions : []);
