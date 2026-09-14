import type { SafePromise } from "result-interface";
import { runContainer } from "./container_process";

export const QCAN_IMAGE = "qcan";

/**
 * Asks QCan to rewrite a query into its canonical form.
 */
export function canonicalise(query: string): SafePromise<string> {
  return runContainer(QCAN_IMAGE, ["-q", query]);
}
