/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Client } from 'pg';
import { AgentMemory } from '../../../src/memory/AgentMemory.js';
import type { MemoryConfig } from '../../../src/types/index.js';

// Skip integration tests if no database URL provided
export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
export const shouldRunTests =
  DATABASE_URL &&
  DATABASE_URL !== 'postgresql://test:test@localhost:5432/test' &&
  !DATABASE_URL.includes('fake') &&
  !DATABASE_URL.includes('example');

export interface TestSetup {
  memory: AgentMemory;
  testClient: Client;
  cleanup: () => Promise<void>;
  cleanupAgent: (agentId: string) => Promise<void>;
}

export async function setupIntegrationTest(
  agentId: string,
  memoryConfig?: Partial<MemoryConfig>
): Promise<TestSetup> {
  if (!DATABASE_URL) {
    throw new Error('Database URL is required for integration tests');
  }

  // Setup test database client
  const testClient = new Client({ connectionString: DATABASE_URL });
  await testClient.connect();

  // Initialize memory system
  const config = {
    agent: agentId,
    connectionString: DATABASE_URL,
    ...memoryConfig,
  };
  const memory = new AgentMemory(config);

  await memory.initialize();

  // Clean up function for specific agent
  const cleanupAgent = async (targetAgentId: string): Promise<void> => {
    await testClient.query('DELETE FROM agent_memory_summaries WHERE agent_id = $1', [
      targetAgentId,
    ]);
    await testClient.query(
      'DELETE FROM agent_memory_shares WHERE granted_by = $1 OR shared_with_agent = $1',
      [targetAgentId]
    );
    await testClient.query('DELETE FROM agent_memories WHERE agent_id = $1', [targetAgentId]);
  };

  // Full cleanup function - clean up only this specific agent to avoid test interference
  const cleanup = async (): Promise<void> => {
    if (memory) {
      await memory.disconnect();
    }
    if (testClient) {
      // Clean up only this specific agent's data to avoid interfering with other running tests
      await cleanupAgent(agentId);
      await testClient.end();
    }
  };

  return {
    memory,
    testClient,
    cleanup,
    cleanupAgent,
  };
}

export function createIntegrationTestSuite(
  suiteName: string,
  agentId: string,
  memoryConfig?: Partial<MemoryConfig>
): {
  shouldSkip: boolean;
  suiteName: string;
  setup: () => Promise<TestSetup>;
} {
  return {
    shouldSkip: !shouldRunTests,
    suiteName,
    setup: (): Promise<TestSetup> => setupIntegrationTest(agentId, memoryConfig),
  };
}
