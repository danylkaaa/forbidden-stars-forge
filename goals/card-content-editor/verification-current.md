# Current card-editor goal verification

## State

The existing card editor, source API, SQLite persistence, client/backend JSON validation, atomic import, diff and unsaved-change guard were inspected in the current worktree. Original implementation is committed as e945a31; later library work hid the Cards route from navigation while retaining the route and editor. This audit restores access through a Library header link labelled **Cards / JSON import**, targeting `/cards`.

The navigation regression test was first run without the link and failed with `Unable to find role=link and name Cards / JSON import`. After the link was added, all card/assembly focused tests passed. New changes are confined to the link and its regression test; unrelated current worktree changes are preserved.

## Actual checks

| Check | Result |
| --- | --- |
| `PATH=/Users/danylo/.local/share/fnm/node-versions/v22.23.3/installation/bin:$PATH make test` | Pass: all Go packages and 261 frontend tests across 37 test files |
| Node 22 Vitest focused run: `src/pages/cards src/pages/assemble/AssemblePage.test.tsx` | Pass: 82 tests |
| `cd web && npm run build` | Pass: TypeScript and Vite production build |
| `cd web && npm run lint` | Pass |
| `git diff --check` | Pass |

Node 26 produced the previously documented Undici multipart parsing failure. Running the existing multipart test and then the complete suite on installed Node 22.23.3 LTS passes without changing the multipart handler or tests. Preview-related failures observed during the first run passed on rerun after those unrelated files changed in the worktree; this audit does not claim to have fixed them.

## Fact evidence

The original [verification.md](verification.md) maps all 23 accepted facts to implementation and tests. Those card-specific files were inspected again and the tests rerun. Current automated evidence includes all category/enum values, safe integer bounds, required/unknown/category-specific fields, Unicode, database close/reopen, migration preservation, failure after an INSERT with full transaction rollback, API create/get/update/filter/import, faction deletion protection, draft retention, diff, navigation/beforeunload guards, UTF-8 upload, preview with no POST and explicit Import. The new Library-link regression additionally checks that users can discover the Cards section and JSON import from the current Library.

Manual source review confirms English editor labels, independent upper/lower combat text, the own-field schema movement explanation, absence of AI actions in the Cards editor, and no expansion of this goal into illustration/printing/export/balancing. Later assembly work already present in the repository is not removed.

## Remaining verification

A fresh browser smoke check of the current navigation/editor/import flow is not completed. The Chrome DevTools connector was attempted twice and reports that its browser profile is already in use; Computer Use reports native pipe startup failure and exposes no browsers/apps. No browser was stopped or profile modified. The older verification report records successful browser create/edit/import/reload/restart checks, but this audit does not substitute that report for a fresh check of the changed Library navigation.

Required next check: open the running app's Library, click **Cards / JSON import**, confirm Cards opens, verify a dirty form survives canceled navigation, and import a valid three-category JSON payload only after preview. Use an isolated test database. Goal remains active until the required current browser check is completed or an authorized revision removes that verification requirement.
