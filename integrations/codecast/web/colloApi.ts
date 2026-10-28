import { anyApi, type ApiFromModules, type FilterApi, type FunctionReference } from 'convex/server';
import type * as collo from '../../convex/convex/collo';
import type * as colloSessions from '../../convex/convex/colloSessions';
import type * as colloHandoffs from '../../convex/convex/colloHandoffs';
import type * as colloCheckpoints from '../../convex/convex/colloCheckpoints';
// The immutable upstream API declarations predate these modules. Derive their
// public references from the actual prepared backend, without weakening types.
export const colloApi = anyApi as unknown as FilterApi<
  ApiFromModules<{
    collo: typeof collo;
    colloSessions: typeof colloSessions;
    colloHandoffs: typeof colloHandoffs;
    colloCheckpoints: typeof colloCheckpoints;
  }>,
  FunctionReference<'query' | 'mutation', 'public'>
>;
