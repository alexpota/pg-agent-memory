#!/usr/bin/env node

/**
 * Example runner for pg-agent-memory
 * 
 * Run with: npx tsx examples/run-examples.ts [example-name]
 * 
 * Available examples:
 * - basic: Basic usage patterns
 * - chatbot: Chatbot integration example
 * - all: Run all examples
 */

import { basicUsage } from './basic-usage.js';
import { runChatbotExample } from './chatbot-integration.js';

const examples = {
  basic: {
    name: 'Basic Usage',
    description: 'Core functionality and API usage',
    run: basicUsage
  },
  chatbot: {
    name: 'Chatbot Integration', 
    description: 'Memory-powered chatbot with user context',
    run: runChatbotExample
  }
};

async function runExample(exampleName: string): Promise<void> {
  const example = examples[exampleName as keyof typeof examples];
  
  if (!example) {
    console.error(`❌ Unknown example: ${exampleName}`);
    console.log('\nAvailable examples:');
    for (const [key, ex] of Object.entries(examples)) {
      console.log(`  ${key}: ${ex.description}`);
    }
    process.exit(1);
  }

  console.log(`🚀 Running example: ${example.name}`);
  console.log(`📝 ${example.description}\n`);

  try {
    await example.run();
  } catch (error) {
    console.error(`❌ Example failed:`, error);
    process.exit(1);
  }
}

async function runAllExamples(): Promise<void> {
  console.log('🚀 Running all examples...\n');
  
  for (const [key, example] of Object.entries(examples)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running: ${example.name}`);
    console.log(`${'='.repeat(50)}\n`);
    
    try {
      await example.run();
      console.log(`✅ ${example.name} completed successfully`);
    } catch (error) {
      console.error(`❌ ${example.name} failed:`, error);
    }
    
    // Small delay between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

function showUsage(): void {
  console.log('Usage: npx tsx examples/run-examples.ts [example-name]');
  console.log('\nEnvironment Variables:');
  console.log('  DATABASE_URL: PostgreSQL connection string (required)');
  console.log('                Example: postgresql://user:pass@localhost:5432/dbname');
  console.log('\nAvailable examples:');
  for (const [key, example] of Object.entries(examples)) {
    console.log(`  ${key.padEnd(10)} - ${example.description}`);
  }
  console.log('  all        - Run all examples');
  console.log('\nExamples:');
  console.log('  npx tsx examples/run-examples.ts basic');
  console.log('  npx tsx examples/run-examples.ts chatbot');
  console.log('  npx tsx examples/run-examples.ts all');
}

async function main(): Promise<void> {
  const exampleName = process.argv[2];

  if (!exampleName || exampleName === 'help' || exampleName === '--help') {
    showUsage();
    return;
  }

  // Check for database URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.log('\nSet it like this:');
    console.log('export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"');
    console.log('\nOr use a .env file in the project root:');
    console.log('DATABASE_URL=postgresql://user:pass@localhost:5432/dbname');
    process.exit(1);
  }

  if (exampleName === 'all') {
    await runAllExamples();
  } else {
    await runExample(exampleName);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}