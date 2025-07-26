#!/usr/bin/env node

/**
 * Simple benchmark script to verify README performance claims
 * Usage: npm run benchmark
 */

import { AgentMemory } from '../dist/index.js';
import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';

const DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL required for benchmarks');
  console.error('');
  console.error('🔧 Quick setup options:');
  console.error('');
  console.error('Option 1: Start Docker database');
  console.error('  npm run dev:up');
  console.error(
    '  export DATABASE_URL="postgresql://agent_user:agent_pass@localhost:5433/agent_memory"'
  );
  console.error('  npm run benchmark');
  console.error('');
  console.error('Option 2: Use existing PostgreSQL');
  console.error('  export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"');
  console.error('  npm run benchmark');
  console.error('');
  console.error('Option 3: Use .env file');
  console.error('  cp .env.example .env');
  console.error('  # Edit .env with your database URL');
  console.error('  npm run benchmark');
  process.exit(1);
}

async function benchmarkMemoryOperations() {
  console.log('🚀 Starting Memory Operations Benchmark...\n');

  const memory = await AgentMemory.create({
    agent: 'benchmark-agent',
    connectionString: DATABASE_URL,
  });

  const operations = [];
  const testData = [
    'User prefers email notifications over SMS',
    'Customer mentioned they work remotely from San Francisco',
    'Important: User has a premium subscription and needs priority support',
    'Discussion about project timeline and technical requirements for Q1',
    'User expressed interest in the enterprise plan and requested a demo',
  ];

  console.log('📝 Running memory.remember() operations...');

  // Benchmark remember operations
  for (let i = 0; i < testData.length; i++) {
    const start = performance.now();

    const memoryId = await memory.remember({
      conversation: 'benchmark-conversation',
      content: testData[i],
      role: 'user',
      importance: 0.5 + i * 0.1,
      timestamp: new Date(),
    });

    const duration = performance.now() - start;
    operations.push(duration);
    console.log(`  Operation ${i + 1}: ${duration.toFixed(2)}ms`);
  }

  // Calculate statistics
  const avg = operations.reduce((a, b) => a + b, 0) / operations.length;
  const max = Math.max(...operations);
  const min = Math.min(...operations);
  const p95 = operations.sort((a, b) => a - b)[Math.floor(operations.length * 0.95)];

  console.log(`\n📊 Memory Operations Results:`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);

  // Benchmark vector search
  console.log('\n🔍 Running vector search operations...');
  const searchOperations = [];

  for (let i = 0; i < 3; i++) {
    const start = performance.now();

    const results = await memory.searchMemories('user preferences and notifications');

    const duration = performance.now() - start;
    searchOperations.push(duration);
    console.log(`  Search ${i + 1}: ${duration.toFixed(2)}ms (${results.length} results)`);
  }

  const searchAvg = searchOperations.reduce((a, b) => a + b, 0) / searchOperations.length;
  console.log(`\n📊 Vector Search Results:`);
  console.log(`  Average: ${searchAvg.toFixed(2)}ms`);

  await memory.disconnect();

  // Summary
  console.log(`\n✅ Benchmark Complete!`);
  console.log(`\n📋 Verify against README claims:`);
  console.log(`  Memory ops avg: ${avg.toFixed(2)}ms (README: "Fast operations")`);
  console.log(`  Vector search avg: ${searchAvg.toFixed(2)}ms (README: "Efficient search")`);

  return {
    memoryOps: { avg, min, max, p95 },
    vectorSearch: { avg: searchAvg },
  };
}

async function benchmarkTokenCounting() {
  console.log('\n🔢 Starting Token Counting Benchmark...');

  const { UniversalTokenizer } = await import('../dist/index.js');

  const tokenizer = UniversalTokenizer.createDefault();
  const testTexts = [
    'Hello world',
    'This is a longer text that should take more time to process and tokenize properly',
    'A'.repeat(1000), // 1000 characters
    'Very short',
  ];

  const operations = [];

  for (const text of testTexts) {
    const start = performance.now();

    const tokens = tokenizer.estimateTokens(text, 'openai');

    const duration = performance.now() - start;
    operations.push(duration);
    console.log(`  Text (${text.length} chars): ${duration.toFixed(3)}ms → ${tokens} tokens`);
  }

  const avg = operations.reduce((a, b) => a + b, 0) / operations.length;
  console.log(`\n📊 Token Counting Results:`);
  console.log(`  Average: ${avg.toFixed(3)}ms`);
  console.log(`  All under 1ms: ${operations.every(op => op < 1) ? '✅' : '❌'}`);

  return { avg, allUnder1ms: operations.every(op => op < 1) };
}

async function checkModelSize() {
  console.log('\n📦 Checking Model Size...');

  // Check if model is cached
  const cacheDir = process.env.HOME + '/.cache/huggingface/transformers';

  try {
    const items = await fs.readdir(cacheDir, { recursive: true });
    const modelFiles = items.filter(item => item.includes('all-MiniLM-L6-v2'));

    if (modelFiles.length > 0) {
      console.log(`  Found cached model files: ${modelFiles.length}`);

      // Try to get approximate size
      let totalSize = 0;
      for (const file of modelFiles.slice(0, 5)) {
        // Check first 5 files
        try {
          const stats = await fs.stat(`${cacheDir}/${file}`);
          totalSize += stats.size;
        } catch (e) {
          // Ignore individual file errors
        }
      }

      if (totalSize > 0) {
        const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
        console.log(`  Estimated size: ~${sizeMB}MB`);
        console.log(`  README claims: ~80-90MB`);
      }
    } else {
      console.log(`  Model not cached yet, will download on first use`);
    }
  } catch (error) {
    console.log(`  Could not check cache: ${error.message}`);
  }
}

// Run benchmarks
async function main() {
  try {
    console.log('🧪 pg-agent-memory Performance Benchmark\n');

    await checkModelSize();

    const memoryResults = await benchmarkMemoryOperations();
    const tokenResults = await benchmarkTokenCounting();

    console.log('\n🎯 Final Summary:');
    console.log(`  Memory operations: ${memoryResults.memoryOps.avg.toFixed(2)}ms avg`);
    console.log(`  Vector search: ${memoryResults.vectorSearch.avg.toFixed(2)}ms avg`);
    console.log(
      `  Token counting: ${tokenResults.avg.toFixed(3)}ms avg (under 1ms: ${tokenResults.allUnder1ms ? '✅' : '❌'})`
    );
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  }
}

main();
