module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.test.json'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    // Prettier integration
    'prettier/prettier': 'error',
    
    // TypeScript safety rules that catch strict mode issues
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',
    '@typescript-eslint/restrict-template-expressions': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    
    // Basic TypeScript
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // Performance and best practices
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-template': 'error',
    
    // Error prevention
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-alert': 'error',
    
    // Import/Export
    'no-duplicate-imports': 'error',
  },
  overrides: [
    // Test files
    {
      files: ['**/*.{test,spec}.ts', 'tests/**/*.ts'],
      env: {
        node: true,
      },
      rules: {
        // More relaxed rules for tests
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        'no-console': 'off',
      },
    },
    // Config files
    {
      files: ['*.config.{js,ts,cjs,mjs}', '.eslintrc.cjs'],
      env: {
        node: true,
      },
      parserOptions: {
        project: null,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-console': 'off',
      },
    },
    // Logger file - allow console usage
    {
      files: ['src/utils/logger.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    // Example files - allow console statements and relaxed type checking
    {
      files: ['examples/**/*.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      },
    },
  ],
};