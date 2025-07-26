/**
 * Time constants in milliseconds to avoid magic numbers throughout the codebase
 */
export const TIME_MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Helper functions for common time calculations
 */
export const timeUtils = {
  daysAgo: (days: number): Date => new Date(Date.now() - days * TIME_MS.DAY),
  weeksAgo: (weeks: number): Date => new Date(Date.now() - weeks * TIME_MS.WEEK),
  addDays: (date: Date, days: number): Date => new Date(date.getTime() + days * TIME_MS.DAY),
  addWeeks: (date: Date, weeks: number): Date => new Date(date.getTime() + weeks * TIME_MS.WEEK),
} as const;
