# 06 — Component Guide

> **Status: no components implemented yet.** This document defines the component conventions and
> the entry template. It is updated **in the same commit** as the component it documents.

---

## 1. Component tiers

| Tier | Location | Definition | Reusable? |
|---|---|---|---|
| **UI primitive** | `components/ui/` | Design-system atom. No domain knowledge, no data fetching | Always |
| **Layout** | `components/layout/` | App shell, navigation, company switcher | Always |
| **Public** | `components/public/` | SSR-safe; usable by anonymous routes (ADR-004) | Always |
| **Domain** | `components/<domain>/` | Knows a domain shape; still no data fetching | Within its domain |
| **Page** | `pages/` | One screen. Composition only | Never |

### Non-negotiable rules
1. **No business logic in a UI component.** Rules live in services (server) or hooks (client).
2. **No `axios` outside `services/`.** A component importing `axios` is misplaced.
3. **Primitives never import from `features/` or `context/`.** Data arrives as props.
4. **`routes/public/*` components** may import only from `components/ui/`, `components/public/`,
   `packages/shared`, and `services/`. No `window`/`document` during render, no auth context
   (ADR-004).
5. **Accessibility is part of the component**, not a later audit (`03_TRD.md` §12).

---

## 2. Entry template

````markdown
### `<ComponentName>`

**Location** — `components/ui/ComponentName.jsx`
**Tier** — UI primitive | Layout | Public | Domain | Page
**Purpose** — One sentence.

**Props**
| Prop | Type | Required | Default | Description |
|---|---|:--:|---|---|
| `label` | string | ✅ | — | Visible, screen-reader-bound label |
| `error` | string | | — | Inline error; sets `aria-invalid` and `aria-describedby` |

**Usage**
```jsx
<ComponentName label="Email" value={email} onChange={setEmail} error={errors.email} />
```

**Dependencies** — Other components, hooks, or shared modules used.
**Accessibility** — Roles, keyboard behaviour, focus management, ARIA wiring.
**Used by** — Screens or components that consume it.
**Notes** — Non-obvious behaviour or constraints.
````

---

## 3. Planned primitives

Derived from PRD §19.1 (visual and interaction system). Built in M0/M1.

| Component | Purpose | Notes |
|---|---|---|
| `Button` | Primary / secondary / text / danger | Primary is full-width or clearly dominant in focused forms |
| `FloatingLabelInput` | Material-style floating label | **Must** use a real `<label htmlFor>`. A placeholder-only visual label is inaccessible — and this component appears on nearly every screen |
| `PasswordInput` | Password with strength feedback and show/hide | AUTH-03, AUTH-12 |
| `Select` / `MultiSelect` | Taxonomy selection | Keyboard navigable; used heavily by search filters |
| `Textarea` | Long-form input with counter | |
| `Checkbox` / `RadioGroup` | | Grouped with `fieldset` + `legend` |
| `Modal` | Focus-trapped dialog | Returns focus to the trigger on close |
| `Toast` | Transient feedback | `aria-live` region |
| `Badge` | Status and verification indicators | Verification status must be visually distinguishable **and** text-labelled (PRD §8.6) |
| `Avatar` | Photo or generated initials | Initials fallback required — logos are optional (PRD §7.3) |
| `ProgressBar` / `StepIndicator` | "Step X of Y" for finite wizards | PRD §19.1 |
| `EmptyState` | No-data states | |
| `Skeleton` | Loading placeholder | Must not cause layout shift (PRD §19.1) |
| `Pagination` | Result paging | |
| `Tabs` | Section navigation | Roving tabindex |
| `Tooltip` | Supplementary hints | Never the only source of essential information |

### Design tokens *(PRD §19.1)*
```
primary        #0671E0     Actions
text-primary   #0A0A0B     Body text
surface        #FFFFFF     Backgrounds
borders                    Restrained light grey
info states                Pale blue
```

**Contrast caveat:** `#0671E0` on white is roughly 4.7:1 — passes AA for normal text, fails AAA,
and is marginal for large-text accent use. Any use of the primary colour *as text* must be
checked rather than assumed.

---

## 4. Components

*None implemented. First entries land with M0 (UI primitives) and M1 (auth screens).*
