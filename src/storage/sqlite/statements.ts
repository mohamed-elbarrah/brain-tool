/**
 * Prepared SQL statements for the SQLite adapter.
 *
 * Each statement is compiled once at DB open and reused. better-sqlite3
 * compiles SQL → bytecode, so preparing once avoids re-parsing every call.
 */

import Database from "better-sqlite3";

type Stmts = Record<string, any>;

export function prepareStatements(db: Database.Database): Stmts {
  const insertFile = db.prepare(
    `INSERT INTO files (path, language, mtime, hash, parse_state, error, last_indexed_at)
     VALUES (@path, @language, @mtime, @hash, @parseState, @error, @lastIndexedAt)`
  );
  const getFile = db.prepare("SELECT * FROM files WHERE path = ?");
  const getFiles = db.prepare("SELECT * FROM files ORDER BY path");
  const deleteFile = db.prepare("DELETE FROM files WHERE path = ?");
  const updateFileState = db.prepare("UPDATE files SET parse_state = ?, error = ? WHERE path = ?");
  const countFiles = db.prepare("SELECT COUNT(*) AS c FROM files");
  const countSymbols = db.prepare("SELECT COUNT(*) AS c FROM symbols");

  const insertSymbol = db.prepare(
    `INSERT INTO symbols (file_id, symbol_id, name, kind, local_name, exported,
      start_line, start_column, end_line, end_column, start_offset, end_offset,
      signature, signature_hash)
     VALUES (@fileId, @symbolId, @name, @kind, @localName, @exported,
      @startLine, @startColumn, @endLine, @endColumn, @startOffset, @endOffset,
      @signature, @signatureHash)`
  );
  const getSymbolsInFile = db.prepare(
    `SELECT s.* FROM symbols s JOIN files f ON f.id = s.file_id WHERE f.path = ? ORDER BY s.name`
  );
  const getSymbol = db.prepare(
    `SELECT s.*, f.path FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.symbol_id = ?`
  );
  const querySymbols = db.prepare(
    `SELECT s.*, f.path FROM symbols s
     JOIN files f ON f.id = s.file_id
     WHERE (? IS NULL OR s.name = ?)
       AND (? IS NULL OR s.kind = ?)
       AND (? IS NULL OR f.path = ?)
       AND (? IS NULL OR s.exported = ?)
     ORDER BY f.path, s.name, s.symbol_id`
  );

  const insertMember = db.prepare(
    `INSERT INTO symbol_members (symbol_id, kind, name, type, "order") VALUES (@symbolId, @kind, @name, @type, @order)`
  );

  const insertReference = db.prepare(
    `INSERT INTO references_ (file_id, kind, specifier, target_file_hint, target_symbol_id,
      start_line, start_column, end_line, end_column, start_offset, end_offset)
     VALUES (@fileId, @kind, @specifier, @targetFileHint, @targetSymbolId,
      @startLine, @startColumn, @endLine, @endColumn, @startOffset, @endOffset)`
  );
  const getReferencesInFile = db.prepare(
    `SELECT r.*, f.path FROM references_ r JOIN files f ON f.id = r.file_id WHERE f.path = ? ORDER BY r.start_line, r.start_column`
  );
  const resolveReference = db.prepare(
    `SELECT s.symbol_id FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? AND f.path = ? LIMIT 1`
  );

  const insertEdge = db.prepare(
    `INSERT INTO edges (source_symbol_id, kind, target_symbol_id, target_reference_id)
     VALUES (@sourceSymbolId, @kind, @targetSymbolId, @targetReferenceId)`
  );
  const getOutgoingEdges = db.prepare("SELECT * FROM edges WHERE source_symbol_id = ? ORDER BY kind");
  const getIncomingEdges = db.prepare("SELECT * FROM edges WHERE target_symbol_id = ? ORDER BY kind");

  const insertComponent = db.prepare(
    `INSERT INTO components (symbol_id, props) VALUES (@symbolId, @props)`
  );
  const insertComponentImport = db.prepare(
    `INSERT INTO component_imports (component_symbol_id, imported_symbol_id) VALUES (@componentSymbolId, @importedSymbolId)`
  );
  const getComponent = db.prepare("SELECT * FROM components WHERE symbol_id = ?");
  const getComponents = db.prepare("SELECT * FROM components ORDER BY symbol_id");

  const insertRoute = db.prepare(
    `INSERT INTO routes (symbol_id, path, method, controller_symbol_id) VALUES (@symbolId, @path, @method, @controllerSymbolId)`
  );
  const getRoute = db.prepare("SELECT * FROM routes WHERE symbol_id = ?");
  const getRoutes = db.prepare("SELECT * FROM routes ORDER BY path, method");

  const getSchemaVersion = db.prepare("SELECT MAX(version) AS v FROM schema_migrations");
  const insertMigration = db.prepare("INSERT INTO schema_migrations (version) VALUES (?)");
  const getLastIndexed = db.prepare("SELECT MAX(last_indexed_at) AS v FROM files");

  return { insertFile, getFile, getFiles, deleteFile, updateFileState, countFiles, countSymbols,
    insertSymbol, getSymbolsInFile, getSymbol, querySymbols,
    insertMember,
    insertReference, getReferencesInFile, resolveReference,
    insertEdge, getOutgoingEdges, getIncomingEdges,
    insertComponent, insertComponentImport, getComponent, getComponents,
    insertRoute, getRoute, getRoutes,
    getSchemaVersion, insertMigration, getLastIndexed };
}