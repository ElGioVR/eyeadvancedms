#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B20 — Inventario en el modo móvil del doctor: sección en el menú inferior
 * + acceso de solo lectura coherente con el RBAC de /api/inventario.
 * Node puro: aserciones estáticas + smoke HTTP opcional (sin sesión).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
let passes = 0;
const detail = [];

function ok(label) {
  passes += 1;
  console.log('  \u2713 ' + label);
}

function fail(label, extra) {
  failures += 1;
  const msg = extra ? label + ' -> ' + extra : label;
  detail.push(msg);
  console.log('  \u2717 ' + msg);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function assert(cond, label, extra) {
  if (cond) ok(label);
  else fail(label, extra);
}

console.log('\n[B20] Inventario en el menú móvil del doctor\n');

const nav = read('src/components/layout/DoctorBottomNav.tsx') || '';
const page = read('src/app/(dashboard)/inventario/page.tsx') || '';
const api = read('src/app/api/inventario/route.ts') || '';
const mov = read('src/app/api/inventario/movimientos/route.ts') || '';
const cats = read('src/app/api/configuracion/categorias-lentes/route.ts') || '';
const provs = read('src/app/api/configuracion/proveedores/route.ts') || '';
const sidebar = read('src/components/layout/Sidebar.tsx') || '';

// 1. Menú móvil del doctor
assert(nav.includes("href: '/inventario'"), "DoctorBottomNav incluye la sección '/inventario'");
assert(nav.includes('label: \'Inventario\''), 'la sección se etiqueta "Inventario"');
assert(
  nav.indexOf("href: '/inventario'") < nav.indexOf("href: '/mis-honorarios'"),
  'Inventario queda antes de Honorarios en la barra'
);
assert(
  !nav.includes("adminOnly"),
  'la barra móvil no marca la sección como solo admin'
);

// 2. Sidebar (menú lateral móvil) también la muestra
assert(
  sidebar.includes("label: 'Inventario'") && !/Inventario.*adminOnly/.test(sidebar),
  'el Sidebar muestra Inventario a todos los roles'
);

// 3. Lectura permitida al doctor (coherente con lo que ve en la página)
assert(
  api.includes("requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])"),
  'GET /api/inventario permite rol doctor'
);
assert(
  mov.includes("requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])"),
  'GET /api/inventario/movimientos (kardex) permite rol doctor'
);
assert(
  cats.includes("requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])"),
  'GET /api/configuracion/categorias-lentes permite rol doctor'
);
assert(
  provs.includes("requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])"),
  'GET /api/configuracion/proveedores permite rol doctor'
);

// 4. Escritura protegida en la UI para el doctor (evita 403 al guardar)
assert(page.includes("useUser"), 'la página usa useUser');
assert(page.includes('puedeEscribir'), 'la página calcula si puede escribir');
assert(
  page.includes("user?.rol === 'admin' || user?.rol === 'recepcionista'"),
  'el permiso de escritura coincide con el RBAC de PATCH/DELETE'
);
assert(page.includes('puedeCrear'), 'la página calcula si puede crear ítems');
assert(
  /\{puedeCrear && \(\s*<Link href="\/inventario\/nueva"/.test(page.replace(/\r/g, '')),
  'el botón "Nuevo Ítem" está disponible para el doctor'
);
assert(
  /\{puedeEscribir && \(\s*<button onClick=\{\(\) => setDeleteId/.test(page.replace(/\r/g, '')),
  'el botón "Eliminar" se oculta sin permiso de escritura'
);
assert(
  /\{puedeEscribir && \(\s*<button onClick=\{\(\) => \{ setShowAdjust/.test(page.replace(/\r/g, '')),
  'el botón "Ajustar Stock" se oculta sin permiso de escritura'
);
assert(
  /\{puedeEscribir && \(\s*<Link href=\{`\/inventario\/\$\{lente\.id\}\/editar`\}/.test(page.replace(/\r/g, '')),
  'el botón "Editar" se oculta sin permiso de escritura'
);
assert(page.includes('openKardex(lente)'), 'Kardex sigue visible (solo lectura)');
assert(page.includes('setShowScanner(true)'), 'escáner sigue visible (solo lectura)');

// 4b. RBAC por método: el doctor solo puede DAR DE ALTA (POST) en inventario
const postSection = api.slice(
  api.indexOf('export async function POST'),
  api.indexOf('export async function PATCH'),
);
const patchSection = api.slice(
  api.indexOf('export async function PATCH'),
  api.indexOf('export async function DELETE'),
);
const deleteSection = api.slice(api.indexOf('export async function DELETE'));
assert(
  postSection.includes("requireRole(auth.user, ['admin', 'doctor', 'recepcionista'])"),
  'POST /api/inventario permite rol doctor (alta de ítem)'
);
assert(
  patchSection.includes("requireRole(auth.user, ['admin', 'recepcionista'])") &&
    !patchSection.includes("'doctor'"),
  'PATCH /api/inventario NO permite rol doctor'
);
assert(
  deleteSection.includes("requireRole(auth.user, ['admin', 'recepcionista'])") &&
    !deleteSection.includes("'doctor'"),
  'DELETE /api/inventario NO permite rol doctor'
);

// 5. Smoke HTTP opcional
function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 20000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: '' });
    });
  });
}

(async () => {
  const base = process.env.APP_URL || 'http://localhost:3000';
  const res = await get(`${base}/api/inventario`);

  if (res.status === 0) {
    console.log('\n  (servidor no detectado en 3000: smoke HTTP omitido)\n');
  } else {
    console.log(`\n[smoke HTTP ${base}]`);
    assert(
      res.status === 401,
      'GET /api/inventario sin sesión responde 401 (existe y protege)',
      `status ${res.status}`
    );
    const pageRes = await get(`${base}/inventario`);
    assert(pageRes.status !== 404, 'la ruta /inventario resuelve', `status ${pageRes.status}`);
  }

  console.log('--------------------------------------------------------');
  console.log(` Resumen: ${passes} OK, ${failures} FAIL`);
  console.log('--------------------------------------------------------');
  if (failures > 0) {
    console.log('\nFallos detectados:');
    detail.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
    console.log('\nLa prueba B20 FALLÓ. Corrige los elementos marcados arriba.');
    process.exit(1);
  }
  console.log('La prueba B20 PASÓ.\n');
  process.exit(0);
})();
