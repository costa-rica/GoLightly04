---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Create Meditation Prompt

A reusable prompt for asking an LLM to author a Go Lightly meditation in **script mode**. Copy everything between the `--- PROMPT START ---` and `--- PROMPT END ---` markers into your model of choice, fill in the user description block, and paste the model's output directly into the script editor.

The script syntax below is what the Go Lightly parser recognizes today (see [20260514_SCRIPT_MODE_MEDITATIONS_V02.md](20260514_SCRIPT_MODE_MEDITATIONS_V02.md)). Any token that does not match these exact patterns will be rejected.

---

## --- PROMPT START ---

You are writing a guided meditation in the **Go Lightly** style. Your output is a single meditation script that will be passed directly to a text-to-speech engine — there is no human editing step. Output **only** the script. No preamble, no explanation, no markdown, no code fences.

### Voice and style

- Speak directly to the listener in the second person ("you", "your breath", "let your shoulders…").
- Calm, unhurried, present-tense. Short sentences. Lots of room to breathe.
- Avoid clinical or instructional language ("Step 1…", "Now we will…"). Avoid hype or affirmations that feel performative.
- Trust silence. A well-placed pause is often better than another sentence.

### Script syntax — use these exact tokens

The parser is strict. Tokens that are almost-but-not-quite right will be rejected, not spoken.

**1. Plain text → spoken aloud**

Anything that isn't a token below is read aloud by the TTS engine. Use ordinary punctuation; periods and commas already create natural micro-pauses. Do not include stage directions, brackets, or asides — they will be spoken.

**2. Pause: `<break time="Ns" />`**

Inserts silence for `N` seconds. `N` can be a decimal. Range: greater than 0 and at most 300 seconds.

- ✅ `<break time="2s" />`
- ✅ `<break time="3.5s" />`
- ❌ `<break time="3" />` (missing `s`)
- ❌ `<break time="3s">` (not self-closed)
- ❌ `<break time=3s />` (missing quotes)

Use pauses generously — after settling-in lines, between guided breaths, after each instruction the listener needs to act on. Typical values: 1–3 s between sentences within a section, 5–15 s after a "take a breath" instruction, 20–60 s for deep silent intervals.

**3. Speed override: `{speed=N}…{/speed}`**

Wraps spoken text and sets its TTS speed multiplier to `N`. Range: 0.7 (slowest) to 1.3 (fastest). Default is the engine's normal speed. The opening and closing tokens must both appear and must not nest.

- ✅ `{speed=0.9}Take a slow breath in.{/speed}`
- ❌ `{speed=.9}…{/speed}` (no integer part)
- ❌ `{speed=0.9}unclosed text…`
- ❌ nested `{speed=…}{speed=…}…{/speed}{/speed}`

Use sparingly. Reach for slower speeds (0.85–0.95) on key instructions you want the listener to absorb. Avoid faster-than-default speeds.

**4. Sound: `[Sound Name]`**

Plays a prerecorded sound. The name must match a known sound exactly (case-insensitive, surrounding whitespace ignored). Unknown names cause the script to be rejected.

**Available sounds (v1):**

- `[Tibetan Singing Bowl]` — a single resonant bowl strike with natural decay. Good for opening, closing, and major transitions.

Place a sound on its own line. Always follow a sound with a short `<break>` so the resonance can fade before the next voice line.

### Structure to follow

A good Go Lightly meditation roughly has:

1. **Opening sound + settling** — `[Tibetan Singing Bowl]` then a `<break time="4s" />`, then 2–4 sentences inviting the listener to arrive (posture, eyes, first breath).
2. **Body** — the theme requested by the user. Alternate guided lines with `<break>` rests. Use `{speed=…}` only on lines worth lingering on.
3. **Integration** — 2–3 sentences bringing the listener gently back, acknowledging where they are now.
4. **Closing sound** — `[Tibetan Singing Bowl]` then a `<break time="3s" />` and silence (no further text).

### Length guidance

Aim for the total duration the user requests. If they don't specify, default to roughly 5 minutes. Estimate: spoken text reads at ~150 words per minute at default speed, plus the sum of `<break>` durations, plus ~6 seconds for each `[Tibetan Singing Bowl]` (one strike + decay). Adjust pauses, not voice density, to hit the target.

### Final reminders

- Output only the script. The first character should be either the opening `[Tibetan Singing Bowl]` or the opening line of speech.
- Do not wrap the script in quotes, backticks, or a code block.
- Do not address me or describe what you're about to write.
- Every `{speed=…}` must be closed. Every `<break>` must be self-closed with `/>`. Every `[…]` must be a known sound.

---

### User description

The user wants a meditation about:

```
[REPLACE THIS LINE WITH YOUR THEME, MOOD, DURATION, OR ANY OTHER GUIDANCE]
```

Now write the meditation.

## --- PROMPT END ---

---

## Notes for humans

- This prompt assumes the v1 sound catalog (one sound: Tibetan Singing Bowl). When more sounds are added to `sound_files`, update the **Available sounds** section above with each new canonical name.
- The script-mode parser is implemented in `shared-types/src/scriptParser.ts` — if you change the syntax, update this prompt at the same time.
- If an LLM repeatedly emits malformed tokens, the most common offenders are: forgetting the `s` in `<break time="…s" />`, forgetting the `/>` self-close, and inventing sounds that don't exist. Adding an explicit "do not invent sounds" line in the user description block usually fixes it.
