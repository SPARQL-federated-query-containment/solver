import type { SafePromise } from "result-interface";
import type { LocatedQuery } from "./containment_mapping";

/** Decides set containment of two located queries. */
export type SetContainmentSolver = (
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
) => SafePromise<boolean>;

/** A set containment solver kept alive across calls. */
export interface SetSolver {
  isContained: SetContainmentSolver;
  close(): Promise<void>;
}
