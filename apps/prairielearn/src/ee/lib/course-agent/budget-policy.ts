const COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS = 3_000;
const COURSE_AGENT_HOURLY_ALLOCATION_LIMIT_MILLI_DOLLARS = 50_000;

export function allocateCourseAgentBudget(allocatedThisHourMilliDollars: number): number {
  return Math.min(
    COURSE_AGENT_CREDIT_CHUNK_MILLI_DOLLARS,
    Math.max(0, COURSE_AGENT_HOURLY_ALLOCATION_LIMIT_MILLI_DOLLARS - allocatedThisHourMilliDollars),
  );
}
