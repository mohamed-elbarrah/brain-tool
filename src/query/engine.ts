/**
 * Query Engine — composition root for all queries.
 *
 * [HARD] §8.1: Pure functions: (storagePort, params) → Result<T>.
 * No writes, no side effects. Deterministic: same DB + params → same result.
 * Never throw for expected conditions.
 *
 * The engine wires together the seven queries, metadata helpers, and limits.
 * It is instantiated with a ReadStoragePort and optional custom limits.
 */

import type { ReadStoragePort } from "../storage/port.ts";
import type { Result } from "../domain/result.ts";
import type { BrainError } from "../domain/errors.ts";
import type { QueryLimits } from "./limits.ts";
import { DEFAULT_LIMITS } from "./limits.ts";
import type { FindSymbolParams, FindSymbolResult } from "./queries/find-symbol.ts";
import { findSymbol } from "./queries/find-symbol.ts";
import type { FindUsageParams, FindUsageResult } from "./queries/find-usage.ts";
import { findUsage } from "./queries/find-usage.ts";
import type { FindDependentsParams, FindDependentsResult } from "./queries/find-dependents.ts";
import { findDependents } from "./queries/find-dependents.ts";
import type { ImpactAnalysisParams, ImpactAnalysisResult } from "./queries/impact-analysis.ts";
import { impactAnalysis } from "./queries/impact-analysis.ts";
import type { FindDuplicateParams, FindDuplicateResult } from "./queries/find-duplicate.ts";
import { findDuplicate } from "./queries/find-duplicate.ts";
import type { SearchComponentsParams, SearchComponentsResult } from "./queries/search-components.ts";
import { searchComponents } from "./queries/search-components.ts";
import type { SearchRoutesParams, SearchRoutesResult } from "./queries/search-routes.ts";
import { searchRoutes } from "./queries/search-routes.ts";

export class QueryEngine {
  private storage: ReadStoragePort;
  private limits: QueryLimits;

  constructor(storage: ReadStoragePort, limits?: Partial<QueryLimits>) {
    this.storage = storage;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** "Where is this symbol defined?" */
  async findSymbol(params: FindSymbolParams): Promise<Result<FindSymbolResult, BrainError>> {
    return findSymbol(this.storage, params, this.limits);
  }

  /** "Where is this symbol used?" */
  async findUsage(params: FindUsageParams): Promise<Result<FindUsageResult, BrainError>> {
    return findUsage(this.storage, params, this.limits);
  }

  /** "What depends on this symbol?" */
  async findDependents(params: FindDependentsParams): Promise<Result<FindDependentsResult, BrainError>> {
    return findDependents(this.storage, params, this.limits);
  }

  /** "What breaks if this symbol changes?" */
  async impactAnalysis(params: ImpactAnalysisParams): Promise<Result<ImpactAnalysisResult, BrainError>> {
    return impactAnalysis(this.storage, params, this.limits);
  }

  /** "Does similar functionality already exist?" */
  async findDuplicate(params: FindDuplicateParams): Promise<Result<FindDuplicateResult, BrainError>> {
    return findDuplicate(this.storage, params, this.limits);
  }

  /** "Which components use this hook/prop?" */
  async searchComponents(params: SearchComponentsParams): Promise<Result<SearchComponentsResult, BrainError>> {
    return searchComponents(this.storage, params, this.limits);
  }

  /** "Which routes match this pattern?" */
  async searchRoutes(params: SearchRoutesParams): Promise<Result<SearchRoutesResult, BrainError>> {
    return searchRoutes(this.storage, params, this.limits);
  }
}