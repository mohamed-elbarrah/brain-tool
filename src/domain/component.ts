/**
 * Component — a React-like component extracted from source.
 */

export interface Component {
  readonly symbolId: string;
  readonly props: Record<string, unknown>;
  readonly importedComponentSymbolIds: readonly string[];
}
