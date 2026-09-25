#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * B19 — /mis-honorarios (doctor, móvil): página restaurada + endpoint de autoconsulta.
 * Node puro: aserciones estáticas sobre los archivos + smoke HTTP opcional si el
 * servidor está corriendo (sin sesión -> 401 en la API, sin 404 en la ruta).
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
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function assert(cond, label, extra) {
  if (cond) ok(label);
  else fail(label, extra);
}

console.log('\n[B19] /mis-honorarios: página del doctor + endpoint de autoconsulta\n');

const PAGE = 'src/app/(dashboard)/mis-honorarios/page.tsx';
const API = 'src/app/api/productividad/mis-honorarios/route.ts';

// 1. Archivos
assert(exists(PAGE), 'la página src/app/(dashboard)/mis-honorarios/page.tsx existe');
assert(exists(API), 'el endpoint src/app/api/productividad/mis-honorarios/route.ts existe');

const page = read(PAGE) || '';
const api = read(API) || '';

if (page) {
  assert(page.includes("'use client'"), "la página es un componente de cliente ('use client')");
  assert(
    page.includes('/api/productividad/mis-honorarios'),
    'la página consume /api/productividad/mis-honorarios'
  );
  assert(/\bresumen\??\.pagado\b/.test(page), 'muestra el total pagado');
  assert(/\bresumen\??\.por_pagar\b/.test(page), 'muestra el total por pagar');
  assert(page.includes('data.items.map'), 'lista los movimientos del periodo');
  assert(page.includes('from \'@/components/ui/Pagination\'') || page.includes('Pagination'), 'usa el componente Pagination');
  assert(page.includes('from \'@/components/ui/Skeleton\''), 'usa Skeleton durante la carga');

  // Reglas de hidratación SSR/CSR (AGENTS.md)
  for (const banned of ['new Date(', 'Math.random(', 'localStorage', 'sessionStorage', 'matchMedia']) {
    assert(!page.includes(banned), `sin "${banned}" en la página (hidratación SSR)`);
  }
  assert(page.includes('no está vinculado') || page.includes('error'), 'muestra estado de error');

  const nav = read('src/components/layout/DoctorBottomNav.tsx') || '';
  assert(
    nav.includes("href: '/mis-honorarios'"),
    'la barra inferior del doctor enlaza a /mis-honorarios'
  );
  const dash = read('src/app/(dashboard)/dashboard/DashboardContent.tsx') || '';
  assert(dash.includes('href="/mis-honorarios"'), 'el dashboard enlaza a /mis-honorarios');
}

if (api) {
  assert(api.includes('requireAuth()'), 'el endpoint exige sesión (requireAuth)');
  assert(api.includes('panelDoctorHonorarios'), 'usa panelDoctorHonorarios (misma data que el panel admin)');
  assert(api.includes('resolverDoctorPropio'), 'resuelve el doctor_id propio del usuario en servidor');
  assert(
    api.includes('Tu usuario no está vinculado a un doctor'),
    'responde 403 si el usuario no está vinculado a un doctor'
  );
  assert(api.includes('usuario_id'), 'busca primero por doctores.usuario_id');
  assert(api.includes('ilike'), 'fallback por email del perfil');
  assert(api.includes('desde') && api.includes('hasta'), 'acepta rango de fechas desde/hasta');
  assert(!api.includes('getServerSideUserBypass'), 'sin bypass de autenticación');
}

// 2. Smoke HTTP (opcional: solo si el dev server está en 3000)
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
  const apiRes = await get(`${base}/api/productividad/mis-honorarios`);

  if (apiRes.status === 0) {
    console.log('\n  (servidor no detectado en 3000: smoke HTTP omitido)\n');
  } else {
    console.log(`\n[smoke HTTP ${base}]`);
    assert(
      apiRes.status === 401,
      'API sin sesión responde 401 (existe y protege)',
      `status ${apiRes.status}: ${apiRes.body.slice(0, 120)}`
    );
    const pageRes = await get(`${base}/mis-honorarios`);
    assert(
      pageRes.status !== 404,
      'la ruta /mis-honorarios ya no devuelve 404',
      `status ${pageRes.status}`
    );
  }

  console.log('--------------------------------------------------------');
  console.log(` Resumen: ${passes} OK, ${failures} FAIL`);
  console.log('--------------------------------------------------------');
  if (failures > 0) {
    console.log('\nFallos detectados:');
    detail.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
    console.log('\nLa prueba B19 FALLÓ. Corrige los elementos marcados arriba.');
    process.exit(1);
  }
  console.log('La prueba B19 PASÓ.\n');
  process.exit(0);
})();
