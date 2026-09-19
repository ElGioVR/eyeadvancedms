const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_DIR = path.join(__dirname, '..', 'src', 'migrations');

const MIGRATION_ORDER = [
  '1800000000000-FormalizeConsultaDoctorCosto.ts',
  '1800000000001-EnhanceCatalogoEstudiosProcedimientos.ts',
  '1800000000002-CreateConsultaConceptosTable.ts',
  '1800000000003-CreateCobroDetallesTable.ts',
  '1800000000004-AddConsultaIdToAgendaCirugias.ts',
  '1800000000010-EnhanceDoctoresWithHonorariosFields.ts',
  '1800000000011-CreateConceptoDoctoresTable.ts',
  '1800000000012-CreateAgendaCirugiaDoctoresTable.ts',
  '1800000000020-CreateTarifasDoctorTable.ts',
  '1800000000021-CreatePeriodosPagoTable.ts',
  '1800000000022-CreateEventosHonorarioTable.ts',
  '1800000000023-CreateLiquidacionesDoctorTable.ts',
  '1800000000024-CreateAjustesLiquidacionTable.ts',
  '1800000000025-CreateBitacoraHonorariosTable.ts',
  '1800000000030-CreateConfiguracionSistemaTable.ts',
  '1800000000040-EnhanceAseguranzasForTarifario.ts',
  '1800000000050-MigrateLentesToInventarioItems.ts',
  '1800000000060-AddInventarioItemIdToAgendaCirugias.ts',
  '1800000000070-AddMetodoPagoToConsultas.ts',
  '1800000000080-AddPreferenciasToUsuarios.ts',
  '1800000000090-AddEstatusAndHistorialToConsultas.ts',
  '1800000000100-CreateNotificacionPreferencias.ts',
  '1800000000110-CreateAgendaImportLog.ts',
  '1800000000120-AddUsuarioIdToDoctores.ts',
  '1800000000130-SeedDoctorPilotoHonorarios.ts',
  '1800000000140-AddConstraintsAndIndices.ts',
  '1800000000150-CreateAseguranzaServicios.ts',
  '1800000000160-CreateCrearConsultaRPC.ts',
];

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const startIdx = parseInt(process.argv[2], 10) || 0;
const endIdx = parseInt(process.argv[3], 10) || MIGRATION_ORDER.length;

if (startIdx < 0 || startIdx >= MIGRATION_ORDER.length) {
  console.error('ERROR: startIdx must be between 0 and ' + (MIGRATION_ORDER.length - 1));
  process.exit(1);
}
if (endIdx <= startIdx || endIdx > MIGRATION_ORDER.length) {
  console.error('ERROR: endIdx must be between ' + (startIdx + 1) + ' and ' + MIGRATION_ORDER.length);
  process.exit(1);
}

function extractUpMethodSql(content) {
  var upStart = content.indexOf('public async up(');
  var downStart = content.indexOf('public async down(');
  if (upStart === -1) return [];
  if (downStart !== -1 && downStart > upStart) {
    content = content.substring(upStart, downStart);
  } else {
    content = content.substring(upStart);
  }
  var queries = [];
  var idx = 0;
  while (idx < content.length) {
    var callIdx = content.indexOf('queryRunner.query(', idx);
    if (callIdx === -1) break;

    var argsStart = callIdx + 18;
    var openChar = content.charAt(argsStart);

    if (openChar === '`' || openChar === "'" || openChar === '"') {
      var closeChar = openChar;
      var scanIdx = argsStart + 1;
      var found = false;

      while (scanIdx < content.length) {
        var ch = content.charAt(scanIdx);
        if (ch === '\\') {
          scanIdx += 2;
          continue;
        }
        if (ch === closeChar) {
          found = true;
          break;
        }
        scanIdx++;
      }

      if (found) {
        var sql = content.substring(argsStart + 1, scanIdx);
        queries.push(sql);
        idx = scanIdx + 2;
      } else {
        idx = argsStart + 1;
      }
    } else {
      idx = argsStart + 1;
    }
  }
  return queries;
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
    'id SERIAL PRIMARY KEY, ' +
    'filename VARCHAR(255) NOT NULL UNIQUE, ' +
    'applied_at TIMESTAMPTZ NOT NULL DEFAULT now()' +
    ')'
  );
}

async function getAppliedMigrations(client) {
  var result = await client.query('SELECT filename FROM schema_migrations ORDER BY id');
  return result.rows.map(function(r) { return r.filename; });
}

async function applyMigration(client, filename, queries) {
  await client.query('BEGIN');
  try {
    for (var i = 0; i < queries.length; i++) {
      var sql = queries[i].trim();
      if (sql) {
        console.log('  Executing query ' + (i + 1) + ' of ' + queries.length + '...');
        await client.query(sql);
      }
    }
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ('" + filename.replace(/'/g, "''") + "')"
    );
    await client.query('COMMIT');
    console.log('  Applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  FAILED: ' + err.message);
    throw err;
  }
}

async function main() {
  var client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to database.');

  await ensureSchemaMigrationsTable(client);
  var applied = await getAppliedMigrations(client);
  console.log('Already applied: ' + applied.length + ' migration(s).');

  var toRun = MIGRATION_ORDER.slice(startIdx, endIdx);
  var ran = 0;

  for (var i = 0; i < toRun.length; i++) {
    var filename = toRun[i];
    if (applied.indexOf(filename) !== -1) {
      console.log('[' + (startIdx + i) + '] SKIP (already applied): ' + filename);
      continue;
    }

    var filePath = path.join(MIGRATION_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.error('[' + (startIdx + i) + '] FILE NOT FOUND: ' + filename);
      continue;
    }

    console.log('[' + (startIdx + i) + '] Running: ' + filename);
    var content = fs.readFileSync(filePath, 'utf8');
    var queries = extractUpMethodSql(content);

    if (queries.length === 0) {
      console.log('  No queries extracted - skipping.');
      continue;
    }

    console.log('  Extracted ' + queries.length + ' query(ies).');
    await applyMigration(client, filename, queries);
    ran++;
  }

  console.log('\nDone. Applied ' + ran + ' migration(s).');
  await client.end();
}

main().catch(function(err) {
  console.error('FATAL: ' + err.message);
  process.exit(1);
});
