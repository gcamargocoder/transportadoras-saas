// Config ESLint base reexportada para os apps do monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export const baseConfig = [js.configs.recommended, ...tseslint.configs.recommended, prettierConfig];
