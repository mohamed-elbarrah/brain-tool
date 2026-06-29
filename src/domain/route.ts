/**
 * Route — an API route extracted from source.
 */

export interface Route {
  readonly symbolId: string | undefined;
  readonly relativePath: string | undefined;
  readonly path: string;
  readonly method: string;
  readonly controllerSymbolId: string | undefined;
}
