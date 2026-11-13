import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/modules/reviews/schema.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const testModule = { exports: {} };

vm.runInNewContext(compiled, {
  module: testModule,
  exports: testModule.exports,
  require: (name) => {
    if (name !== 'typescript') throw new Error(`Unexpected import: ${name}`);
    return require(name);
  },
});

const { isMissingReviewSchema } = testModule.exports;

test('recognizes a missing review view in the Supabase schema cache', () => {
  assert.equal(isMissingReviewSchema({
    code: 'PGRST205',
    message: "Could not find the table 'public.product_reviews_public' in the schema cache",
  }), true);
});

test('recognizes a missing review database relation', () => {
  assert.equal(isMissingReviewSchema({
    code: '42P01',
    message: 'relation "public.workshop_review_stats" does not exist',
  }), true);
});

test('does not mask unrelated review query errors', () => {
  assert.equal(isMissingReviewSchema({
    code: '42501',
    message: 'permission denied for table product_reviews_public',
  }), false);
  assert.equal(isMissingReviewSchema({
    code: '08006',
    message: 'connection failed',
  }), false);
});
