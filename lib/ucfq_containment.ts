import { type SafePromise, result, isError } from "result-interface";
import {
  isProjectionFree,
  sameHead,
  type LocatedQuery,
} from "./containment_mapping";
import { isSubgoalsOnto } from "./subgoals_onto";
import type { Containment } from "./federated_containment";
import type { SetContainmentSolver } from "./SetContainmentSolver";

/**
 * Decides whether the contained query is contained in the containing one under
 * bag semantics, the two being the CQs the BFR returns. The answer is exact
 * when both queries are projection-free, and sufficient otherwise.
 */
export async function decideUcfqContainment(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
  setContained: SetContainmentSolver,
): SafePromise<Containment> {
  if (!sameHead(subQuery, superQuery)) {
    return result("not contained");
  }

  if (isSubgoalsOnto(subQuery, superQuery)) {
    return result("contained");
  }

  if (isProjectionFree(subQuery) && isProjectionFree(superQuery)) {
    return result("not contained");
  }

  // A set database is a bag database whose multiplicities are all one, so bag
  // containment implies set containment and its failure rejects the pair.
  const setContainmentResult = await setContained(subQuery, superQuery);

  if (isError(setContainmentResult)) {
    return setContainmentResult;
  }

  return result(setContainmentResult.value ? "unknown" : "not contained");
}
