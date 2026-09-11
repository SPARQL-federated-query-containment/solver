import { type SafePromise, result, isError } from "result-interface";
import {
  isProjectionFree,
  sameHead,
  type LocatedQuery,
} from "./containment_mapping";
import { coversEveryDuplicate, isSubgoalsOnto } from "./subgoals_onto";
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

  // A conjunct read at a single member returns a matched triple once, whatever
  // the rest of the body reads, so it duplicates no solution and the containing
  // query answers for it without a conjunct of its own. Asking the mapping to
  // cover it would reject a pair on a located database no federation holds.
  if (isProjectionFree(subQuery) && isProjectionFree(superQuery)) {
    return result(
      coversEveryDuplicate(subQuery, superQuery)
        ? "contained"
        : "not contained",
    );
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
