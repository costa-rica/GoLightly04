# CPO Onboarding — Go Lightly

**Prepared:** 2026-04-28
**Sources:** `docs/20260422nickDescription.md`, `docs/requirements/20260421_GOLIGHTLY04_PLAN.md`, `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V04_CLAUDE.md`, `README.md`, founder conversation 2026-04-28.

---

## 1. One-paragraph summary

Go Lightly is a web platform that lets users compose and generate custom meditation audio by sequencing text-to-speech narration, prerecorded ambient sounds, and silence pauses into a final MP3. It is built for two audiences: individual meditators who find mainstream apps too guidance-heavy, and practitioners (coaches, therapists, gurus) who want to publish meditations for their clients or followers. The core bet is that a meaningful segment of the meditation market wants authorship and silence control — not curated content — and will pay for a tool that gives them that. The platform is live at [go-lightly.love](https://go-lightly.love) and is in its pre-revenue phase.

---

## 2. The problem

Mainstream meditation apps (Calm, Headspace, YouTube playlists) are content libraries, not creation tools. They offer pre-scripted guidance with fixed pacing that the user cannot alter. Users who want to focus on a personal affirmation, insert longer silence, or cue themselves with a Tibetan bowl at a specific moment have no good option. They must use a general audio editor (high friction, not purpose-built) or accept whatever a content creator produced. Practitioners who guide others face the same wall: the tools to create lightly-guided, custom-paced meditations either don't exist or are too technical. (Source: founder's stated experience and motivation, `docs/20260422nickDescription.md`.)

---

## 3. The customer or user

**Segment A — Individual meditators**
Experienced meditators who have a personal practice and know what they want from a session: a specific affirmation, a preferred silence length, a Tibetan bell as a time marker. They already use apps like Calm or Headspace but find them too prescriptive. They want a tool, not content. Size and validation of this segment beyond the founder's experience is not yet established.

**Segment B — Practitioners**
Coaches, therapists, and meditation guides who create content for clients or communities. They need a way to produce audio that is personalized and repeatable without recording studio overhead. This segment has a built-in distribution multiplier: one practitioner who adopts Go Lightly may bring followers with them. This segment was identified by the founder as a target; no customer interviews exist yet.

---

## 4. Value proposition

Today, meditators who want a custom, lightly-guided experience must either accept what an app gives them or spend hours in audio software. Go Lightly lets them compose a meditation in minutes — type an affirmation, set a silence, drop in a Tibetan bowl — and get a finished MP3 they can replay. For practitioners, it replaces ad-hoc recording setups with a structured, repeatable creation tool.

Template form: *Today users either accept over-guided app content or build audio manually with no purpose-built tools; Go Lightly lets them compose and generate a personalized meditation in minutes, with silence and sound exactly where they want it.*

---

## 5. Strategic bets and assumptions

- **Bet 1 — The silence preference is shared.** The founder experiences existing apps as too guidance-heavy. We are betting this is a real, addressable segment and not a minority preference. We do not yet have external validation. (Stated by founder in conversation, 2026-04-28.)
- **Bet 2 — Practitioners are a meaningful acquisition channel.** A practitioner who publishes meditations on Go Lightly may bring their audience. This network effect is assumed but untested. (Stated by founder in conversation, 2026-04-28.)
- **Bet 3 — TTS quality is good enough.** ElevenLabs-generated narration must feel appropriate for meditation — calm, natural, not robotic. If users find AI voice jarring in a meditative context, the core creation loop breaks.
- **Bet 4 — ElevenLabs cost scales acceptably.** Current API allocation is unknown at volume. If per-meditation TTS cost is high, the $2–$6/month price point may not cover variable costs. This is the founder's stated primary financial risk. (Conversation, 2026-04-28.)
- **Bet 5 — Content marketing is a sufficient acquisition channel.** The growth plan relies on blog, Medium, Reddit, and short-form video. This requires consistent execution with no paid budget — a significant operational bet for a solo founder.

---

## 6. Success criteria

**Near term (0–6 months)**
- Stripe integration live; paywall enforced.
- First paying user acquired.
- ElevenLabs cost-per-meditation benchmarked at realistic usage volumes.

**Medium term (6–18 months)**
- 100 active users (free + paid).
- Unit economics understood: cost per meditation generated vs. revenue per user.
- Content marketing engine started (blog live, at least one external channel active).

**Long term**
- 1,000 users. No specific timeline committed. (Stated by founder, 2026-04-28.)
- AI meditation assistant feature shipped and contributing to revenue.

**Single metric that matters right now:** first paying user. Until money changes hands, all other metrics are directional.

---

## 7. Business model

Pre-revenue as of 2026-04-28. No Stripe integration exists; any user can sign up for free.

**Intended model (from `docs/20260422nickDescription.md` and founder conversation):**

| Tier | Price | Access |
|---|---|---|
| Free | $0 | Listen to public meditations; limited meditation creation |
| Lifetime | $30 | 200 spots only; full creation access permanently |
| Monthly — Create | $2/month | Unlimited meditation creation |
| Monthly — Private | $2/month | Private (non-public) meditations |
| Monthly — AI | $2/month | AI-assisted meditation generation |

The monthly tiers are additive; a fully subscribed user pays $6/month. **Note: this pricing model is explicitly under discussion and not finalized.** (Founder, conversation 2026-04-28.)

Key open question: whether ElevenLabs API costs fit inside the $2–$6/month margin at any realistic usage level. This has not been modeled.

---

## 8. Stakeholders and partners

- **Founder / owner:** sole decision-maker. Solo founder; open to expanding team or bringing on partners in the future, but no current plans. (Conversation, 2026-04-28.)
- **ElevenLabs:** critical external dependency. All text-to-speech generation routes through ElevenLabs. A pricing change, API deprecation, or quality shift from this vendor would require significant product rework.
- **Future users:** no advisory users, beta testers, or design partners identified yet.
- **No investors, partners, or regulators** identified at this stage.

---

## 9. Competitive landscape

**Free meditation apps (primary competition)**
Apps like Insight Timer and YouTube content offer free, high-quality guided meditations at scale. They win on content breadth and zero cost. Go Lightly does not compete on content — it competes on authorship. Users who want to consume someone else's meditation have no reason to use Go Lightly; users who want to create their own do. (Founder identified free apps as primary competitive threat, conversation 2026-04-28.)

**Calm / Headspace (adjacent, not direct)**
Higher-priced, content-library model. Users who pay for these are buying curation and production quality, not a creation tool. Unlikely to be head-to-head competition. (Founder assessment, conversation 2026-04-28.)

**Positioning risk:** The creation-tool framing requires users to know what they want and be willing to build it. This limits addressable market to meditators with an established practice or practitioners with a professional use case. The mass market — people who want to start meditating — is not the target, and nothing in the current product serves them.

**Gap:** No formal competitive analysis of niche TTS-meditation tools or DAW-lite audio tools was conducted. This is an open unknown.

---

## 10. Status and roadmap

**Current state (2026-04-28)**
- Platform is deployed and publicly accessible at [go-lightly.love](https://go-lightly.love) and [api.go-lightly.love](https://api.go-lightly.love).
- Full creation loop is functional: users can compose, generate, and play back meditations.
- No paywall; all features are free.
- No confirmed active users beyond the founder.

**Next milestone**
Stripe integration and paywall enforcement. This is the prerequisite for any revenue and for testing whether users will pay.

**Subsequent priorities (stated by founder)**
1. Paywall live
2. Blog content attached to go-lightly.love
3. External content marketing (Medium, Reddit, forums)
4. Video content (YouTube, TikTok, Instagram)
5. AI meditation assistant feature (increases variable cost; scope and timeline not defined)

**Sequencing risk:** The marketing plan has not started. There is no blog, no external presence, and no content pipeline. This is not unusual at this stage, but it means user acquisition is entirely future work.

---

## 11. Open risks and unknowns

- **ElevenLabs cost at scale.** The founder's stated primary financial risk. No cost-per-meditation figure has been benchmarked. This must be modeled before the paywall goes live, or pricing will be set blind. (Conversation, 2026-04-28.)
- **No external user validation.** The product is built from the founder's personal pain. The assumption that others share it has not been tested through interviews, surveys, or beta users.
- **Solo founder execution risk.** The roadmap includes product (Stripe, AI agent), content marketing across multiple channels, and community building — all on one person. Scope and priority discipline will be critical.
- **TTS voice quality in context.** AI-generated voices may not feel meditative to users. This is a product risk that can only be assessed through user testing.
- **Practitioner acquisition is unvalidated.** The "bring your audience" hypothesis for coaches and therapists has not been tested. If practitioners don't adopt, the network-effect multiplier doesn't exist.
- **Pricing model is unsettled.** The $2/month stacking model is explicitly under discussion. Until it's locked, revenue modeling is speculative.
- **No retention mechanism identified.** The platform creates meditations; there is no social layer, discovery feed, or follower system described that would bring users back repeatedly.

---

## 12. Open questions for the project owner

- What is the cost of a single average meditation generation via ElevenLabs today? At what user volume does that become a margin problem?
- Have any non-founder users created a meditation? What was the drop-off point in the creation flow?
- Is the free tier intended to be a permanent conversion funnel, or will it eventually be limited to drive upgrades?
- How will practitioners discover Go Lightly before the content marketing engine exists? Is there a direct outreach plan?
- What does a "private meditation" mean for practitioners — is there a client-sharing or access-control feature planned, or just preventing public listing?
- At what point does the solo-founder constraint become the binding constraint on growth? Is there a trigger (e.g., revenue threshold, user count) at which you'd seek help?
- Is the AI meditation assistant a feature of the existing platform or a meaningfully different product? Who is it for — individual users, practitioners, or both?
