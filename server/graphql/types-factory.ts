import { createTypesFactory } from "gqtx";
import type { GraphQLContextType } from "./index";

/**
 * The gqtx types factory used by all GraphQL modules.
 *
 * This lives in its own module (instead of inline in `./index.ts`) so that
 * the circular imports between `./index.ts` and `./modules/*` resolve under
 * spec-compliant import hoisting (babel-jest) as well as under tsc's
 * source-order CommonJS emit. `./index.ts` re-exports `t`, so consumers are
 * unaffected.
 */
export const t = createTypesFactory<GraphQLContextType>();
