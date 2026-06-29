/**
 * Route extractor — identifies route-like definitions.
 *
 * [HARD] §7.0: TS-aware in MVP. Extractor polymorphism deferred.
 *
 * Heuristics for route detection:
 *   - String literals starting with "/" assigned to a variable named `path`
 *   - Object properties like `method: "GET"` / `method: "POST"` near a path
 *   - Known router patterns: app.get(...), router.post(...), express.Router()
 *   - Variables or objects with a `method` and `path` property
 *
 * This is deliberately heuristic in MVP. A production route extractor would
 * trace router usage patterns more deeply.
 */

import ts from "typescript";
import type { Route } from "../../domain/route.ts";

export interface RouteExtraction {
  readonly routes: Route[];
}

/**
 * Extract route definitions from the AST.
 * Returns an empty array if no routes are detected (heuristic).
 */
export function extractRoutes(
  sourceFile: ts.SourceFile,
  filePath: string,
): RouteExtraction {
  const routes: Route[] = [];

  function visit(node: ts.Node): void {
    // app.get("/path", handler) or router.post("/path", handler) patterns
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
        const method = callee.name.text.toLowerCase();
        const validMethods = ["get", "post", "put", "patch", "delete", "options", "head", "all"];
        if (validMethods.includes(method)) {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isStringLiteral(firstArg) && firstArg.text.startsWith("/")) {
            const path = firstArg.text;
            const controllerArg = node.arguments[1];
            const controllerSym = controllerArg && ts.isIdentifier(controllerArg) ? controllerArg.text : undefined;
            routes.push({
              relativePath: filePath,
              symbolId: undefined,
              path,
              method: method as any,
              controllerSymbolId: controllerSym,
            });
          }
        }
      }
    }

    // Object literal routes: { path: "/foo", method: "GET" }
    if (ts.isObjectLiteralExpression(node)) {
      let pathVal: string | undefined;
      let methodVal: string | undefined;
      let controllerVal: string | undefined;
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const key = prop.name.text;
          if (key === "path" && ts.isStringLiteral(prop.initializer)) {
            pathVal = prop.initializer.text;
          } else if (key === "method" && ts.isStringLiteral(prop.initializer)) {
            methodVal = prop.initializer.text.toLowerCase();
          } else if (key === "handler" && ts.isIdentifier(prop.initializer)) {
            controllerVal = prop.initializer.text;
          }
        }
      }
      if (pathVal && pathVal.startsWith("/")) {
        routes.push({
          relativePath: filePath,
          symbolId: undefined,
          path: pathVal,
          method: (methodVal ?? "get") as any,
          controllerSymbolId: controllerVal,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { routes };
}