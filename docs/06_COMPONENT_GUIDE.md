# 06 — Component Guide

> **Status: MKT-01, PUB-01/02, AUTH-01…05, and HOME-01 implemented.** This document defines the
> component conventions and the entry template, and is updated **in the same commit** as the
> components it documents.

## 0. Built to date

| Location | Components |
|---|---|
| `components/ui/` | `Avatar` `Badge` `Button` `Container` `Icon` `Logo` `Modal` `Pagination` `Section` `SectionHeading` |
| `components/form/` | `Checkbox` `FormField` `PasswordInput` `SelectInput` `TextInput` `Textarea` |
| `components/feedback/` | `EmptyState` `Skeleton` `StatusRegion` |
| `features/auth/components/` | `AuthCard` `FirstActionChoice` `GoogleButton` |
| `features/home/components/` | `ContextSwitcher` `NextActionCard` `CompanyContextCard` |
| `features/companies/components/` | `CompanyCard` `CompanyOverview` `CompanyProfileHeader` `DirectoryFilters` `DirectoryToolbar` `ExpressInterestModal` `OpenRoleCard` |
| `features/account/components/` | `CreateCompanyForm` |
| `features/marketing/components/` | 13 components composing MKT-01 |
| `layouts/` | `RootLayout` `MarketingLayout` `AuthLayout` `partials/UserMenu` and nav partials |

Three notes worth carrying forward:

- **`ContextSwitcher` is the HOME-01 centrepiece** (PRD §5.2, §5.3). It lists Personal plus every
  company, and switching **navigates to `/c/:companySlug`** rather than setting client state —
  company context lives in the URL so links stay shareable and the server can verify it (TRD §4.1).
- **`AuthLayout` takes `width="form" | "wide"`.** AUTH-05's three side-by-side choices do not fit
  the single-column form measure; every other auth screen keeps it.
- **`GoogleButton` unmounts itself when Google refuses the origin.** Google renders a 0×0 but
  *focusable* iframe in that case, which lands in the tab order ahead of the email field and
  silently steals focus. The component polls for a rendered iframe and swaps in a disabled fallback
  if none appears.

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

## 3. Primitives — planned vs built

Derived from PRD §19.1 (visual and interaction system). Rows without a corresponding file in §0
are not built yet.

| Component | Purpose | Notes |
|---|---|---|
| `Button` | Primary / secondary / text / danger | Primary is full-width or clearly dominant in focused forms |
| `TextInput` *(built; not floating-label)* | Top-aligned label, per the founder HTML | **Must** use a real `<label htmlFor>`. A placeholder-only visual label is inaccessible — and this component appears on nearly every screen |
| `PasswordInput` | Password with strength feedback and show/hide | AUTH-03, AUTH-12 |
| `SelectInput` *(built; single-select only)* | Taxonomy selection | Keyboard navigable; used heavily by search filters |
| `Textarea` | Long-form input with counter | |
| `Checkbox` / `RadioGroup` | | Grouped with `fieldset` + `legend` |
| `Modal` | Focus-trapped dialog | Returns focus to the trigger on close |
| `StatusRegion` *(built, in place of `Toast`)* | Inline `aria-live` feedback | `aria-live` region |
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

**✅ Built — MKT-01 (`evallo_recruit_marketing.html`).** File paths below are as shipped.

### As-built inventory

| Component | Path | Tier |
|---|---|---|
| `Button` | `components/ui/Button.jsx` | UI |
| `Container` | `components/ui/Container.jsx` | UI |
| `Section` | `components/ui/Section.jsx` | UI |
| `SectionHeading` | `components/ui/SectionHeading.jsx` | UI |
| `Badge` | `components/ui/Badge.jsx` | UI |
| `Avatar` | `components/ui/Avatar.jsx` | UI |
| `Icon` | `components/ui/Icon.jsx` | UI |
| `Logo` | `components/ui/Logo.jsx` | UI |
| `FormField` | `components/form/FormField.jsx` | UI |
| `TextInput` | `components/form/TextInput.jsx` | UI |
| `SelectInput` | `components/form/SelectInput.jsx` | UI |
| `StatusRegion` | `components/feedback/StatusRegion.jsx` | UI |
| `MarketingLayout` | `layouts/MarketingLayout.jsx` | Layout |
| `MarketingNavbar` | `layouts/partials/MarketingNavbar.jsx` | Layout |
| `MobileNavDrawer` | `layouts/partials/MobileNavDrawer.jsx` | Layout |
| `MarketingFooter` | `layouts/partials/MarketingFooter.jsx` | Layout |
| `MarketingHero` · `HeroAppMockup` · `BusinessValueSection` · `FeatureCard` · `EmployerBrandPanel` · `MockCompanyCard` · `EducatorSection` · `MockCandidateCard` · `NumberedStep` · `PlatformFeaturesSection` · `EarlyAccessSection` · `EarlyAccessForm` | `features/marketing/components/` | Domain |
| `MarketingPage` | `pages/marketing/MarketingPage.jsx` | Page |

Supporting: `hooks/useScrolled.js` · `features/marketing/hooks/useEarlyAccessForm.js` ·
`utils/cn.js` · `services/public.api.js`

### Deviations from the prototype

The rendered UI is unchanged. These are implementation differences, each fixing a defect that
would otherwise have shipped:

| Prototype | As built | Why |
|---|---|---|
| Labels with no `for`, inputs with no `id` | `FormField` owns the wiring | Screen readers announced "edit text, blank". PRD §19 |
| Eyebrow as `<h2>`, section heading as `<h3>` | `SectionHeading`: eyebrow is a `<p>` | Broken document outline. Now: one `h1` → `h2` sections → `h3` cards |
| Icon-only menu button, no ARIA | `aria-expanded`, `aria-controls`, `aria-label`, Escape to close | Menu was invisible to assistive tech |
| `focus:outline-none`, no replacement | Global `:focus-visible` ring | PRD §19 requires visible focus |
| Unthrottled scroll handler, 8+ classList writes/frame | `useScrolled` — rAF-throttled, one boolean | Perf, and it eliminated a ~1.9:1 contrast state mid-transition |
| `alert()` on submit | `StatusRegion` with `aria-live` | Result announced without stealing focus |
| Full FontAwesome CSS from CDN (~70 KB) | `react-icons/fa6`, tree-shaken inline SVG | Same glyphs, no third-party request |
| `placehold.co` avatar | `Avatar` initials fallback | Same appearance, no external request |
| Decorative mockups exposed to AT | `aria-hidden` | Fake headings polluted the accessible tree |
| Steps as `<div>`s | `<ol>` / `<li>` | Sequence conveyed structurally |

### Known deviation requiring a decision
`FormField` uses **top-aligned labels**, matching the prototype. PRD §19.1 mandates
Material-style floating labels for onboarding forms. Retained as-is per the instruction to
preserve the UI exactly; recorded as TRD §15 D-10. Resolve before AUTH-01, since that is where
§19.1 applies directly.

### 4.1 Shared — promoted to project-wide primitives

These come out of MKT-01 but are used across the whole product. Building them here means the
auth screens and company pages inherit them for free.

| Component | Tier | Purpose | Key props | Notes |
|---|---|---|---|---|
| `Button` | UI | All actions | `variant` (`primary`/`secondary`/`ghost`/`inverse`/`dark`), `size`, `as` (`button`/`a`/`Link`), `iconRight`, `fullWidth` | MKT-01 alone needs 5 visual variants. `as` matters — several "buttons" are semantically links and must render as `<a>` |
| `Container` | Layout | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` | `size`, `as` | Repeated 6× verbatim in the HTML |
| `Section` | Layout | Vertical rhythm + background theme | `id`, `tone` (`light`/`white`/`dark`/`brand`), `as` | Anchor targets live here |
| `SectionHeading` | UI | Eyebrow + title + subtitle | `eyebrow`, `title`, `subtitle`, `level`, `align` | **Fixes the heading-hierarchy defect centrally** — eyebrow renders as `<p>`, never a heading |
| `Logo` | Layout | Mark + wordmark | `theme` (`light`/`dark`), `size`, `href` | Nav + footer, two themes |
| `Badge` | UI | Status pills | `tone`, `icon`, `children` | "Hiring", "Verified", "SAT 1550+" |
| `Icon` | UI | Icon wrapper | `name`, `label` | **`aria-hidden` by default**; renders `role="img"` + label only when `label` is passed |
| `Avatar` | UI | Photo or initials | `src`, `initials`, `size`, `shape` | Initials fallback required (PRD §7.3 — logos optional) |
| `FormField` | UI | Label + control + error + hint | `label`, `name`, `error`, `hint`, `required` | Owns `htmlFor`/`id` wiring and `aria-describedby`/`aria-invalid`. **The HTML's labels are unassociated — this component is the fix** |
| `TextInput` | UI | Text/email input | standard input props | Floating label per PRD §19.1 — see the open question below |
| `SelectInput` | UI | Native select | `options` | Keyboard-native; do not replace with a custom listbox without an a11y budget |
| `MarketingFooter` | Layout | Public footer | `columns` | Shared by MKT-01, PUB-01, PUB-02 |
| `MobileNavDrawer` | Layout | Mobile menu | `open`, `onClose`, `items` | Focus trap, Escape to close, focus restore — none present in the HTML |

> **Open question — floating labels.** PRD §19.1 mandates Material-style floating labels for
> onboarding forms. The marketing HTML uses top-aligned labels. Recommendation: build
> `FormField`/`TextInput` with floating-label behaviour once and use it here too, so there is a
> single input component in the codebase. Requires founder sign-off, since it changes how the
> marketing form looks versus the prototype.

### 4.2 Page-specific — MKT-01 only

| Component | Purpose | Notes |
|---|---|---|
| `MarketingNavbar` | Transparent-over-hero nav that solidifies on scroll | Rewrite the scroll logic — see notes below |
| `MarketingHero` | Headline, subhead, dual CTA, pilot badge | |
| `HeroAppMockup` | Decorative fake app screenshot | `aria-hidden="true"` — it is pure decoration |
| `BusinessValueSection` | "Hire with confidence" + 3 feature cards | |
| `FeatureCard` | Icon + title + body (light) | |
| `EmployerBrandPanel` | Dark panel, benefit list, CTA | |
| `MockCompanyCard` | Decorative company profile card | `aria-hidden`; contains fabricated data — see analysis |
| `EducatorSection` | Split layout, 3 numbered steps | |
| `MockCandidateCard` | Decorative candidate profile card | `aria-hidden` |
| `NumberedStep` | Circled index + title + body | Renders as `<ol>`/`<li>`, not `<div>` |
| `PlatformFeaturesSection` | Dark 4-card grid | |
| `DarkFeatureCard` | Icon + title + body (dark) | Could merge with `FeatureCard` via a `tone` prop — preferred |
| `EarlyAccessSection` | Blue CTA band wrapping the form | |
| `EarlyAccessForm` | Segment + name + email + submit | The only backend-connected element on the page |

**`MarketingNavbar` implementation note.** The prototype attaches an unthrottled `scroll`
listener performing 8+ `classList` mutations per frame, and during the transition it applies
`text-gray-300` over a white background — roughly **1.9:1 contrast, a WCAG failure**. Replace
with an `IntersectionObserver` sentinel driving a single boolean, and derive all colours from
that one state so no intermediate combination can occur.

**`Icon` implementation note.** The prototype loads the full FontAwesome CSS (~70 KB) from a CDN
for about 20 glyphs. `Icon` should wrap tree-shaken inline SVGs so only used glyphs ship.

### 4.3 Components deliberately *not* created

| Not building | Why |
|---|---|
| `AnimatedGradientText` | One-off CSS on the hero headline; a utility class, not a component |
| `BlurDecoration` | Purely presentational divs; belongs to the section that owns them |
| Separate light/dark card components | One `FeatureCard` with a `tone` prop; two components would duplicate structure |
