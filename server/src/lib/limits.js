// Tunable numbers for every per-user content/action rate limit added in
// Prompt 69 Part F, in one place so a number can change without hunting
// through route files. Each is {windowMs, max} for express-rate-limit.
export const LIMITS = {
  posts:        { windowMs: 60 * 60 * 1000,      max: 10 }, // 10 per hour
  comments:     { windowMs: 10 * 60 * 1000,      max: 30 }, // 30 per 10 minutes
  hiveJoins:    { windowMs: 60 * 60 * 1000,      max: 20 }, // 20 per hour (join requests + instant joins)
  hiveCreation: { windowMs: 24 * 60 * 60 * 1000, max: 5  }, // 5 per day
  reports:      { windowMs: 60 * 60 * 1000,      max: 10 }, // 10 per hour
};
