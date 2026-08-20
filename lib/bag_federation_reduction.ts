import { Algebra } from "@traqula/algebra-transformations-1-1";
import { type Result, result, error } from "result-interface";
import {
  POSITIONS,
  type LocatedBody,
  type LocatedTriplePattern,
} from "./containment_mapping";

export interface UnionBranch {
  member: string;
  pattern: Algebra.Pattern;
}

/** A conjunct of the query, either located already or a union to reduce. */
export type Slot =
  | { located: LocatedTriplePattern; branches?: undefined }
  | { located?: undefined; branches: [UnionBranch, ...UnionBranch[]] };

/** The virtual member holding the BKG of a sub-federation. */
export function virtualMember(subFederation: string[]): string {
  const members = Array.from(new Set(subFederation)).sort();
  const [only, ...rest] = members;

  if (only !== undefined && rest.length === 0) {
    return only;
  }

  const escaped = members.map((member) =>
    encodeURIComponent(member).replaceAll("_", "%5F"),
  );

  return `urn:federation:${escaped.join("_")}`;
}

function patternVariables(
  pattern: Pick<LocatedTriplePattern, "subject" | "predicate" | "object">,
  into: Set<string>,
): void {
  for (const position of POSITIONS) {
    const term = pattern[position];

    if (term.termType === "Variable") {
      into.add(term.value);
    }
  }
}

/**
 * Whether a branch evaluates the reference pattern, up to a renaming of the
 * variables local to the union.
 */
function evaluatesReference(
  reference: Algebra.Pattern,
  pattern: Algebra.Pattern,
  isLocal: (variable: string) => boolean,
): boolean {
  const renaming = new Map<string, string>();
  const taken = new Set<string>();

  for (const position of POSITIONS) {
    const referenced = reference[position];
    const branched = pattern[position];

    if (referenced.equals(branched)) {
      if (referenced.termType === "Variable") {
        renaming.set(referenced.value, referenced.value);
        taken.add(referenced.value);
      }

      continue;
    }

    if (referenced.termType !== "Variable" || branched.termType !== "Variable") {
      return false;
    }

    if (!isLocal(referenced.value) || !isLocal(branched.value)) {
      return false;
    }

    const assigned = renaming.get(branched.value);

    if (assigned === undefined) {
      if (taken.has(referenced.value)) {
        return false;
      }

      renaming.set(branched.value, referenced.value);
      taken.add(referenced.value);
    } else if (assigned !== referenced.value) {
      return false;
    }
  }

  return true;
}

/**
 * Reduces each union to its triple pattern evaluated at the virtual member of
 * its sub-federation. The semantics is bag as soon as a member is virtual, as
 * its graph is a BKG.
 */
export function reduce(
  slots: Slot[],
  distinguished: Set<string>,
): Result<LocatedBody> {
  const occurrences = new Map<string, number>();
  const counted: { slot: Slot; inside: Map<string, number> }[] = [];

  for (const slot of slots) {
    const inside = new Map<string, number>();
    counted.push({ slot, inside });

    const patterns: Pick<
      LocatedTriplePattern,
      "subject" | "predicate" | "object"
    >[] = [];

    if (slot.branches === undefined) {
      patterns.push(slot.located);
    } else {
      for (const branch of slot.branches) {
        patterns.push(branch.pattern);
      }
    }

    for (const pattern of patterns) {
      const variables = new Set<string>();
      patternVariables(pattern, variables);

      for (const variable of variables) {
        occurrences.set(variable, (occurrences.get(variable) ?? 0) + 1);
        inside.set(variable, (inside.get(variable) ?? 0) + 1);
      }
    }
  }

  const body: LocatedTriplePattern[] = [];
  let virtual = false;

  for (const { slot, inside } of counted) {
    if (slot.branches === undefined) {
      body.push(slot.located);
      continue;
    }

    const isLocal = (variable: string) =>
      !distinguished.has(variable) &&
      occurrences.get(variable) === inside.get(variable);

    const reference = slot.branches[0].pattern;
    const members: string[] = [];

    for (const branch of slot.branches) {
      if (!evaluatesReference(reference, branch.pattern, isLocal)) {
        return error(
          new Error(
            "a union evaluates different triple patterns, so it is not a UCFQ",
          ),
        );
      }

      members.push(branch.member);
    }

    const member = virtualMember(members);
    virtual ||= member !== members[0];

    body.push({
      location: member,
      subject: reference.subject,
      predicate: reference.predicate,
      object: reference.object,
    });
  }

  return result({ body, semantics: virtual ? "bag" : "bag-set" });
}
