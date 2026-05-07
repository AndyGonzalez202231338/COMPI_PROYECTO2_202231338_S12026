const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// ── Conexiones por proyecto ──────────────────────────────────────────────────
const connections = new Map();

function sanitize(name) {
  return (name || 'mi-proyecto').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
}

function getDb(rawProject) {
  const project = sanitize(rawProject);
  if (!connections.has(project)) {
    const dbPath = path.join(dataDir, `${project}.db`);
    const db = new sqlite3.Database(dbPath, err => {
      if (err) console.error(`Error abriendo ${project}.db:`, err.message);
      else     console.log(`Conectado a SQLite: ${dbPath}`);
    });
    db.run(`CREATE TABLE IF NOT EXISTS _yfera_tables (table_name TEXT PRIMARY KEY)`);
    connections.set(project, { db, path: dbPath });
  }
  return connections.get(project).db;
}

// ── Tipo de columna ──────────────────────────────────────────────────────────
function mapType(type) {
  switch (type) {
    case 'int':     return 'INTEGER';
    case 'float':   return 'REAL';
    case 'string':  return 'TEXT';
    case 'boolean': return 'INTEGER';
    case 'char':    return 'TEXT';
    default:        return 'TEXT';
  }
}

// ── Ejecutar AST ─────────────────────────────────────────────────────────────
function executeAST(db, ast) {
  if (!ast || !ast.type) throw new Error('AST inválido');
  switch (ast.type) {
    case 'CREATE': return executeCreate(db, ast);
    case 'SELECT': return executeSelect(db, ast);
    case 'INSERT': return executeInsert(db, ast);
    case 'UPDATE': return executeUpdate(db, ast);
    case 'DELETE': return executeDelete(db, ast);
    case 'DROP':   return executeDrop(db, ast);
    default:       throw new Error(`Tipo desconocido: ${ast.type}`);
  }
}

// CREATE TABLE nombre COLUMNS col=tipo, ...;
function executeCreate(db, ast) {
  const tableName = ast.table;
  const columns   = ast.columns || [];

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err)  return reject(err);
        if (row)  return resolve({ message: `Tabla '${tableName}' ya existe`, already: tableName });

        const colDefs = [`id INTEGER PRIMARY KEY AUTOINCREMENT`];
        for (const col of columns) {
          colDefs.push(`${col.name} ${mapType(col.dataType)}`);
        }
        const sql = `CREATE TABLE "${tableName}" (${colDefs.join(', ')})`;
        db.run(sql, err2 => {
          if (err2) return reject(err2);
          db.run(`INSERT INTO _yfera_tables (table_name) VALUES (?)`, [tableName]);
          resolve({ message: `Tabla '${tableName}' creada correctamente`, created: tableName });
        });
      }
    );
  });
}

// SELECT: tabla.columna;
function executeSelect(db, ast) {
  const tableName  = ast.table;
  const columnName = ast.column;

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err)  return reject(err);
        if (!row) return reject(new Error(`La tabla '${tableName}' no existe`));

        const col = columnName === '*' ? '*' : `"${columnName}"`;
        db.all(`SELECT ${col} FROM "${tableName}"`, (err2, rows) => {
          if (err2) return reject(err2);
          const resultRows = columnName === '*'
            ? rows
            : rows.map(r => ({ [columnName]: r[columnName] }));
          resolve({ rows: resultRows, message: `${resultRows.length} fila(s)` });
        });
      }
    );
  });
}

// INSERT: tabla[col1="val", col2=123];
function executeInsert(db, ast) {
  const tableName   = ast.table;
  const assignments = ast.values || [];

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err)  return reject(err);
        if (!row) return reject(new Error(`La tabla '${tableName}' no existe`));

        const cols        = assignments.map(a => `"${a.col}"`);
        const placeholders = assignments.map(() => '?');
        const values      = assignments.map(a => a.value);
        const sql = `INSERT INTO "${tableName}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;

        db.run(sql, values, function(err2) {
          if (err2) return reject(err2);
          resolve({ message: `Fila insertada en '${tableName}' (id=${this.lastID})` });
        });
      }
    );
  });
}

// UPDATE: tabla[col1="val"] IN id;
function executeUpdate(db, ast) {
  const tableName   = ast.table;
  const assignments = ast.values || [];
  const id          = ast.id;

  if (id === undefined) return Promise.reject(new Error('UPDATE requiere id'));

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err)  return reject(err);
        if (!row) return reject(new Error(`La tabla '${tableName}' no existe`));

        const setClause = assignments.map(a => `"${a.col}" = ?`).join(', ');
        const values    = [...assignments.map(a => a.value), id];
        const sql = `UPDATE "${tableName}" SET ${setClause} WHERE id = ?`;

        db.run(sql, values, function(err2) {
          if (err2)          return reject(err2);
          if (this.changes === 0) return reject(new Error(`No existe fila con id=${id}`));
          resolve({ message: `Fila actualizada en '${tableName}' (id=${id})` });
        });
      }
    );
  });
}

// DELETE: tabla DELETE id;
function executeDelete(db, ast) {
  const tableName = ast.table;
  const id        = ast.id;

  if (id === undefined) return Promise.reject(new Error('DELETE requiere id'));

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName],
      (err, row) => {
        if (err)  return reject(err);
        if (!row) return reject(new Error(`La tabla '${tableName}' no existe`));

        db.run(`DELETE FROM "${tableName}" WHERE id = ?`, [id], function(err2) {
          if (err2)          return reject(err2);
          if (this.changes === 0) return reject(new Error(`No existe fila con id=${id}`));
          resolve({ message: `Fila eliminada de '${tableName}' (id=${id})` });
        });
      }
    );
  });
}

// DROP: tabla DROP;  (opcional)
function executeDrop(db, ast) {
  const tableName = ast.table;
  return new Promise((resolve, reject) => {
    db.run(`DROP TABLE IF EXISTS "${tableName}"`, err => {
      if (err) return reject(err);
      db.run(`DELETE FROM _yfera_tables WHERE table_name=?`, [tableName]);
      resolve({ message: `Tabla '${tableName}' eliminada` });
    });
  });
}

// ── Endpoints ────────────────────────────────────────────────────────────────

// Ejecutar SQL AST
app.post('/api/sql/execute', async (req, res) => {
  try {
    console.log('[backend] /api/sql/execute called, body keys:', Object.keys(req.body || {}));
    console.log('[backend] /api/sql/execute -> AST preview:', JSON.stringify(req.body?.ast ?? {}).slice(0,1000));
  } catch (e) {
    console.log('[backend] /api/sql/execute -> failed to stringify body:', e);
  }
  const { ast, project } = req.body;
  if (!ast) return res.status(400).json({ success: false, error: 'AST requerido' });

  const db = getDb(project);
  try {
    const result = await executeAST(db, ast);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Listar tablas de un proyecto
app.get('/api/sql/tables', (req, res) => {
  const db = getDb(req.query.project);
  db.all(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_yfera_%'`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ tables: rows.map(r => r.name) });
    }
  );
});

// Listar proyectos (archivos .db disponibles)
app.get('/api/sql/projects', (req, res) => {
  try {
    const files = fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.db') && !f.startsWith('_'))
      .map(f => f.replace('.db', ''));
    res.json({ projects: files });
  } catch {
    res.json({ projects: [] });
  }
});

// Health check
app.get('/api/sql/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend YFERA funcionando' });
});

app.listen(PORT, () => {
  console.log(`Backend YFERA escuchando en http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\nCerrando backend...');
  for (const { db } of connections.values()) db.close();
  process.exit(0);
});
