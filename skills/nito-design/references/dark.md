# On dark

Apple's own pages are light with dark *sections*. A site that is dark all the
way through is a different problem, and most of what goes wrong is not taste —
it is that four of the system's habits invert and one of them silently breaks.

## The surfaces

Apple's dark values, measured:

```
--surface        #000       pure black, not a dark grey
--surface-alt    #1d1d1f    the near neighbour
--ink            #f5f5f7    primary
--ink-secondary  #a1a1a6
--ink-muted      #86868b    supporting copy on dark
```

Pure black is deliberate. Apple's dark moments are full-bleed and usually carry
a product shot with its own black background, so any grey would show the seam.
A dark *site*, as opposed to a dark section, usually wants a near-black with a
little warmth or coolness in it — `#0b0f12`, `#14110e` — because a full page of
`#000` with no photography on it reads as a void rather than a choice. Either
way the rule that transfers is the **size of the step**: the alt surface is a
near neighbour of the base, never a second theme. Apple's own pairs compute to
1.09:1 on light (`#fff` / `#f5f5f7`) and 1.25:1 on dark (`#000` / `#1d1d1f`).
Keeping the step small is this skill's preference, not a published threshold;
`test/conformance.mjs` accepts anything between 1.015:1 and 1.25:1.

## Alpha ink is a trap on dark

`rgba(255,255,255,0.6)` looks like one ink step. It is not — it is a step
*relative to whatever is behind it*, and it multiplies when nested:

```html
<div class="text-white/60">            <!-- 60% -->
  <span class="text-white/60">…</span> <!-- still 60%: colour does not inherit multiplicatively -->
</div>

<div style="opacity: 0.6">             <!-- but THIS does -->
  <span style="opacity: 0.6">…</span>  <!-- 36% of the original -->
</div>
```

The first is safe, the second is the bug. Any component that fades itself in
with `opacity` and contains text already set at 60% ships that text at 36%,
which is below AA and invisible on a phone outdoors. Reveal animations are
where this lands: a section fades in at `opacity: 0 -> 1`, and during the
transition every ink step in it is wrong. That is fine for 400ms; it is not
fine if the reveal never completes because the observer never fired.

Prefer resolving the three ink steps to **solid colours** on dark, or to
`color-mix(in srgb, var(--ink) 66%, var(--surface))`. They then behave like
paint instead of like glass, they survive nesting, and the audit can check
their contrast honestly.

## Contrast inverts, and so does the comfortable maximum

On light, you push body text toward maximum contrast — `#1d1d1f` on `#fff` is
16.83:1 and it reads beautifully.

On dark, Apple steps long copy down instead. Pure `#fff` on `#000` is 21:1;
Apple's supporting copy on its black sections is `#86868b`, 5.80:1, and its
headlines take `#f5f5f7` (19.29:1), not `#fff`.

The floor is the rule — 4.5:1 for body, 3:1 for large text (WCAG 2.2 SC 1.4.3),
and Apple's Dark Mode guidance asks for 4.5:1 at minimum and to strive for 7:1.
Stepping long copy below maximum contrast on dark is a **style choice, not a
requirement**: no published contrast ceiling exists, and the research found no
verified general-population evidence against pure white on pure black. Do it
for the look if the design wants it; never trade the floor for it.

## Elevation stops working

A shadow on a dark surface does nothing — there is nothing darker to cast onto.
Everything that used a shadow to say "this is above that" needs another signal:

```css
/* light: elevation by shadow */
.card { background: #fff; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); }

/* dark: elevation by surface step plus a hairline */
.card { background: var(--surface-alt); border: 1px solid rgb(245 245 247 / 0.10); }
```

The hairline carries most of it. `rgb(255 255 255 / 0.10)` on dark is the
visual equivalent of `rgb(0 0 0 / 0.08)` on light. Going past about 0.16 turns
a hairline into a drawn box, which is the thing Apple avoids — it separates by
surface and spacing, not by outlines.

Glows are the dark-site equivalent of shadows and they are fine, but they
belong to the decoration layer: behind the content, blurred past recognition,
never crossing the copy column.

## The accent moves

A hue that passes on white can fail on black, and the reverse. Apple's own two
blues, computed with the WCAG formula:

| | on `#fff` | on `#000` |
|---|---|---|
| `#06c` — the link blue on light | **5.57:1** | 3.77:1 |
| `#2997ff` — the blue it uses on dark | 3.02:1 | **6.96:1** |

`#06c` passes AA for text on white and fails it on black. `#2997ff` is the
reverse: it fails AA for small text on white. Neither is a worse colour than
the other; they are the same decision made for two different backgrounds.

Give the accent two values and switch them with the surface:

```css
:root            { --accent: #0071e3; --on-accent: #fff; }
:root[data-dark] { --accent: #2997ff; --on-accent: #00172e; }
```

`#0071e3` is the exception that proves the point — 4.70:1 on white and 4.47:1
on black (a hair under AA for small text there, fine as a button fill), which is why it is the one Apple uses for buttons that appear on both.
A mid-luminance accent survives either background; anything near the ends of
the range needs a pair.

Then check `--on-accent` both ways. A light accent needs **dark** text on it:
white on a teal like `#2dd4bf` is 1.9:1 and unreadable, black on it is 11.3:1.
This is the step people skip, and the audit catches it as a contrast failure on
the primary button.

## Images and video need art direction, not just a filter

A bright photograph dropped on a black page is a hole punched in the page. The
fixes, in order of how well they work:

1. Shoot or select with a dark background in the first place — this is what
   Apple does, and it is why its product shots sit on black so cleanly.
2. A gradient scrim from the surface colour into the image edge, so the frame
   dissolves instead of ending.
3. A rounded container at `--radius-card`, which turns the hole into an object.

What does not work: lowering the image's opacity, or a global `filter:
brightness(0.8)`. Both make the photograph worse to read while still leaving
the luminance mismatch.

### A clip has one extra failure here

A `<video>` paints nothing until its first frame decodes, so the handover from
the still to the clip shows whatever is behind the stack for a frame or two. On
a light page that is a white flash; on a dark one it is a black hole in the
middle of a bright photograph. **Give the stack the surface colour it sits on**
and the handover becomes invisible either way:

```css
.media-stack { background: var(--surface); }   /* --surface-alt in a dark band */
```

The other two are the same rules as above, applied to things that are easy to
forget are images:

- **The start frame gets the same art direction as any photograph on dark.**
  It is the image most visitors see for longest — it is what ships under
  `prefers-reduced-motion`, and under a failed load — so a bright frame 0 over
  a black page is the hole punched in the page, not a loading state.
- **The still and frame 0 of the clip have to be the same frame.** If the still
  was exported from a different grade or a different take, the swap flashes.
  Export it from the encoded file (`ffmpeg -i large.mp4 -frames:v 1`), never
  from the master.

There is no bitrate surcharge for dark footage — measured, the median cost per
pixel is slightly *lower* than for bright footage, because what h264 pays for
is texture and motion. See the table in `references/media.md`.

## What stays the same

The type scale, the tracking table, the em rhythm, the section padding ladder,
the easing curves, the breakpoints and the parallax technique are all unchanged
on dark. Only colour behaviour inverts. If a dark site feels wrong after a
pass, the problem is nearly always in this file, not in the spacing.
