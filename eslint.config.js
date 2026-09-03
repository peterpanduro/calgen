import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const PUPPETEER_BAN = {
	name: 'puppeteer-core',
	message: 'Only src/lib/server/pdf/puppeteer-browser.ts may import puppeteer-core (SPEC §2.5.4).'
};

/** Both the `$lib` alias and the relative form, or the ban is trivially side-stepped. */
const SERVER_BAN = {
	group: ['$lib/server', '$lib/server/*', '**/lib/server/*', '**/server/*'],
	message: 'Layers 1 and 2 must not import server code (SPEC §2.1).'
};

const PURE_LAYER_BAN = {
	group: [
		'$lib/client',
		'$lib/client/*',
		'**/lib/client/*',
		'**/client/*',
		'svelte',
		'svelte/*',
		'node:*'
	],
	message: 'src/lib/calendar is pure logic and imports nothing outside itself (SPEC §2.5.5).'
};

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// `const { scope: _scope, ...rest } = o` is how a key is dropped without mutating.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	// ── Layering rules (SPEC §2.1, §2.5.4) ────────────────────────────────────
	//
	// Flat config REPLACES a rule's options when the same rule name is re-declared for a file,
	// it does not merge them. Every block below therefore repeats the bans that still apply to
	// the files it matches, rather than relying on an earlier block.
	{
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/lib/server/pdf/puppeteer-browser.ts'],
		rules: { 'no-restricted-imports': ['error', { paths: [PUPPETEER_BAN] }] }
	},
	{
		// Layers 1 and 2 (and the browser-only client modules) must not reach into server code.
		files: [
			'src/lib/calendar/**/*.ts',
			'src/lib/components/**/*.{ts,svelte}',
			'src/lib/client/**/*.{ts,svelte}'
		],
		rules: {
			'no-restricted-imports': ['error', { paths: [PUPPETEER_BAN], patterns: [SERVER_BAN] }]
		}
	},
	{
		// Layer 1 is pure: no Svelte, no DOM, no Node APIs, no I/O (SPEC §2.1, §2.5.5).
		files: ['src/lib/calendar/**/*.ts'],
		ignores: ['src/lib/calendar/**/*.test.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ paths: [PUPPETEER_BAN], patterns: [SERVER_BAN, PURE_LAYER_BAN] }
			]
		}
	}
);
