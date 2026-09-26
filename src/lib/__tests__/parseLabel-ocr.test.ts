import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinarLecturas, parseGs1, parseLensLabel } from '../parseLabel';
import { binarizar, recortar, ubicarEtiqueta } from '../ocrImagen';

/**
 * Textos REALES que Tesseract devolvió en las 5 pasadas sobre una foto de
 * celular de una etiqueta Alcon Clareon PanOptix Toric (CNATT2 +23.5D).
 * Ninguna lectura aislada trae todos los datos; la votación sí.
 */
const LECTURAS_FOTO_REAL = [
  "— Clareon™ PanOptix™ Toric IoL\n\nNATTZ [ZX SD; Ae:\n\nLlGHT\n\na\n\nIU CL CAE JI ui ” mi\n\nEN =N] 26169559 028 ws\n\nn\n\n$\n\n4\n",
  "AVY 1\n\nsnd *-\n\nClareo\n\nn™ PanGptix™ Torlc 10 Ls,\n\nYer\n\n+23.5D:\n\nD:: 25ADD\n\nPS\n\nD nozzle ——\n\nBLUE\n\n4)\n\nQRH\n\nAlcon\n\n5H] 26169558 028\" 2 203\n\nwai\n",
  "Clareon™ Pan0 oo ic 10L |\nNTT) PORN IERE\nCNATT2 La +£9.9 Ui:\n[D nozzle | c=—==— 10)\nCAC 0 00 OO es |\nBR] 26169559 028 w 2030-01-06 Alcon\nSN 261 an\na Pr J |\n",
  "*\n\n+B\n\n—\n\n[+ Sr esat\n\nClareon™ PanOptix™ Toric I0L\n\nCYL 1.00\n\n217 ADD\n\n3.25 ADD\n\n| [EaA-23.50.\n\nJ\n\nClair\n\nFILTER\n\n(pg il i li Hl ii TI Il Ii i Il\n\nEN] 26169559028 i 20\n\n06\n\noS\n\nroc\n\n/\n\nQL\n",
  "+»\n\n+57\n\nClareon™ PanOptix Bh\n\n« \"\n\nJ CRATT2\n\n3505\n\n- Ws\n\n3\n\nTITTLE Mm\n\n[SN] 26169559 028 wm 203\n\n0-01-\n\ni 5\n\nle\n\n- se. “—,\n\nDo\n\nNl\n\na\n\n4» 4¢\n\nhat\n",
];

describe('OCR de etiqueta: combinación de lecturas (foto real)', () => {
  const r = combinarLecturas(LECTURAS_FOTO_REAL);
  it('marca, producto y modelo', () => {
    assert.equal(r.manufacturer, 'Alcon');
    assert.equal(r.product_name, 'Clareon PanOptix Toric IOL');
    assert.equal(r.model, 'CNATT2');
  });
  it('potencia, cilindro y ADD', () => {
    assert.equal(r.sphere, '+23.5');
    assert.equal(r.cylinder, '1.00');
    assert.equal(r.add_intermediate, '2.17');
    assert.equal(r.add_near, '3.25');
  });
  it('nozzle, serie y caducidad', () => {
    assert.equal(r.nozzle, 'D');
    assert.equal(r.serial_number, '26169559028');
    assert.equal(r.expiration_date, '2030-01-06');
  });
  it('no inventa código de barras a partir de la serie', () => {
    assert.equal(r.barcode, '');
  });
});

describe('parseLensLabel: correcciones de OCR', () => {
  it('I0L / Torlc / PanGptix se corrigen', () => {
    const r = parseLensLabel('Clareon PanGptix Torlc I0L');
    assert.equal(r.product_name, 'Clareon PanOptix Toric IOL');
    assert.equal(r.manufacturer, 'Alcon');
  });
  it('ADD sin punto decimal (217 ADD) y orden intermedia < cercana', () => {
    const r = parseLensLabel('3.25 ADD 217 ADD');
    assert.equal(r.add_intermediate, '2.17');
    assert.equal(r.add_near, '3.25');
  });
  it('la esfera ignora los valores de ADD y CYL', () => {
    const r = parseLensLabel('CYL 1.00 3.25 ADD');
    assert.equal(r.sphere, '');
  });
  it('"D" leída como 1 en la potencia (+23.51) se corrige a +23.5', () => {
    assert.equal(parseLensLabel('+23.51').sphere, '+23.5');
  });
  it('variantes del recuadro [SN] (EN], 5H]) y serie sin etiqueta 8+3', () => {
    assert.equal(parseLensLabel('EN] 26169559 028').serial_number, '26169559028');
    assert.equal(parseLensLabel('texto 26169559 028 más').serial_number, '26169559028');
  });
  it('modelo con último dígito leído como "?" (CNATT?)', () => {
    assert.equal(parseLensLabel('Clareon PanOptix Toric IOL CNATT? +23.5D').model, 'CNATT2');
  });
  it('cilindro por sufijo tórico de Alcon cuando el OCR no lo leyó', () => {
    assert.equal(parseLensLabel('Alcon Clareon PanOptix Toric IOL CNATT4').cylinder, '2.25');
  });
  it('código de barras de texto solo si es un GTIN con dígito verificador válido', () => {
    assert.equal(parseLensLabel('Alcon 7501234567894').barcode, '');
    assert.equal(parseLensLabel('Alcon 4006381333931').barcode, '4006381333931');
  });
});

describe('parseGs1', () => {
  it('con paréntesis', () => {
    assert.deepEqual(parseGs1('(01)00380652345678(17)300106(21)26169559028'), {
      gtin: '00380652345678', caducidad: '2030-01-06', serie: '26169559028',
    });
  });
  it('sin paréntesis y con lote (separador GS)', () => {
    assert.deepEqual(parseGs1('010038065234567817300106' + '10L123\u001d' + '2126169559028'), {
      gtin: '00380652345678', caducidad: '2030-01-06', lote: 'L123', serie: '26169559028',
    });
  });
  it('texto que no es GS1', () => {
    assert.deepEqual(parseGs1('ABC123'), {});
  });
  it('la serie y la caducidad del código completan el formulario', () => {
    const r = parseLensLabel('Alcon Clareon', { barcode: '(01)00380652345678(17)300106(21)26169559028', barcodeFormat: 'CODE_128' });
    assert.equal(r.serial_number, '26169559028');
    assert.equal(r.expiration_date, '2030-01-06');
  });
});

describe('ocrImagen', () => {
  // Imagen sintética: fondo claro con un trazo oscuro y un recuadro oscuro con trazo claro
  const w = 60, h = 20;
  const data = new Uint8ClampedArray(w * h).fill(220);
  for (let y = 8; y < 12; y++) for (let x = 5; x < 15; x++) data[y * w + x] = 30;   // tinta oscura
  for (let y = 2; y < 18; y++) for (let x = 35; x < 55; x++) data[y * w + x] = 40;  // recuadro oscuro
  for (let y = 8; y < 12; y++) for (let x = 40; x < 50; x++) data[y * w + x] = 240; // tinta clara
  const img = { data, width: w, height: h };
  it('tinta oscura marca el trazo oscuro como negro', () => {
    const b = binarizar(img, 'oscura', { radio: 6 });
    assert.equal(b.data[10 * w + 10], 0);
    assert.equal(b.data[1 * w + 1], 255);
  });
  it('tinta clara marca el texto blanco del recuadro como negro', () => {
    const b = binarizar(img, 'clara', { radio: 6 });
    assert.equal(b.data[10 * w + 45], 0);
  });
  it('recortar escala la región', () => {
    const r = recortar(img, { x0: 0, y0: 0, x1: 30, y1: 10 }, 60);
    assert.equal(r.width, 60);
    assert.equal(r.height, 20);
  });
  it('ubicarEtiqueta envuelve las palabras confiables y descarta atípicos', () => {
    const pal = (x: number, y: number, c = 90) => ({ texto: 'ABCD', confianza: c, caja: { x0: x, y0: y, x1: x + 40, y1: y + 10 } });
    const caja = ubicarEtiqueta([pal(100, 100), pal(150, 120), pal(120, 140), pal(900, 900, 20)], 1000, 1000);
    assert.ok(caja);
    assert.ok(caja!.x1 < 400 && caja!.y1 < 400);
  });
});
