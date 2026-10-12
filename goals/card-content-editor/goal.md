# Goal: Card content editor and JSON import

Add a Cards section to Card Forge for manually creating and editing faction-linked combat, schema/tactic, and upgrade cards, with their category-specific names, texts, and game parameters stored in SQLite. Support a validated JSON file upload with a preview and an explicit, atomic import through the backend. AI content generation and editing are outside this goal.

## Shared understanding

[facts.md](facts.md) is the authoritative list of accepted outcomes. [facts.meta.json](facts.meta.json) preserves fact IDs, user comments, and the selected automated-verification requirements. The interview and facts JSON files in this directory preserve the discovery and review results.

## Execution plan

Follow [plan.md](plan.md), approved in Plannotator with no annotations. Implement its five ordered steps: persistence, API, manual editor, JSON upload, and verification. The existing application code was inspected during setup; verify file paths and the next available migration number before implementation.

## Done condition

Every accepted fact is implemented and verified. Each fact selected for automated verification has a concrete passing automated check, or an explicitly documented external blocker that prevents claiming that fact is verified; all remaining facts have completed manual checks. Saved cards survive reopening and application restart, invalid imports write zero records, and existing workflows continue to work. Report verification results and any blockers with the affected fact IDs; unresolved required behavior leaves this goal incomplete.

This goal package is ready for implementation; setup did not implement the feature.
