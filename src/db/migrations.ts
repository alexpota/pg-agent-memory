import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Client } from 'pg';
import { DatabaseConnectionError } from '../errors/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseMigrator {
  constructor(private readonly client: Client) {}

  async migrate(): Promise<void> {
    try {
      await this.runMigrations();
    } catch (error) {
      throw new DatabaseConnectionError(error as Error);
    }
  }

  private async runMigrations(): Promise<void> {
    // Create migrations tracking table
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrations = [
      {
        version: '001_initial_schema',
        description: 'Create initial agent memories schema',
        sql: this.loadSchemaFile(),
      },
    ];

    for (const migration of migrations) {
      const { rows } = await this.client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [migration.version]
      );

      if (rows.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`Applying migration: ${migration.description}`);

        await this.client.query('BEGIN');
        try {
          await this.client.query(migration.sql);
          await this.client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
            migration.version,
          ]);
          await this.client.query('COMMIT');

          // eslint-disable-next-line no-console
          console.log(`✅ Migration ${migration.version} applied successfully`);
        } catch (error) {
          await this.client.query('ROLLBACK');
          // Check if it's a duplicate extension error (can be ignored)
          const errorMessage = (error as Error).message;
          if (errorMessage.includes('duplicate key value') && errorMessage.includes('pg_type')) {
            // eslint-disable-next-line no-console
            console.log(`⚠️  pgvector extension already exists, continuing...`);
          } else {
            throw error;
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.log(`⏭️  Migration ${migration.version} already applied`);
      }
    }
  }

  private loadSchemaFile(): string {
    const schemaPath = join(__dirname, 'schema.sql');
    return readFileSync(schemaPath, 'utf-8');
  }

  async validateSchema(): Promise<boolean> {
    try {
      // Check if required tables exist
      const requiredTables = ['agent_memories', 'agent_memory_shares', 'agent_memory_summaries'];

      for (const table of requiredTables) {
        const { rows } = await this.client.query(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          );
        `,
          [table]
        );

        if (!(rows[0] as { exists: boolean }).exists) {
          // eslint-disable-next-line no-console
          console.error(`❌ Required table '${table}' not found`);
          return false;
        }
      }

      // Check if pgvector extension is enabled
      const { rows: extensionRows } = await this.client.query(`
        SELECT EXISTS (
          SELECT FROM pg_extension 
          WHERE extname = 'vector'
        );
      `);

      if (!(extensionRows[0] as { exists: boolean }).exists) {
        // eslint-disable-next-line no-console
        console.error('❌ pgvector extension not found');
        return false;
      }

      // Check if vector indexes exist
      const { rows: indexRows } = await this.client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'agent_memories' 
        AND indexname LIKE '%embedding%';
      `);

      if (indexRows.length === 0) {
        // eslint-disable-next-line no-console
        console.error('❌ Vector indexes not found');
        return false;
      }

      // eslint-disable-next-line no-console
      console.log('✅ Database schema validation passed');
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('❌ Schema validation failed:', error);
      return false;
    }
  }

  async getSchemaInfo(): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = {};

    // Get table row counts
    const tables = ['agent_memories', 'agent_memory_shares', 'agent_memory_summaries'];
    for (const table of tables) {
      const { rows } = await this.client.query(`SELECT COUNT(*) FROM ${table}`);
      info[`${table}_count`] = parseInt((rows[0] as { count: string }).count, 10);
    }

    // Get database size
    const { rows: sizeRows } = await this.client.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    info.database_size = (sizeRows[0] as { size: string }).size;

    // Get index information
    const { rows: indexRows } = await this.client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename IN ('agent_memories', 'agent_memory_shares', 'agent_memory_summaries')
      ORDER BY tablename, indexname;
    `);
    info.indexes = indexRows;

    return info;
  }
}
