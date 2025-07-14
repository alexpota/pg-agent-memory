/**
 * Global test setup for pg-agent-memory
 */

import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  // Cleanup test environment
});