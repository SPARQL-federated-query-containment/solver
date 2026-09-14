import type { SafePromise } from "result-interface";
import type { LocatedQuery } from "./containment_mapping";

export type ContainmentResult =
  | "contained"
  | "not contained"
  | "unknown"
  | "timeout"
  | "out of memory";

/** Decides containment of two located queries. */
export type ContainmentSolver = (
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
) => SafePromise<ContainmentResult>;
