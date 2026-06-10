---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO Assessment: Duration Indicators TODO V01

The TODO is mostly aligned with `20260609_DURATION_INDICATORS_PLAN_V02.md`, but it still has two qualifying concerns that risk a successful implementation.

## 1. Phase 5 requires `--help` to pass without requiring `--help` support

Phase 5 tells the implementer to run:

```bash
npm run backfill:segment-durations -- --help
```

and requires that command to resolve without TypeScript or runtime errors. However, the Phase 5 implementation checklist only says the new script supports `--apply`, `--force`, and `--limit`. It does not instruct the implementer to add `--help` handling.

This matters because the current repo's analogous scripts, `scripts/backfill-meditation-durations.ts` and `scripts/backfill-sound-file-durations.ts`, reject unknown arguments in `parseArgs()`. If the new script follows that existing structure exactly, `--help` will throw `Unknown argument: --help`, causing the phase gate to fail even when the feature implementation is otherwise correct.

Recommended TODO fix: explicitly add `--help` support to the backfill script task, including expected behavior such as printing usage and exiting successfully before database initialization. Alternatively, change the validation command to a supported no-op invocation, but V02 explicitly names the `--help` check, so adding `--help` support is the cleaner correction.

## 2. Phase 8 contradicts the plan on absent category values

Phase 8 requires that, after worker completion, all three new fields are non-null. That matches the V02 worker design: the worker initializes category accumulators at `0` and writes all three totals in the final `meditation.update()`.

But the same Phase 8 bullet gives this example:

> a meditation with only a short text segment should have a non-zero `duration_seconds_talking` and zero or null for the others if no sound/pause elements are present

The `or null` option conflicts with the plan's accumulator-based worker behavior and with the preceding Phase 8 requirement that all three fields are non-null after a successful build. It could lead an implementing agent to preserve `null` for categories that were present in no jobs, which would make worker output diverge from the planned `0` totals and complicate the UI's missing-data semantics.

Recommended TODO fix: replace "zero or null" with "zero" for categories with no matching jobs. Reserve `null` for unpopulated or failed-to-backfill data, not for successful new worker builds with absent categories.
