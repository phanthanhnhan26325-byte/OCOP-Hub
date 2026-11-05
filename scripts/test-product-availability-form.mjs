import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/partner/ProductAvailabilityForm.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
function setup(status = 'IN_STOCK') {
  const updates = [];
  const mod = { exports: {} };
  const fakeReact = { ...React, useState: value => [value, next => updates.push(next)], useTransition: () => [false, () => { throw Error('Unexpected save'); }] };
  new Function('require', 'module', 'exports', compiled)(name => name === 'react' ? fakeReact : name === 'next/navigation' ? { useRouter: () => ({}) } : require(name), mod, mod.exports);
  const tree = mod.exports.ProductAvailabilityForm({ productId: 'product-1', availableQty: 10, reservedQty: 0, supplyStatus: status, preOrderEta: null });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return { tree, nodes, updates };
}
test('changing quantity and implicit form submission do not save', () => {
  const { tree, nodes, updates } = setup();
  nodes.find(node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '20' } });
  let prevented = false;
  tree.props.onSubmit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.deepEqual(updates, ['20', null]);
  assert.equal(nodes.find(node => node.type === 'button').props.type, 'button');
});
test('pre-order requires a date and blocks saving without one', () => {
  const { nodes, updates } = setup('PRE_ORDER');
  assert.equal(nodes.find(node => node.props.type === 'date').props.required, true);
  nodes.find(node => node.type === 'button').props.onClick({ currentTarget: { form: { reportValidity: () => true } } });
  assert.match(updates[0], /Vui lòng chọn ngày/);
});

test('selecting out of stock sets quantity to zero without saving', () => {
  const { nodes, updates } = setup();
  nodes.find(node => node.type === 'select').props.onChange({ target: { value: 'OUT_OF_STOCK' } });
  assert.deepEqual(updates, ['OUT_OF_STOCK', '0', null]);
});

test('out of stock displays zero and locks quantity even with old nonzero data', () => {
  const { nodes } = setup('OUT_OF_STOCK');
  const quantity = nodes.find(node => node.props.type === 'number');
  assert.equal(quantity.props.value, '0');
  assert.equal(quantity.props.disabled, true);
});
