import { type Result, result } from "result-interface";
import { federate } from "./federate";
import type { LocatedQuery } from "./containment_mapping";

/** The members a comma separated federation names, without their brackets. */
export function membersOf(federation: string): string[] {
  return federation
    .split(",")
    .map((member) => member.trim().replace(/^<|>$/g, ""))
    .filter((member) => member.length > 0);
}

/** The query as it is read, or over the federation when one is given. */
export function assign(
  query: LocatedQuery,
  federation: string | undefined,
): Result<LocatedQuery> {
  return federation === undefined
    ? result(query)
    : federate(query, membersOf(federation));
}
