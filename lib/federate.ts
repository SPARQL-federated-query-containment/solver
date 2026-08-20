import { type Result, result, error } from "result-interface";
import { virtualMember } from "./bag_federation_reduction";
import { LOCAL_MEMBER } from "./located_query";
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
    if (pattern.location !== LOCAL_MEMBER) {
      return error(
        new Error(
          "the query already reads at a federation member, so it cannot be assigned one",
        ),
      );
    }
  }

  const location = virtualMember(members);

  return result({
    head: query.head,
    body: query.body.map((pattern) => ({ ...pattern, location })),
    semantics: location === members[0] ? "bag-set" : "bag",
  });
}
