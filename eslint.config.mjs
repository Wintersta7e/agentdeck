import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores(['out/**', 'dist/**', 'dist-release/**', 'coverage/**']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // The .mjs config files sit in no tsconfig; lint them with the default
          // project so `eslint .` covers them. (.mts is in tsconfig.tools.json.)
          allowDefaultProject: ['*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── TypeScript strict ──────────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // The strict preset also bans `${aNumber}`. Number-to-string is the one
      // coercion with no surprising result, and 195 of the 197 findings were
      // exactly that; everything genuinely lossy — objects stringifying to
      // "[object Object]", nullish, any, never, RegExp, arrays — stays banned.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `||` on a string is deliberate here: an empty distro name, branch,
      // project name or override means "absent" and must fall through to the
      // default. `??` would keep the empty string at 11 such sites. Numbers and
      // booleans stay flagged, where `|| 0` / `|| false` usually IS the bug.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      // Off: an annotation that looks redundant can be load-bearing. `const
      // exitCode: number = -1` widens the literal so a later `exitCode === -1`
      // compiles at all (TS2367 otherwise), which is exactly how a test models
      // a runtime value.
      '@typescript-eslint/no-inferrable-types': 'off',

      // ── JavaScript best practices ──────────────────────────────
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-assign': ['error', 'always'],
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
    },
  },
  {
    // Root .mjs config files: no tsconfig covers them, so the type-aware rules
    // would only see `any`. electron-vite bundles its config to CJS, which is
    // why __dirname is legitimately available there.
    files: ['*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { __dirname: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      // Promote hooks rules to error — stale closures are bugs, not warnings
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__test__/**', 'src/**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      // A test double is untyped by construction: vi.fn() returns any, a
      // partial mock is asserted into place, and a stub must declare async to
      // match the signature it replaces even with nothing to await. Keeping
      // these on would only teach us to write `as unknown as X` everywhere.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  prettier,
])
