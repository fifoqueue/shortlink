import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '.gitignore',
);

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  {
    name: 'project/ignores',
    ignores: ['.svelte-kit/**', 'build/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    name: 'project/language-options',
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    name: 'project/svelte',
    files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
        projectService: true,
        svelteConfig,
      },
    },
  },
  prettier,
  ...svelte.configs.prettier,
  {
    name: 'project/rules',
    rules: {
      'no-console': 'off',
      'no-empty': 'off',
    },
  },
]);
