/**
 * Tests for the route extractor.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import { extractRoutes } from "./routes.ts";

function parse(source: string, filePath = "src/routes.ts"): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

describe("extractRoutes", () => {
  it("extracts app.get() route", () => {
    const source = "app.get('/api/users', getUsers);";
    const ast = parse(source);
    const { routes } = extractRoutes(ast, "src/routes.ts");
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0]!.path, "/api/users");
    assert.strictEqual(routes[0]!.method, "get");
    assert.strictEqual(routes[0]!.controllerSymbolId, "getUsers");
  });

  it("extracts router.post() route", () => {
    const source = "router.post('/api/users', createUser);";
    const ast = parse(source);
    const { routes } = extractRoutes(ast, "src/routes.ts");
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0]!.path, "/api/users");
    assert.strictEqual(routes[0]!.method, "post");
  });

  it("extracts multiple routes", () => {
    const source = `
      app.get('/users', listUsers);
      app.post('/users', createUser);
      app.delete('/users/:id', deleteUser);
    `;
    const ast = parse(source);
    const { routes } = extractRoutes(ast, "src/routes.ts");
    assert.strictEqual(routes.length, 3);
  });

  it("extracts object literal routes", () => {
    const source = "const route = { path: '/api/health', method: 'GET', handler: healthCheck };";
    const ast = parse(source);
    const { routes } = extractRoutes(ast, "src/routes.ts");
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0]!.path, "/api/health");
    assert.strictEqual(routes[0]!.method, "get");
  });

  it("returns empty for non-route files", () => {
    const source = "const x = 42;";
    const ast = parse(source);
    const { routes } = extractRoutes(ast, "src/utils.ts");
    assert.strictEqual(routes.length, 0);
  });
});