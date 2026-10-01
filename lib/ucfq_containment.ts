import { type SafePromise, result, isError } from "result-interface";
import {
  isProjectionFree,
  sameHead,
  type LocatedQuery,
} from "./containment_mapping";
import { coversEveryDuplicate, isSubgoalsOnto } from "./subgoals_onto";
import type { ContainmentResult, ContainmentSolver } from "./containment_solver";

/**
 * Decides whether the contained query is contained in the containing one under
 * bag semantics, the two being the CQs the BFR returns. The mappings are only
 * sufficient, so a set contained pair without one is unknown.
 */
export async function decideUcfqContainment(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
  setContained: ContainmentSolver,
): SafePromise<ContainmentResult> {
  if (!sameHead(subQuery, superQuery)) {
    return result("not contained");
  }

  if (isSubgoalsOnto(subQuery, superQuery)) {
    return result("contained");
  }

  // A conjunct read at a single member is a set, so it needs no cover. The test
  // is only sufficient, so its failure falls through to set containment.
  if (
    isProjectionFree(subQuery) &&
    isProjectionFree(superQuery) &&
    coversEveryDuplicate(subQuery, superQuery)
  ) {
    return result("contained");
  }

  // A set database is a bag database whose multiplicities are all one, so bag
  // containment implies set containment and its failure rejects the pair.
  const setContainmentResult = await setContained(subQuery, superQuery);

  if (isError(setContainmentResult)) {
    return setContainmentResult;
  }

  if (setContainmentResult.value !== "contained" && setContainmentResult.value !== "not contained") {
    return result(setContainmentResult.value);
  }

  return result(setContainmentResult.value === "contained" ? "unknown" : "not contained");
}
