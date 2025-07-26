import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
  treeshake: true,
  minify: false,
  external: ['pg', 'pgvector'],
  publicDir: false,
  onSuccess: async () => {
    // Copy SQL files to dist
    const { copyFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    
    const sqlFiles = [
      { src: 'src/db/schema.sql', dest: 'dist/schema.sql' },
      { src: 'src/db/migrations/002_enhanced_compression_schema.sql', dest: 'dist/migrations/002_enhanced_compression_schema.sql' }
    ];
    
    sqlFiles.forEach(({ src, dest }) => {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    });
    
    console.log('✅ SQL files copied to dist/');
  },
});