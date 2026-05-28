/**
 * Exports full schema (DDL) + all table data via Supabase Management API.
 * Writes schema.sql and data.sql into the same directory.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<token> PROJECT_REF=<ref> node scripts/export-via-api.mjs
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_b4340efe30e7f58ae453086d56a71a7062cc58d9';
const REF   = process.env.PROJECT_REF            || 'hmfjpgytbwpllekwhkpi';
const BASE  = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function sql(query) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Schema export ─────────────────────────────────────────────

async function exportSchema() {
  const lines = [];
  lines.push('-- Schema export via Supabase Management API');
  lines.push(`-- Project: ${REF}`);
  lines.push(`-- Date: ${new Date().toISOString()}\n`);
  lines.push('SET statement_timeout = 0;');
  lines.push('SET lock_timeout = 0;');
  lines.push('SET client_encoding = \'UTF8\';');
  lines.push('SET standard_conforming_strings = on;\n');

  // Get all tables
  const tables = await sql(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const { table_name } of tables) {
    lines.push(`\n-- ── ${table_name} ─────────────────────────────────────────────`);
    lines.push(`DROP TABLE IF EXISTS public."${table_name}" CASCADE;`);

    // Columns
    const cols = await sql(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table_name}'
      ORDER BY ordinal_position
    `);

    const colDefs = cols.map(c => {
      let type = c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type;
      if (c.data_type === 'character varying') type = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'text';
      if (c.data_type === 'character') type = `char(${c.character_maximum_length})`;
      if (c.data_type === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale})`;

      let def = `  "${c.column_name}" ${type}`;
      if (c.column_default) def += ` DEFAULT ${c.column_default}`;
      if (c.is_nullable === 'NO') def += ' NOT NULL';
      return def;
    });

    // Primary key
    const pk = await sql(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public' AND tc.table_name = '${table_name}'
      ORDER BY kcu.ordinal_position
    `);

    if (pk.length) {
      const pkCols = pk.map(r => `"${r.column_name}"`).join(', ');
      colDefs.push(`  PRIMARY KEY (${pkCols})`);
    }

    lines.push(`CREATE TABLE public."${table_name}" (\n${colDefs.join(',\n')}\n);\n`);

    // Indexes (non-PK)
    const indexes = await sql(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = '${table_name}'
        AND indexname NOT IN (
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE constraint_type = 'PRIMARY KEY' AND table_schema = 'public' AND table_name = '${table_name}'
        )
      ORDER BY indexname
    `);

    for (const idx of indexes) {
      lines.push(`${idx.indexdef};`);
    }

    // Foreign keys
    const fks = await sql(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public' AND tc.table_name = '${table_name}'
    `);

    for (const fk of fks) {
      lines.push(
        `ALTER TABLE public."${table_name}" ADD CONSTRAINT "${fk.constraint_name}" ` +
        `FOREIGN KEY ("${fk.column_name}") REFERENCES public."${fk.foreign_table}"("${fk.foreign_column}") ` +
        `ON DELETE ${fk.delete_rule} ON UPDATE ${fk.update_rule};`
      );
    }

    // RLS
    const rls = await sql(`
      SELECT relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = '${table_name}'
    `);
    if (rls[0]?.relrowsecurity) {
      lines.push(`ALTER TABLE public."${table_name}" ENABLE ROW LEVEL SECURITY;`);
    }

    // RLS policies
    const policies = await sql(`
      SELECT policyname, cmd, qual, with_check, roles
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = '${table_name}'
    `);

    for (const p of policies) {
      const rawRoles = p.roles;
      const rolesArr = Array.isArray(rawRoles) ? rawRoles : (typeof rawRoles === 'string' ? rawRoles.replace(/[{}]/g, '').split(',') : ['public']);
      const roles = rolesArr.join(', ');
      let stmt = `CREATE POLICY "${p.policyname}" ON public."${table_name}" FOR ${p.cmd} TO ${roles}`;
      if (p.qual)       stmt += `\n  USING (${p.qual})`;
      if (p.with_check) stmt += `\n  WITH CHECK (${p.with_check})`;
      lines.push(stmt + ';');
    }
  }

  // Sequences (for serial/identity columns)
  const seqs = await sql(`
    SELECT sequence_name, start_value, increment, minimum_value, maximum_value, cycle_option
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `);
  if (seqs.length) {
    lines.push('\n-- Sequences');
    for (const s of seqs) {
      lines.push(`-- sequence: ${s.sequence_name} (start=${s.start_value} inc=${s.increment})`);
    }
  }

  return lines.join('\n');
}

// ── Data export ───────────────────────────────────────────────

function escapeVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function exportTableData(table) {
  const lines = [];
  const BATCH = 500;
  let offset = 0;

  // Get column order
  const cols = await sql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${table}'
    ORDER BY ordinal_position
  `);
  const colNames = cols.map(c => `"${c.column_name}"`).join(', ');

  while (true) {
    const rows = await sql(`SELECT * FROM public."${table}" ORDER BY 1 LIMIT ${BATCH} OFFSET ${offset}`);
    if (!rows.length) break;

    for (const row of rows) {
      const vals = Object.values(row).map(escapeVal).join(', ');
      lines.push(`INSERT INTO public."${table}" (${colNames}) VALUES (${vals});`);
    }

    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  return lines;
}

async function exportData(tables) {
  const lines = [];
  lines.push('-- Data export via Supabase Management API');
  lines.push(`-- Project: ${REF}`);
  lines.push(`-- Date: ${new Date().toISOString()}\n`);
  lines.push('SET session_replication_role = replica; -- disable FK checks during import\n');

  for (const { table_name } of tables) {
    process.stdout.write(`  Exporting ${table_name}...`);
    const rows = await exportTableData(table_name);
    if (rows.length) {
      lines.push(`\n-- ${table_name} (${rows.length} rows)`);
      lines.push(...rows);
    }
    console.log(` ${rows.length} rows`);
  }

  lines.push('\nSET session_replication_role = DEFAULT;');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const tables = await sql(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  console.log(`Found ${tables.length} tables: ${tables.map(t => t.table_name).join(', ')}\n`);

  console.log('Exporting schema...');
  const schema = await exportSchema();
  const schemaPath = join(__dir, 'schema.sql');
  writeFileSync(schemaPath, schema, 'utf8');
  console.log(`Schema written to ${schemaPath}\n`);

  console.log('Exporting data...');
  const data = await exportData(tables);
  const dataPath = join(__dir, 'data.sql');
  writeFileSync(dataPath, data, 'utf8');
  console.log(`\nData written to ${dataPath}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
