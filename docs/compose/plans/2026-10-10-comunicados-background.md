# Comunicados Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light, transparent decorative background (books, letters, pens) to the Comunicados page feed area.

**Architecture:** A single absolutely-positioned decorative layer inside the Comunicados page container, behind the feed content. Inline SVG icons at low opacity; `pointer-events-none` so interaction is unaffected. No new image assets.

**Tech Stack:** React 19, Tailwind CSS 4, inline SVG

## Global Constraints

- Decorative layer must not block clicks (`pointer-events-none`)
- Opacity stays very low (~0.06–0.09) so text/cards remain fully readable
- Works in light and dark mode (use currentColor / soft emerald-slate tokens)
- No new external image files
- Feed content must stay above the decoration (z-index)

---

### Task 1: Decorative SVG background layer in Comunicados

**Files:**
- Modify: `src/pages/Comunicados.jsx` (return block around line 1275)

**Interfaces:**
- Consumes: none
- Produces: visual-only; no API change

- [ ] **Step 1: Add the decorative layer wrapper inside `MainLayout` content**

Locate the return of `Comunicados` (around line 1275):

```jsx
return (
  <MainLayout title="Comunicados">
    <div className="space-y-4 pb-24">
```

Replace that opening with a relatively-positioned wrapper and the decorative SVG layer, keeping the existing content as the upper layer:

```jsx
return (
  <MainLayout title="Comunicados">
    <div className="relative space-y-4 pb-24">
      <ComunicadosBackdrop />
```

- [ ] **Step 2: Define `ComunicadosBackdrop` component**

Add this component near the top of the same file (after the existing small helpers, before `export default function Comunicados`):

```jsx
function ComunicadosBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-[0.07] dark:opacity-[0.1]"
    >
      <svg
        className="h-full w-full text-emerald-900 dark:text-emerald-200"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {/* book closed */}
        <g transform="translate(80 120) rotate(-12)">
          <rect x="0" y="0" width="44" height="56" rx="3" />
          <line x1="8" y1="12" x2="36" y2="12" />
          <line x1="8" y1="22" x2="30" y2="22" />
          <line x1="8" y1="32" x2="34" y2="32" />
        </g>
        {/* open book */}
        <g transform="translate(980 160) rotate(8)">
          <path d="M0 8 Q22 0 44 8 L44 48 Q22 40 0 48 Z" />
          <path d="M44 8 Q66 0 88 8 L88 48 Q66 40 44 48 Z" />
          <line x1="44" y1="8" x2="44" y2="48" />
        </g>
        {/* envelope / letter */}
        <g transform="translate(220 520) rotate(-6)">
          <rect x="0" y="0" width="52" height="36" rx="3" />
          <path d="M0 4 L26 22 L52 4" />
        </g>
        {/* envelope 2 */}
        <g transform="translate(860 480) rotate(10)">
          <rect x="0" y="0" width="48" height="32" rx="3" />
          <path d="M0 4 L24 20 L48 4" />
        </g>
        {/* pen / quill */}
        <g transform="translate(560 100) rotate(25)">
          <path d="M4 48 L36 4 L44 12 L12 56 Z" />
          <line x1="10" y1="42" x2="18" y2="50" />
        </g>
        {/* notebook */}
        <g transform="translate(140 340) rotate(4)">
          <rect x="0" y="0" width="40" height="52" rx="2" />
          <line x1="10" y1="0" x2="10" y2="52" />
          <line x1="16" y1="14" x2="32" y2="14" />
          <line x1="16" y1="24" x2="32" y2="24" />
          <line x1="16" y1="34" x2="28" y2="34" />
        </g>
        {/* letter A */}
        <text x="720" y="220" fontSize="64" fontFamily="Georgia, serif" fill="currentColor" stroke="none" opacity="0.9">A</text>
        {/* letter B */}
        <text x="420" y="640" fontSize="52" fontFamily="Georgia, serif" fill="currentColor" stroke="none" opacity="0.85">B</text>
        {/* abc */}
        <text x="1020" y="340" fontSize="36" fontFamily="Georgia, serif" fill="currentColor" stroke="none" opacity="0.8">abc</text>
        {/* glasses */}
        <g transform="translate(500 420) rotate(-8)">
          <circle cx="12" cy="12" r="10" />
          <circle cx="42" cy="12" r="10" />
          <line x1="22" y1="12" x2="32" y2="12" />
        </g>
        {/* small book stack */}
        <g transform="translate(1050 620) rotate(-4)">
          <rect x="0" y="20" width="48" height="12" rx="1" />
          <rect x="4" y="8" width="48" height="12" rx="1" />
          <rect x="2" y="0" width="44" height="12" rx="1" />
        </g>
        {/* bookmark / ribbon */}
        <g transform="translate(320 80) rotate(-3)">
          <path d="M0 0 L18 0 L18 36 L9 28 L0 36 Z" />
        </g>
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Ensure feed content paints above the backdrop**

The existing content is a sibling after `ComunicadosBackdrop`. Add `relative` to the header and list sections so they stack above the decoration without changing layout:

In the same return block, change:

```jsx
<CompactChannelHeader
```

to:

```jsx
<div className="relative">
  <CompactChannelHeader
```

…and close that `</div>` after the empty-state / feed list (just before `</div>` that ends `space-y-4 pb-24`).

Also wrap the feed/empty/loading siblings in `relative` if needed — simplest safe approach: put `className="relative"` on the loading/empty/feed containers:

- `FeedSkeleton` wrapper: leave as-is (skeleton is fine behind)
- empty state `div`: add `relative`
- feed list `div className="space-y-3"`: change to `div className="relative space-y-3"`

- [ ] **Step 4: Verify visually**

Run the dev server and open `/comunicados` (and `/aluno/comunicados` if routed separately — same page component):

```bash
npm run dev
```

Expected:
- Soft icons visible behind the feed at low opacity
- Cards/text remain fully readable
- Buttons/clicks on cards still work
- Dark mode shows slightly stronger but still subtle decoration

- [ ] **Step 5: Commit**

```bash
git add src/pages/Comunicados.jsx
git commit -m "feat: add light decorative book/letter background to Comunicados"
```
