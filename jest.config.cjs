/**
 * Jest config for the content-review / design-token unit tests ONLY.
 * Kept entirely separate from the upstream `npm test` (node --test) script.
 *
 * Tests are transpiled to CommonJS by ts-jest so plain `jest.mock()` works
 * (the source is ESM with `.js` import specifiers; the moduleNameMapper strips
 * the `.js` so Jest resolves the `.ts` source). The inline `tsconfig` override
 * disables the repo's `emitDeclarationOnly`, which would otherwise suppress JS
 * emit during the test transform.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          emitDeclarationOnly: false,
          declaration: false,
          verbatimModuleSyntax: false,
          isolatedModules: false,
          skipLibCheck: true,
          target: 'ES2022',
        },
      },
    ],
  },
};
