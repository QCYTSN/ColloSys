import { anyApi, type ApiFromModules, type FilterApi, type FunctionReference } from 'convex/server';
import type * as collo from '../../convex/convex/collo';
import type * as colloSessions from '../../convex/convex/colloSessions';
import type * as colloHandoffs from '../../convex/convex/colloHandoffs';
// The immutable upstream API declarations predate these modules. Derive their
// public references from the actual prepared backend, without weakening types.
export const colloApi = anyApi as unknown as FilterApi<
  ApiFromModules<{
    collo: typeof collo;
    colloSessions: typeof colloSessions;
    colloHandoffs: typeof colloHandoffs;
  }>,
  FunctionReference<'query' | 'mutation', 'public'>
>;
