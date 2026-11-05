import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/partner/WorkshopForm.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => name === 'next/navigation' ? { useRouter: () => ({}) } : name === '@/lib/supabase/browser' ? { supabaseBrowser: () => ({}) } : require(name), mod, mod.exports);
const { WorkshopForm } = mod.exports;
const workshop = {
  id: 'workshop-1', title: 'Trải nghiệm làm gốm', slug: 'lam-gom', description: 'Mô tả cũ',
  experience_content: 'Tự tay tạo hình đất sét', cover_image: 'https://example.com/workshop.jpg',
  workshop_sessions: [{ id: 'session-1', starts_at: '2026-11-10T02:00:00Z', ends_at: '2026-11-10T04:00:00Z', location: 'Làng gốm', fee: 150000, capacity: 25 }],
};

test('edit form retains saved workshop fields and displays schedule in Vietnam time', () => {
  const html = renderToStaticMarkup(React.createElement(WorkshopForm, { workshop }));
  for (const value of ['Thông tin chung', 'Lịch tổ chức', 'Tự tay tạo hình đất sét', 'https://example.com/workshop.jpg', 'Trải nghiệm làm gốm', 'Mô tả cũ', '2026-11-10T09:00', '2026-11-10T11:00', 'Làng gốm', '150000', 'value="25"', 'Lưu thay đổi và gửi duyệt lại']) {
    assert.ok(html.includes(value), `Missing saved value: ${value}`);
  }
});

test('opening a saved workshop replaces the blank form session', () => {
  assert.notEqual(WorkshopForm({}).key, WorkshopForm({ workshop }).key);
  assert.equal(WorkshopForm({ workshop }).key, WorkshopForm({ workshop: structuredClone(workshop) }).key);
});

test('new form starts with one session and offers an image upload', () => {
  const html = renderToStaticMarkup(React.createElement(WorkshopForm, {}));
  assert.ok(html.includes('Buổi 1'));
  assert.ok(!html.includes('Buổi 2'));
  assert.ok(html.includes('type="file"'));
  assert.ok(html.includes('sm:col-span-2'));
});

test('removing sessions blocks registered sessions and removes unregistered sessions', () => {
  const updates = [];
  const alerts = [];
  const fakeReact = { ...React, useState: initial => [initial, value => updates.push(value)], useTransition: () => [false, () => {}] };
  const testModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name === 'react' ? fakeReact : name === 'next/navigation' ? { useRouter: () => ({}) } : name === '@/lib/supabase/browser' ? {} : require(name), testModule, testModule.exports);
  const fixture = structuredClone(workshop);
  fixture.workshop_sessions[0].workshop_registrations = [{ id: 'registration-1' }];
  fixture.workshop_sessions.push({ ...fixture.workshop_sessions[0], id: 'session-2', workshop_registrations: [] });
  const element = testModule.exports.WorkshopForm({ workshop: fixture });
  const tree = element.type(element.props);
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!React.isValidElement(node)) return;
    if (node.type === 'button' && node.props['aria-label']?.startsWith('Xóa buổi')) buttons.push(node);
    visit(node.props.children);
  }
  visit(tree);
  const previousAlert = globalThis.alert;
  globalThis.alert = message => alerts.push(message);
  try {
    buttons[0].props.onClick();
    assert.match(alerts[0], /đã có khách hàng đăng ký/);
    assert.equal(updates.length, 0);
    buttons[1].props.onClick();
    const remaining = updates[0](fixture.workshop_sessions);
    assert.deepEqual(remaining.map(session => session.id), ['session-1']);
  } finally {
    globalThis.alert = previousAlert;
  }
});

 test('unchanged edit does not start a submission', () => {
  const messages = [];
  const fakeReact = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, value => messages.push(value)], useTransition: () => [false, () => { throw new Error('Unchanged form submitted'); }] };
  const testModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name === 'react' ? fakeReact : name === 'next/navigation' ? { useRouter: () => ({}) } : name === '@/lib/supabase/browser' ? {} : require(name), testModule, testModule.exports);
  const element = testModule.exports.WorkshopForm({ workshop });
  const tree = element.type(element.props);
  tree.props.onSubmit({ preventDefault() {} });
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('Kh\u00f4ng c\u1ea7n g\u1eedi duy\u1ec7t l\u1ea1i.'));
 });
