import { type Result, result, error, isError } from "result-interface";
import { isLocal, subFederation } from "./federation_member";
import type { LocatedQuery } from "./containment_mapping";

/**
 * The query as an exhaustive source assignment over the federation, where every
 * triple pattern is evaluated at every member.
 */
export function federate(
  query: LocatedQuery,
  members: string[],
): Result<LocatedQuery> {
  if (members.length === 0) {
    return error(new Error("the federation holds no member"));
  }

  for (const pattern of query.body) {
    if (!isLocal(pattern.location)) {
      return error(
        new Error(
          "the query already reads at a federation member, so it cannot be assigned one",
        ),
      );
    }
  }

  const location = subFederation(members);

  if (isError(location)) {
    return location;
  }

  return result({
    head: query.head,
    body: query.body.map((pattern) => ({ ...pattern, location: location.value })),
    semantics: location.value.size === 1 ? "bag-set" : "bag",
  });
}
