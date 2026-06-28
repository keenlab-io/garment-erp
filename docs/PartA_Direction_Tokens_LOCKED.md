# Frontend Design — Critique & Lock Pass: Part A (Direction + Tokens)
### ERP M1–M6 · supersedes the *proposed* A4/A5 · v1.0-locked

> This is a critique-and-lock of the **proposed** Part A, not a rebuild. Each decision is tagged, the generic defaults are revised, one signature is added, the display face is pushed, and a dark semantic mapping is introduced. Output is the locked token system — no implementation.

**Verdict legend**
- 🟢 **KEEP — brief-specific.** A real choice for *this* manufacturer; survives.
- 🔵 **KEEP — correct default.** Generic to enterprise ERPs, but load-bearing and right; revising it would be change for its own sake.
- 🟠 **REVISE — generic default.** What I'd produce for *any* B2B admin tool. Re-anchored in the subject's world (custom textile printing: ink, substrate, the press, the routing traveler, the swatch book).

The test applied throughout (per the skill): *would I arrive here for any similar prompt?* If yes, it's a default.

---

## 1. Direction critique (A4)

| # | Proposed decision | Verdict | Action |
|---|---|---|---|
| Personality | "calm · precise · industrial-trustworthy" | 🟢 KEEP | The adjectives are right for a factory-and-finance tool. |
| Reference anchor | "between Linear and Stripe + shop-floor pragmatism" | 🟠 REVISE | This is the reference stack *every* B2B designer cites. Re-anchor in the subject's own artifacts (below). The adjectives stay; the mood board changes. |
| P1 Numbers are the hero | | 🔵 KEEP | Correct for a stock+finance system. Category default, but load-bearing. |
| P2 Status is a first-class visual language | | 🟢 KEEP → **promote to signature** | This was the strongest latent idea in the proposal and was under-spent as "a token group." It becomes the signature (§3). |
| P3 Three densities, one system | | 🟢 KEEP → **name as interaction-signature** | The desktop / floor-tablet / mobile tri-context is genuinely *this* brief, not a default. It's the thing that makes the product work; named explicitly in §3. |
| P4 Guard the irreversible | | 🔵 KEEP | Right for any tool with void/delete/payroll. Category default, keep. |
| P5 Progressive disclosure | | 🔵 KEEP | Universal. Keep. |
| P6 Bilingual by construction (Thai-first) | | 🟢 KEEP | Specific and hard-won. Drives the type and line-height locks. |
| Motion (150–250ms, purposeful) | | 🔵 KEEP | Sane default; keep. |
| Tone of voice | | 🟢 KEEP | The "state the consequence" microcopy rule is right and subject-aware. |

**Re-anchored reference (replaces "between Linear and Stripe"):** the product's mood comes from a **print shop's quality bench** — the Pantone/ink **swatch book**, the **routing traveler card** that rides each job through the line, **ink on substrate**, and the calm precision of a **calibrated press**. Linear/Stripe remain *engineering* references for table density and number legibility, but they no longer set the *look*. The look is ink-and-substrate.

> Net: A4 is mostly sound. One genuine miss — it never named a signature, and it diluted its best idea (status) into a token list. Fixed in §3.

---

## 2. Token critique (A5)

| Token group | Proposed | Verdict | Action |
|---|---|---|---|
| A5.1/5.2 **Palette** — navy `#1F3864` + cold slate + blue accent | | 🟠 **REVISE** | This is *the* enterprise-admin default — I'd ship it for a bank, a CRM, a logistics tool. Re-grounded as **"Ink & Substrate"** (§5): warm carbon-ink chrome, warm paper surfaces, a press-cyan accent, and a process-magenta spot. |
| A5.3 **Production-status set** (color + dot-shape + label) | | 🟢 KEEP the *rules*, 🟠 REVISE the *rendering* | "Never color-alone" + glyph + label is brief-correct and stays. The rendering is promoted into the **Ink-Chip signature** (§3) — conventional hues tuned to read as mixed ink. |
| A5.4 **Body/mono** (IBM Plex Sans Thai / Plex Mono) | | 🟢 KEEP | Excellent Thai+Latin coverage, tabular numerals, neutral where neutrality belongs (data). Stays. |
| A5.4 **Display** (also Plex / Noto / Sarabun) | | 🟠 REVISE | The display face was "a neutral delivery vehicle" — exactly the trap. Pushed to **Bai Jamjuree** (§4): engineered, slightly mechanical character that suits a precision manufacturer, used with restraint. |
| A5.4 **Thai line-height notes** (≥1.6, no justify, no letter-spacing) | | 🟢 KEEP | Specific, correct, non-obvious. Stays verbatim. |
| A5.5 **Spacing** (4px base) | | 🔵 KEEP | Universal, correct. |
| A5.5 **Radius** (md=8 default) | | 🟠 REVISE (minor) | 8px is the friendly-SaaS default. Tightened to **6px** controls / **3px** chips for an engineered, precise feel consistent with a press. |
| A5.5 **Elevation** (navy-tinted shadows) | | 🟠 REVISE (minor) | Shadow tint was navy `rgba(16,29,52,…)`. Re-tinted to **ink** `rgba(20,17,13,…)` so shadows belong to the new neutral. Low-spread intent kept. |
| A5.6 **Density tokens** (Comfortable/Compact/Touch) | | 🟢 KEEP | Core to the tri-context brief; the interaction-signature. Unchanged. |
| A5.7 **Breakpoints / z-index / motion** | | 🔵 KEEP | Standard, correct. |

> Net: three real defaults to revise — the **palette** (big), the **display face** (medium), and **radius/shadow tint** (small) — plus the missing **signature**. Everything else is either brief-specific or a correct category default.

---

## 3. The signature (the proposal's missing piece)

The proposal admitted it had no signature and guessed it'd be the status-language or the density system. **Both are real; they do different jobs, so I lock both — one *seen*, one *felt*.**

### 3a. Visual signature — **the Ink-Chip status language** ("the swatch library")
**What it is.** Every status in the product — a production step, stock health, a document's lifecycle, a payroll flag, an alert — renders as an **ink chip**: a small solid swatch of a *named status ink*, carrying its glyph and label, styled like the spec chips a print shop matches color against.

**Why this brief (not any ERP).** A custom-print manufacturer's entire craft is *reproducing exact colors*; the ink chip / swatch book is their native artifact and their language of quality. The product's single most-repeated element is status — it's on every screen of every module. Making that element literally a chip library turns the most-seen UI into something unmistakably *this* company's. It also operationalizes two existing brief requirements at once: "never color-alone" (glyph+label live on the chip) and across-the-room glanceability on the floor (the M4 tiles are just big chips).

**The through-line (one language, six modules):** M3 stock-health chips · M4 production-status chips (floor tiles = oversized chips) · M5 document-lifecycle chips · M6 alert chips · M2 payroll-flag chips · M1 audit-action chips. Same chip, everywhere — that repetition *is* the brand.

**The spot move.** Process **magenta** is reserved as the chip's **active / "currently matched"** state (selected, needs-attention) — echoing a spot color pulled on press. Because magenta appears *only* here and on the brand mark and one hero CTA per screen, it stays meaningful, never decorative. (Chanel rule: the chips are where the ink palette goes vivid; all chrome stays ink-and-substrate quiet.)

**Restraint guardrails.** Chips are clean solid swatches with a refined, spec-card feel — *not* skeuomorphic "wet ink" edges (that reads gimmicky / AI-generated). The boldness is in the *idea and ubiquity*, not in effects.

### 3b. Interaction signature — **the three-density system**
Kept and named. It's *felt*, not *seen*: the same components reflow Comfortable → Compact → Touch so one system serves the accountant's dense table and the gloved operator's wall tablet without forking. This is the brief's genuine structural risk and it's locked as-is (A5.6).

> Why status over density as the *visual* signature: density is invisible until you switch context; it can't be what the product is "remembered by" on first sight. The ink chips are the memorable look. So: **chips = the signature you see; density = the signature that makes it work.**

---

## 4. Typography lock

**Pairing:** characterful display, neutral body, utility mono — all Thai+Latin.

```
--font-display  "Bai Jamjuree", "IBM Plex Sans Thai", sans-serif   # NEW — restraint-only
--font-sans     "IBM Plex Sans Thai", "Noto Sans Thai", "Sarabun", system-ui, sans-serif
--font-mono     "IBM Plex Mono", "Sarabun", ui-monospace, monospace
--font-numeric  var(--font-sans) + font-variant-numeric: tabular-nums   # all money/qty
```

**Why Bai Jamjuree (Cadson Demak, OFL).** It has an engineered, faintly mechanical, squared character — it looks *made to spec*, which is the right voice for a precision manufacturer — while carrying full Thai + Latin and multiple weights. It is neither the generic "neutral Plex/Inter everywhere" default nor the AI-cliché "high-contrast serif display." Used **with restraint**: page/section titles, eyebrows, document-type names (`ใบเสนอราคา / Quotation`), the dashboard greeting, login, and empty-state headlines. **Never** body, table cells, or form labels — those stay Plex Sans Thai for calm legibility.

**Numerals.** KPI/display numbers stay in `--font-numeric` (Plex, tabular) for guaranteed column alignment, *not* the display face — legibility of money beats character. Display type carries personality through *words*, the data stays neutral.

**Trade-off named:** a more aggressive industrial display (condensed grotesques like Saira) would push character further but collapses Thai coverage and breaks bilingual cohesion — disqualified. Bai Jamjuree is the most characterful face that keeps one voice across both scripts.

**Type scale (unchanged from A5.4 except family routing):** display sizes route to `--font-display`; everything else to `--font-sans`. Thai line-height locks (≥1.6 body, no justify, no letter-spacing on Thai) carry over verbatim.

---

## 5. Locked token system — LIGHT

Semantic names are what components consume; primitives are never used directly. Hex values are locked; contrast intent noted (verify exact ratios in build).

### 5.1 Primitives — "Ink & Substrate"
```
# SUBSTRATE — warm paper surfaces (replaces cold slate)
--substrate-0   #FFFFFF   # true paper / document
--substrate-50  #FAF8F4   # app canvas (warm off-white)
--substrate-100 #F2EEE7   # sunken / wells
--substrate-200 #E7E1D7

# INK — warm carbon neutral (replaces navy + slate; this is text AND chrome)
--ink-50  #F4EFE7   --ink-100 #EAE3D8   --ink-200 #D8CFC2   --ink-300 #BBB0A2
--ink-400 #938678   --ink-500 #6B5F52   --ink-600 #4A4036   --ink-700 #322A21
--ink-800 #211C16   --ink-900 #14110D   # ink-900 = chrome (sidebar/topbar), near-black warm

# PRESS CYAN — accent (calm, trustworthy, printerly; replaces SaaS navy-blue)
--cyan-400 #3FB4CC  --cyan-500 #109FBD  --cyan-600 #0B859E  --cyan-700 #0A6E83  --cyan-800 #084F5E

# PROCESS MAGENTA — the signature spot (rare, meaningful)
--magenta-400 #E0408F  --magenta-500 #C61A78  --magenta-600 #A8155F

# STATUS INKS — conventional hues, ink-tuned (rubine red is a real press red)
--green-500 #2E7D52  --green-50 #E7F2EB  --green-700 #1C5436     # go / success / completed
--amber-500 #B5781B  --amber-50 #FBF1DF  --amber-700 #6F4A0F     # caution / warning / hold
--rubine-500 #C23341 --rubine-50 #FBE9EB --rubine-700 #7E2530    # stop / danger / delayed / overdue
--violet-500 #6B4FB0 --violet-50 #EEEAF7 --violet-700 #43317A    # subcontracted / external
# info reuses Press Cyan
```

### 5.2 Semantic roles (LIGHT)
```
# Brand / interactive
--color-brand              ink-900       # identity, sidebar/topbar chrome (was navy)
--color-accent             cyan-700      # primary action fill, focus (white text ≈ AA)
--color-accent-hover       cyan-800
--color-accent-text        cyan-700      # links on light
--color-accent-bright      cyan-500      # focus ring / on-dark accents
--color-spot               magenta-500   # SIGNATURE: brand mark, active chip, single hero CTA
--color-accent-subtle      ink-50        # selected-row tint (warm, not blue)

# Surfaces — elevation by lightness + warmth
--color-bg-app             substrate-50
--color-bg-surface         substrate-0
--color-bg-surface-raised  substrate-0 + --elevation-md
--color-bg-sunken          substrate-100
--color-bg-paper           substrate-0   # document/PDF preview — pure white, always

# Text
--color-text-primary       ink-800       # ≈14:1 on canvas
--color-text-secondary     ink-600       # ≈7:1
--color-text-muted         ink-500       # ≈5:1 (non-essential only)
--color-text-inverse       substrate-50
--color-text-link          cyan-700

# Lines
--color-border             ink-200
--color-border-strong      ink-300
--color-border-focus       cyan-500

# Semantic (each: solid / subtle-bg / text-on-subtle)
--color-success / -subtle / -on    green-500  / green-50  / green-700
--color-warning / -subtle / -on    amber-500  / amber-50  / amber-700
--color-danger  / -subtle / -on    rubine-500 / rubine-50 / rubine-700
--color-info    / -subtle / -on    cyan-600   / #E5F2F5   / cyan-700
```

### 5.3 Ink-Chip status set (SIGNATURE — shared token group)
Each chip = solid swatch + glyph + label. Active state = `--color-spot` ring/fill.
```
--chip-pending       ink-300     glyph ○      label Pending
--chip-in-progress   cyan-600    glyph ◐      label In Progress
--chip-completed     green-500   glyph ●✓     label Completed
--chip-delayed       rubine-500  glyph ▲      label Delayed
--chip-hold          amber-500   glyph ❙❙     label On Hold
--chip-outsourced    violet-500  glyph ↗      label Subcontracted
--chip-active-state  magenta-500              # selected / needs-match (the spot)
# Document lifecycle & stock health reuse semantic roles:
#   Draft=text-muted · Issued/Approved=info · Paid/Posted=success
#   Overdue/Low=danger · Partial/Near-min=warning · Void=muted + str-through
```

### 5.4 Typography, radius, elevation, density (locked)
```
--font-display "Bai Jamjuree", "IBM Plex Sans Thai", sans-serif   # restraint-only
--font-sans    "IBM Plex Sans Thai","Noto Sans Thai","Sarabun",system-ui,sans-serif
--font-mono    "IBM Plex Mono","Sarabun",ui-monospace,monospace
--font-numeric var(--font-sans) tabular-nums
# scale & Thai leading: per A5.4 (≥1.6 body, no justify/letter-spacing on Thai)

--radius-sm 3  --radius-md 6  --radius-lg 10  --radius-full 9999   # tightened (engineered)
(control=md · card=lg · chip=sm · pill/badge=full)

--elevation-sm 0 1px 2px rgba(20,17,13,.06)        # ink-tinted (was navy)
--elevation-md 0 2px 8px rgba(20,17,13,.08)
--elevation-lg 0 8px 24px rgba(20,17,13,.12)
--elevation-none none

# density (UNCHANGED — interaction signature)
                  Comfortable  Compact  Touch
--density-row-h      40         32       64
--density-control-h  36         30       56
--density-font       14         13       18
--density-pad-x      16         12       20
--density-tap-min    36         32       56
--density-icon       18         16       28

--bp-sm 360 --bp-md 768 --bp-lg 1024 --bp-xl 1440
--z-base 0 --z-sticky 100 --z-drawer 200 --z-overlay 300 --z-modal 400 --z-toast 500 --z-command 600
--motion-fast 150ms --motion-base 200ms --motion-slow 300ms
--ease-standard cubic-bezier(.2,0,0,1)   (collapse on prefers-reduced-motion)
```

---

## 6. Locked token system — DARK (semantic mapping)

Only the **semantic layer remaps** — components, primitives, and the chip system stay; they just resolve to dark values. Elevation in dark is carried by **lighter surfaces + borders**, not shadow (shadows are weak on dark). Status inks shift to **lighter, slightly-desaturated** variants to hold AA on dark.

```
# Brand / interactive (DARK)
--color-brand              ink-900        # chrome stays deep ink (canvas IS near-black)
--color-accent             cyan-500       # lifts for contrast on dark
--color-accent-hover       cyan-400
--color-accent-text        cyan-400
--color-accent-bright      cyan-400
--color-spot               magenta-400    # signature spot, lifted
--color-accent-subtle      #20303A        # cyan-tinted dark selection tint

# Surfaces — elevation by LIGHTNESS (raised = lighter)
--color-bg-app             ink-900  #14110D
--color-bg-surface         ink-800  #211C16
--color-bg-surface-raised  ink-700  #322A21
--color-bg-sunken          #0E0C09
--color-bg-paper           substrate-0 #FFFFFF   # LOCKED: documents are white even in dark mode
                           # (rendered inside a dimming frame to avoid glare; fidelity > theme)

# Text (DARK)
--color-text-primary       substrate-50 #FAF8F4   # ≈15:1 on canvas
--color-text-secondary     ink-200 #D8CFC2
--color-text-muted         ink-400 #938678
--color-text-inverse       ink-900
--color-text-link          cyan-400

# Lines (DARK)
--color-border             ink-700 #322A21
--color-border-strong      ink-600 #4A4036
--color-border-focus       cyan-400

# Semantic — lifted solids + dark-tint subtle bg + light text-on (DARK)
--color-success / -subtle / -on   #4FA876 / #16241C / #BFE6CC
--color-warning / -subtle / -on   #D69A3C / #2A2110 / #F1DCAE
--color-danger  / -subtle / -on   #E0697A / #2A1518 / #F6C9CF
--color-info    / -subtle / -on   #3FB4CC / #0E2329 / #BCE4ED

# Ink-Chip status (DARK) — lifted swatch hues, same glyphs/labels
--chip-pending     ink-500   --chip-in-progress #3FB4CC  --chip-completed #4FA876
--chip-delayed     #E0697A   --chip-hold        #D69A3C  --chip-outsourced #9277D0
--chip-active-state magenta-400
```
**Dark-mode notes (locked decisions):**
1. **Paper stays white.** An invoice prints on white stock; a dark "paper" would misrepresent the export. The document/PDF surface ignores the theme and renders on `--color-bg-paper #FFFFFF`, framed by a dimmed bezel so it doesn't glare. This is a brief-specific call, not a default.
2. **Status hues desaturate ~10–15%** going dark; the saturated light-mode reds/greens vibrate on near-black. The chip glyph+label rule means meaning never depends on the hue shift.
3. **No new component work for dark** — theme is a token swap; the chip signature, density, and type are theme-invariant.

---

## 7. What changed vs the proposed Part A

| Area | Proposed | Locked | Why |
|---|---|---|---|
| Palette | Navy + cold slate + blue | **Ink & Substrate** (carbon ink chrome · warm paper · press-cyan accent · magenta spot) | Navy/slate is the universal admin default; ink-on-substrate is the print shop's own world. |
| Signature | *(none — admitted)* | **Ink-Chip status language** (visual) + **three-density system** (interaction) | Every design needs one memorable element; status was the strongest latent idea and is on every screen. |
| Display face | Plex/Noto/Sarabun (neutral) | **Bai Jamjuree**, restraint-only | A neutral display face is a delivery vehicle, not a choice; Bai Jamjuree reads "made to spec." |
| Accent | `#2E75B6` blue | **Press cyan** `cyan-700`, with **magenta** as rare spot | Re-grounds the accent in process ink; magenta gives one ownable, meaningful highlight. |
| Radius | 8px default | **6px / 3px** | Tighter = engineered/precise, matches a calibrated press. |
| Shadow tint | navy `rgba(16,29,52)` | **ink** `rgba(20,17,13)` | Shadows should belong to the neutral. |
| Dark mode | *(absent)* | **Full semantic remap** + paper-stays-white | Requested; locked as a token swap only. |
| Kept as-is | density system · Thai leading rules · status-never-color-alone · spacing · breakpoints · numbers-as-hero · guard-the-irreversible | — | Brief-specific or load-bearing correct defaults — revising them would be noise. |

**One flagged divergence for your veto:** the palette lock intentionally retires the navy brand carried over from the original Word document. Navy was itself a default, and the brief explicitly asked to pressure-test it — but if there's an external brand reason to keep navy chrome, the cleanest compromise is *navy chrome + the Ink-Chip signature + press-cyan/magenta inks*, which preserves the signature while honoring an existing mark. Say the word and I'll relock §5.2 around navy.

---

*End of critique-and-lock. Locked artifacts: §3 signature · §4 type · §5 light tokens · §6 dark tokens. No implementation produced, per request. Next step when ready: hand §3–§6 to a build pass to emit the token layer + app shell + the Ink-Chip component.*
