import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/partner/ProductForm.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
const mockRequire = name => {
  if (name === 'next/navigation') return { useRouter: () => ({}) };
  if (name === '@/lib/supabase/browser') return { supabaseBrowser: () => { throw new Error('Unexpected browser DB call'); } };
  return require(name);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, mod, mod.exports);
const { ProductForm } = mod.exports;
const product = {
  id: 'product-1', name: 'Xoài sấy dẻo', slug: 'xoai-say-deo', price: 80000,
  category_id: 'category-1', short_description: 'Xoài đặc sản', description: 'Mô tả đã lưu', ocop_cert_no: 'OCOP-123',
  product_images: [{ url: 'https://example.com/old.jpg', sort_order: 0 }],
  product_variants: [{ id: 'variant-1', label: '250 g', price: 80000 }],
};
const props = { partnerId: 'partner-1', categories: [{ id: 'category-1', name: 'Đặc sản' }] };

test('edit form renders the saved fields, category, image and variants', () => {
  const html = renderToStaticMarkup(React.createElement(ProductForm, { ...props, product }));
  for (const value of ['Xoài sấy dẻo', 'xoai-say-deo', '80000', 'Xoài đặc sản', 'Mô tả đã lưu', 'OCOP-123', 'https://example.com/old.jpg', '250 g']) {
    assert.ok(html.includes(value), `Missing saved value: ${value}`);
  }
  assert.match(html, /value="category-1" selected=""/);
  assert.match(html, /Lưu thay đổi và gửi duyệt lại/);
});

test('receiving saved data replaces a blank session; unrelated renders preserve edits', () => {
  const blank = ProductForm(props);
  const edit = ProductForm({ ...props, product });
  assert.notEqual(blank.key, edit.key);
  assert.equal(edit.key, ProductForm({ ...props, product: structuredClone(product) }).key);
  assert.notEqual(edit.key, ProductForm({ ...props, product: { ...product, id: 'product-2' } }).key);
});

 test('unchanged edit does not start a submission', () => {
  const messages = [];
  const fakeReact = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, value => messages.push(value)], useTransition: () => [false, () => { throw new Error('Unchanged form submitted'); }] };
  const testModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name === 'react' ? fakeReact : name === 'next/navigation' ? { useRouter: () => ({}) } : name === '@/lib/supabase/browser' ? {} : require(name), testModule, testModule.exports);
  const element = testModule.exports.ProductForm({ ...props, product });
  const tree = element.type(element.props);
  tree.props.onSubmit({ preventDefault() {} });
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('Kh\u00f4ng c\u1ea7n g\u1eedi duy\u1ec7t l\u1ea1i.'));
 });
