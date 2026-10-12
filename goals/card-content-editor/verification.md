# Verification: Card content editor and JSON import

Implemented all five plan steps. Verification date: 2026-10-12.

## Results

| Check | Result |
| --- | --- |
| `cd server && go test ./...` | Pass: all Go packages, including card store/API, migration preservation, and existing artwork/batch tests |
| `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/cards` | Pass: 65 tests (12 UI scenarios and 53 validation/file-reading cases) |
| `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | 214 pass, 1 pre-existing failure; see environment blocker below |
| `cd web && npm run build` | Pass: TypeScript and production build |
| `cd web && npm run lint` | Pass |
| `git diff --check` | Pass |

The client and backend both exercise the same 49 JSON examples in `testdata/card-validation.json`. Additional tests cover integer JSON spellings such as `1.0` and `1e0`. Atomicity is tested both with invalid input and with a database trigger that rejects the second INSERT after the first INSERT succeeded.

## Fact verification map

| Accepted fact ID | Evidence |
| --- | --- |
| categories | `TestCardsRoundTripCategoriesFiltersAndRestart`; parameterized `create combat/schema/upgrade` UI tests |
| faction | Shared JSON fixtures; `TestCardsValidationAndAtomicImport`; API faction deletion test |
| manual | Browser inspection and code review: forms and import have no AI buttons or calls |
| combat-level | Store round trips for levels 0–3; shared fixtures; combat UI select/payload test |
| combat-cost | Shared zero/negative/missing-value fixtures; store round trip; combat UI Save payload |
| combat-text | Empty/non-empty upper/lower fields in shared fixtures, store round trip, and combat UI test |
| combat-symbols | Shared bounds/missing-value fixtures; store round trip and combat UI payload/diff tests |
| schema-kind | Shared fixtures for schema/tactic; store round trips; schema UI create test |
| schema-action | Store round trips for all four actions and both subtypes; shared fixtures; schema UI option/payload test |
| schema-field | Browser/code inspection: movement help says “within its own field”; no board simulation added |
| upgrade-kind | Store round trips and shared fixtures for all four types; upgrade UI option/payload test |
| upgrade-text | Store round trip, shared fixtures, upgrade UI create test; form has no price or level |
| list | Store/API filter tests; UI combined faction/category filter test; browser Cards list |
| persistence | UI POST only after Save and edit/reopen tests; store close/reopen test; browser reload and actual backend restart retained all six QA cards |
| diff | UI edit diff test covers upper text and shields; browser showed upper text word diff and guns 2 → 4 |
| unsaved | UI cancel/discard/router/beforeunload tests; real browser canceled reload through a native beforeunload dialog and kept draft after canceling router navigation; confirmation layering fixed and verified in browser |
| language | Cyrillic shared fixtures and store round trip; Unicode UI create tests; browser saved/edited Cyrillic card names/text |
| validation | Shared fixtures, API invalid payload tests, UI blank-number and failed-Save draft retention tests |
| scope | Code/UI inspection: no card delete, duplicate, revision, illustration, rendering, printing, export, AI, or balancing features added |
| existing | All Go regression tests pass; old frontend tests pass except the unchanged multipart test noted below. Migration test preserves pre-0015 faction/template data. Browser Factions, Card Types, Generations, and Batches render without alerts |
| json-upload | Shared envelope rules; FileReader UTF-8 test; UI file upload test; browser-generated UTF-8 File selected through the file input and previewed all three categories |
| json-validation | Shared 49-example corpus in UI/API; syntax/envelope/indexed-error tests; valid downloadable example; UTF-8 rejection test; UI invalid source blocks POST |
| json-commit | Store rollback trigger test; API invalid mixed import saves zero; UI preview/no-POST/explicit Import and server-error retention tests; browser imported three cards then rejected an unknown-faction import with count unchanged at six |

## Browser checks

Used an isolated temporary SQLite database at `/tmp/card-content-editor-qa/cardforge.db`; existing application data was not modified. Created and edited combat, schema/tactic, and upgrade cards through the actual UI. Reloaded, restarted the API process, and verified saved values. Reviewed the Cards screenshot and confirmed readable English labels, Unicode content, and the existing visual theme.

Verified actual navigation cancellation and native reload warning. The first browser pass found a confirmation rendered beneath the editor; the guard now renders after the editor, and a UI test verifies that its confirmation is the topmost dialog. A second browser pass clicked Keep editing successfully and saved the preserved draft.

The browser connector refused local file paths even within this workspace. File-upload browser verification instead used a generated UTF-8 `File` and `DataTransfer` in the browser, invoking the actual file-input/FileReader flow. No filesystem access restriction was bypassed. The file parsing/upload path also passes jsdom tests.

Existing pages were inspected without requesting paid artwork generation. Artwork and batch behavior are covered by the existing Go/API and frontend tests with mocks.

## Existing environment blocker

Runtime: Node v26.9.0. This runtime's experimental global web storage shadows jsdom storage, so frontend tests use `NODE_OPTIONS=--no-experimental-webstorage`; no application or shared test-setup workaround was added.

One existing frontend test fails at `web/src/pages/card-types/CardTypesPage.test.tsx:81`: `create flow posts multipart with staged file`. Node's Undici multipart parser raises an assertion while MSW reads the intercepted FormData; the handler never receives the name. The same failure was reproduced from an untouched archive of commit `c8e61a608dc99a11cf9ba64c78c42adf1ce9f803`, using the same dependencies/runtime, with 10 other tests in that file passing. This is an existing test/runtime blocker for the `existing` fact's complete automated regression check, not a new card-editor failure. A fully green `make test` cannot be claimed in this environment.

## Operational notes

The API bounds incoming card JSON at 10 MiB. Import creates new records each time; repeated uploads can create duplicates. JSON uses faction IDs from the current database; the UI lists IDs and generates its downloadable example with the first existing faction. `example-cards.json` is a reference fixture whose faction ID must match your database.

No dependencies, artwork prompts, image generation jobs, or existing templates were changed. Migration 0015 is additive and runs through the existing database-open migration path. New cards prevent deletion of their associated faction, returning 409.
