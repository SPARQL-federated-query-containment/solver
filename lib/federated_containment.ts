import { type SafePromise, result, isError } from "result-interface";
import {
  isProjectionFree,
  sameHead,
  variablesOf,
  type LocatedQuery,
} from "./containment_mapping";
import {
  subQueryContactsEveryMember,
  extraMembersBindNoFreshVariable,
} from "./federation_conditions";
import { isVariableOnto } from "./variable_onto";
import type { SetContainmentSolver } from "./SetContainmentSolver";

export type Containment = "contained" | "not contained" | "unknown";

/**
 * Decides whether the contained query is contained in the containing one under
 * bag-set semantics, in stages of increasing cost, and answers unknown on the
 * fragment where the problem is open.
 */
export async function decideSetContainment(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
  setContained: SetContainmentSolver,
): SafePromise<Containment> {
  if (!sameHead(subQuery, superQuery)) {
    return result("not contained");
  }

  if (!subQueryContactsEveryMember(subQuery, superQuery)) {
    return result("not contained");
  }

  if (!extraMembersBindNoFreshVariable(subQuery, superQuery)) {
    return result("not contained");
  }

  if (variablesOf(superQuery.body).size < variablesOf(subQuery.body).size) {
    return result("not contained");
  }

  if (isProjectionFree(subQuery) && isProjectionFree(superQuery)) {
    return result(
      isVariableOnto(subQuery, superQuery) ? "contained" : "not contained",
    );
  }

  const setContainmentResult = await setContained(subQuery, superQuery);

  if (isError(setContainmentResult)) {
    return setContainmentResult;
  }

  if (!setContainmentResult.value) {
    return result("not contained");
  }

  if (isProjectionFree(subQuery)) {
    return result("contained");
  }

  return result(isVariableOnto(subQuery, superQuery) ? "contained" : "unknown");
}
