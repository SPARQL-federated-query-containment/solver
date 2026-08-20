import type * as RDF from "@rdfjs/types";
import { toAlgebra, toAst } from "@traqula/algebra-sparql-1-1";
import { algebraUtils, Algebra } from "@traqula/algebra-transformations-1-1";
import { type Result, result, error, isError } from "result-interface";
import { FACTORY, GENERATOR, PARSER } from "./util";
import { reduce, type Slot, type UnionBranch } from "./bag_federation_reduction";
import {
  POSITIONS,
  variablesOf,
  type LocatedQuery,
} from "./containment_mapping";

/** The member holding the knowledge graph queried locally, f_loc in the paper. */
export const LOCAL_MEMBER = "urn:federation:local";

type NodeCallBacks = Parameters<typeof algebraUtils.visitOperation>[1];

const WITHIN_CQ = new Set<string>([
  Algebra.Types.BGP,
  Algebra.Types.JOIN,
  Algebra.Types.SERVICE,
  Algebra.Types.UNION,
  Algebra.Types.PATTERN,
  Algebra.Types.EXPRESSION,
]);

function holdsBlankNode(pattern: Algebra.Pattern): boolean {
  for (const position of POSITIONS) {
    if (pattern[position].termType === "BlankNode") {
      return true;
    }
  }

  return false;
}

/** The located form of a flattened federated CQ, L(Q) in the paper. */
export function locate(query: string): Result<LocatedQuery> {
  let algebra: Algebra.Operation;

  try {
    algebra = toAlgebra(PARSER.parse(query));
  } catch (thrown) {
    return error(new Error(`the query does not parse: ${String(thrown)}`));
  }

  if (algebra.type !== Algebra.Types.PROJECT) {
    return error(
      new Error(`the query holds a ${algebra.type}, so it is not a CQ`),
    );
  }

  const slots: Slot[] = [];
  let rejected: Error | undefined;

  const reject = (reason: string) => {
    rejected ??= new Error(reason);
  };

  // A visitor is only called for the types it is given, so every other type is
  // rejected rather than silently descended into.
  const outsideCq: NodeCallBacks = {};

  for (const type of Object.values(Algebra.Types)) {
    if (!WITHIN_CQ.has(type)) {
      Object.assign(outsideCq, {
        [type]: {
          visitor: () => { reject(`the query holds a ${type}, so it is not a CQ`); },
        },
      });
    }
  }

  const visit = (operation: Algebra.Operation, location: string): void => {
    algebraUtils.visitOperation(operation, {
      ...outsideCq,
      bgp: {
        visitor: (op) => {
          for (const pattern of op.patterns) {
            if (holdsBlankNode(pattern)) {
              reject("the query holds a blank node, which is not supported");
              return;
            }

            slots.push({
              located: {
                location,
                subject: pattern.subject,
                predicate: pattern.predicate,
                object: pattern.object,
              },
            });
          }
        },
      },
      union: {
        preVisitor: () => ({ continue: false }),
        visitor: (op) => {
          if (location !== LOCAL_MEMBER) {
            reject("a union is nested in a SERVICE clause");
            return;
          }

          const branches: UnionBranch[] = [];

          for (const branch of op.input) {
            if (branch.type !== Algebra.Types.SERVICE) {
              reject(`a union branch holds a ${branch.type}, so it is not a UCFQ`);
              return;
            }

            if (branch.name.termType !== "NamedNode") {
              reject("a SERVICE clause names its endpoint with a variable");
              return;
            }

            const [pattern, ...others] =
              branch.input.type === Algebra.Types.BGP
                ? branch.input.patterns
                : [];

            if (pattern === undefined || others.length > 0) {
              reject("a union branch evaluates more than one triple pattern");
              return;
            }

            if (holdsBlankNode(pattern)) {
              reject("the query holds a blank node, which is not supported");
              return;
            }

            branches.push({ member: branch.name.value, pattern });
          }

          const [first, ...rest] = branches;

          if (first === undefined) {
            reject("a union holds no branch");
            return;
          }

          slots.push({ branches: [first, ...rest] });
        },
      },
      service: {
        preVisitor: () => ({ continue: false }),
        visitor: (op) => {
          if (location !== LOCAL_MEMBER) {
            reject("a SERVICE clause is nested in another one");
            return;
          }

          if (op.name.termType !== "NamedNode") {
            reject("a SERVICE clause names its endpoint with a variable");
            return;
          }

          visit(op.input, op.name.value);
        },
      },
    });
  };

  visit(algebra.input, LOCAL_MEMBER);

  if (rejected !== undefined) {
    return error(rejected);
  }

  const distinguished = new Set(
    algebra.variables.map((variable) => variable.value),
  );
  const reduced = reduce(slots, distinguished);

  if (isError(reduced)) {
    return reduced;
  }

  const { body, semantics } = reduced.value;

  const bound = variablesOf(body);

  for (const variable of algebra.variables) {
    if (!bound.has(variable.value)) {
      return error(
        new Error(`the head holds ?${variable.value}, which the body never binds`),
      );
    }
  }

  return result({ head: algebra.variables, body, semantics });
}

const ESCAPED = /[%"\\^@]/g;
const STRING_DATATYPE = "^^<http://www.w3.org/2001/XMLSchema#string>";

/**
 * A literal written as a plain string carrying its datatype or language tag,
 * since a solver may reject the other forms. The escaping keeps the encoding
 * injective, so containment is preserved.
 */
function asPlainString(term: RDF.Term): RDF.Term {
  if (term.termType !== "Literal") {
    return term;
  }

  const lexical = term.value.replace(ESCAPED, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );

  const tag =
    term.language === ""
      ? `^^${term.datatype.value}`
      : `@${term.language}`;

  return FACTORY.dataFactory.literal(`${lexical}${tag}`);
}

/**
 * The located query written as SPARQL, each member becoming a named graph, so
 * that a solver deciding set containment can read it.
 */
export function toSparql(query: LocatedQuery): string {
  const patternsByLocation = new Map<string, Algebra.Pattern[]>();

  for (const located of query.body) {
    const pattern = FACTORY.createPattern(
      located.subject,
      located.predicate,
      asPlainString(located.object),
    );
    const patterns = patternsByLocation.get(located.location);

    if (patterns === undefined) {
      patternsByLocation.set(located.location, [pattern]);
    } else {
      patterns.push(pattern);
    }
  }

  const graphs: Algebra.Operation[] = [];

  for (const [location, patterns] of patternsByLocation) {
    graphs.push(
      FACTORY.createGraph(
        FACTORY.createBgp(patterns),
        FACTORY.dataFactory.namedNode(location),
      ),
    );
  }

  const [only, ...rest] = graphs;
  const body =
    only !== undefined && rest.length === 0
      ? only
      : FACTORY.createJoin(graphs);
  const sparql = GENERATOR.generate(
    toAst(FACTORY.createProject(body, query.head)),
  );

  return sparql.replaceAll(STRING_DATATYPE, "");
}
