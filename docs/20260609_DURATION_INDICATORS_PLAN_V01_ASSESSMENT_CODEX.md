---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Duration Indicators Plan V01 Assessment

## Qualifying concerns

### 1. The plan should require a TODO for this change

`docs/20260609_DURATION_INDICATORS_PLAN_V01.md` says a formal TODO is not needed because the implementation sequence is ordered and fits in one branch (lines 148-150). I disagree. This is a nontrivial cross-package change touching at least schema migration, Sequelize model metadata, shared types, API serializers, rebuild reset paths, worker audio aggregation, web table rendering, a standalone backfill script, root script wiring, table reference docs, and production backfill operation.

The sequencing also has deployment gates and operator actions: migration before code rollout, dry-run backfill before threshold calibration, then apply backfill after the worker path is verified. A repo TODO would reduce implementation drift and make it explicit which checks block deployment versus which checks block backfill. Without one, the most likely failure is that a small but necessary step such as root script registration, tests, or backfill dry-run review is missed.

### 2. The standalone backfill script needs root npm command wiring

The plan defines `scripts/backfill-segment-durations.ts` as a standalone utility and says it should follow `backfill-meditation-durations.ts` (lines 85-99), but it does not mention adding the required root `package.json` script. `scripts/README.md` states that new scripts should be added with an npm entry using `TS_NODE_PROJECT=tsconfig.scripts.json`, and the root package already exposes existing backfills as `backfill:durations` and `backfill:sound-durations`.

This is an implementation-success issue, not just documentation polish. The backfill is part of the settled requirement from Nick's answers, and it needs a reliable, repeatable command path for dry-run and apply. The plan should add an implementation step for a root script such as `backfill:segment-durations`, and validation should run that command rather than invoking the TypeScript file ad hoc.

### 3. Threshold calibration is sequenced after the web decision that depends on it

The web section says `MID_THRESHOLD` and `HIGH_THRESHOLD` are filled in during implementation based on real duration distribution (line 81). The implementation sequence then adds the Guidance column and decides thresholds at step 7, while the backfill script and dry-run distribution review are step 8 (lines 103-110). The validation section also says the dry-run output is used to decide threshold values (line 143).

That creates an ordering conflict. The plan should either move a dry-run-capable backfill/distribution step before finalizing the web thresholds, or explicitly make the web threshold constants a follow-up after backfill dry-run data is reviewed. Otherwise the implementation can easily ship arbitrary thresholds and produce an indicator where most rows cluster into one color.

### 4. Tooltip formatting should not be left as an implementation judgment call

Nick's answer says hover should show the actual guidance duration in seconds or the standard duration format. The plan acknowledges that `formatDurationOrDash` rounds to whole minutes and can display under-60-second guidance as `"0 mins"` (lines 81 and 123), but still leaves seconds-aware formatting as a judgment call.

For this UI, `"0 mins"` is not an actual useful guidance duration and would undermine the hover requirement for short guidance segments. The plan should require a seconds-aware hover label for `durationSecondsTalking` and reserve the existing formatter only for places where minute rounding is acceptable.

### 5. Automated verification is underspecified for the risk level

The validation approach is entirely manual and environment-based (lines 137-146). This change alters serialization contracts, typed client data, reset behavior, worker aggregation, and UI rendering. The earlier Codex assessment recommended focused tests for worker category aggregation, API serialization, regeneration reset behavior, and web rendering.

The plan should include at least targeted API and worker tests plus typechecks for the affected packages. Web has no current test suite, so a typecheck/build and browser check may be enough there, but the plan should say that explicitly. Relying only on manual staging checks makes regressions in reset behavior or serializer field names too easy to miss.
