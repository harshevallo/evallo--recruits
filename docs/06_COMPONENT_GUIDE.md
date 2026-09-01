# 06 — Component Guide

> **Status: MKT-01, PUB-01/02, AUTH-01…05, HOME-01, CAN-01…09, REC-01…16 and SET-01/02 implemented.**
> This document defines the component conventions and the entry template, and is updated **in the
> same commit** as the components it documents.
>
> §§0–4 cover the marketing and early application surface. **§§5–7 cover the workspace shell,
> the profile builder, and the settings/recruiter components** added with CAN-02, REC-10…16 and
> SET-01.

## 0. Built to date

| Location | Components |
|---|---|
| `components/ui/` | `Avatar` `Badge` `Button` `Container` `Icon` `Logo` `Modal` `Pagination` `Section` `SectionHeading` |
| `components/form/` | `CheckCardGroup` `Checkbox` `ComboboxInput` `FormField` `PasswordInput` `SelectInput` `TagInput` `TextInput` `Textarea` |
| `components/feedback/` | `EmptyState` `Skeleton` `StatusRegion` |
| `features/auth/components/` | `AuthCard` `FirstActionChoice` `GoogleButton` |
| `features/home/components/` | `ContextSwitcher` `NextActionCard` `CompanyContextCard` |
| `features/candidate/components/` | `ProfileCompletenessCard` `VisibilityCard` `NextStepsCard` `OpportunitiesCard` `ActivityCard` `BuilderQuestion` `CandidateInterestModal` |
| `pages/candidate/` | `CandidateHomePage` `ProfileBuilderPage` `ProfilePreviewPage` `PortfolioPage` `VisibilitySettingsPage` `CandidateCompanyPage` `MyInterestsPage` (“Shortlisted companies”) `SavedCompaniesPage` `MessagesPage` |
| `pages/company/` | `CompanyStartPage` `CompanySetupPage` `CompanyPreviewPage` `CompanyTeamPage` `CompanyHomePage` `CompanyInterestsPage` `CompanyTalentSearchPage` |
| `features/companies/components/` | `CandidateResultCard` `CompanyCard` `CompanyOverview` `CompanyProfileHeader` `CompanyProfileSkeleton` `CompanyProfileView` `DirectoryFilters` `DirectoryToolbar` `ExpressInterestModal` `OpenRoleCard` `RoleResultCard` |
| `features/account/components/` | `CreateCompanyForm` `CompanyJoinSearch` |
| `components/ui/` (added) | `BackLink` |
| `layouts/` (added) | `CandidateWorkspaceLayout` `CompanyWorkspaceLayout` |
| `layouts/partials/` (added) | `WorkspaceSidebar` `SidebarTrigger` |
| `features/candidate/components/` (added) | `EntrySection` `VisibilitySection` |
| `features/candidate/sections/` | `SectionCard` `questionLayout` `IdentitySection` `PreferencesSection` `ExpertiseSection` `PracticeSection` `PortfolioSection` `CredentialsSection` |
| `pages/company/` (added) | `CompanyCandidatePage` `CompanyHiringPage` `CompanyPipelinePage` `CompanyMessagesPage` `CompanySettingsPage` |
| `features/candidate/components/` (2026-08-12) | `BlockCompanyModal` |
| `pages/legal/` (2026-08-12) | `LegalDocumentPage` |
| `router/` (2026-08-12) | `RouteFallback` |
| `pages/settings/` | `SettingsLayout` `SettingsHomePage` `SettingsAccountPage` `SettingsSecurityPage` `SettingsNotificationsPage` `SettingsPrivacyPage` `SettingsDataPage` |

**Removed:** `WorkspaceNav` (superseded by `WorkspaceSidebar`) and `BuilderLayout` (the builder now
lives in `CandidateWorkspaceLayout`; keeping its own shell produced two competing sidebars).
| `features/marketing/components/` | 13 components composing MKT-01 |
| `layouts/` | `RootLayout` `MarketingLayout` `AuthLayout` `partials/UserMenu` and nav partials |

Five notes worth carrying forward:

- **`BuilderQuestion` renders whatever the question bank sends.** The control is chosen from the
  question's `type`, and options arrive resolved from the server — so adding a question to CAN-02 is
  a bank revision, never a frontend change (ADR-007).
- **`CompanyCard` and `CompanyDirectoryPage` take a `profilePath`.** CAN-05 is the PUB-01 directory
  with a different link target; duplicating the page would have meant maintaining two directories.

- **`ContextSwitcher` is the HOME-01 centrepiece** (PRD §5.2, §5.3). It lists Personal plus every
  company, and switching **navigates to `/c/:companySlug`** rather than setting client state —
  company context lives in the URL so links stay shareable and the server can verify it (TRD §4.1).
- **`AuthLayout` takes `width="form" | "wide"`.** AUTH-05's three side-by-side choices do not fit
  the single-column form measure; every other auth screen keeps it.
- **`GoogleButton` swaps in a disabled fallback only if no button renders.** GIS renders its
  button as `div[role="button"]`, and separately creates an auxiliary FedCM iframe that is always
  0×0 — so the readiness check polls for `[role="button"]` with a non-zero width. Polling for the
  iframe instead, as this component originally did, tore down working buttons (see I-02).
- **REC-01/02/06 added three pages and no new company components.** `CompanyStartPage` reuses
  `CreateCompanyForm`; `CompanyPreviewPage` renders through `CompanyProfileView` — the same
  component PUB-02 and CAN-06 render (ADR-021),
  the same components the public PUB-02 page uses, fed by the same `serialisePublicCompany`
  output. A separate preview renderer would have been a second definition of "what a company
  page looks like", guaranteed to drift.
- **`CompanyTeamPage` carries REC-07 and REC-18 together**, because they are one question —
  who belongs to this company, and with what authority — and both act on the same
  `CompanyMember` row. The TRD binds `/c/:companySlug/team` to REC-18, which is where it lives. Role changes are inline and reversible; removal and ownership transfer are
  confirmed in a `Modal`, because neither can be undone by the person who clicked. The role
  dropdown never offers `owner`: promotion is a transfer, and listing it beside four reversible
  choices would disguise that.
- **`CompanyHomePage` renders whatever the server hands it.** Which sections exist is a
  permission decision made server-side, so the page tests no roles itself. A stat of `null`
  renders as "—", never `0` — withheld and none are different facts.
- **`CompanyInterestsPage` and `CompanyTalentSearchPage` keep their whole filter set in the URL.**
  A filtered inbox or search is a shareable, refresh-safe link, and the back button behaves. No
  list is filtered client-side: the privacy rules deciding who may appear can only run on the
  server, so every narrowing is a new request.
- **A search card is built from `toRecruiterView()`**, the same serializer CAN-03 previews, then
  stripped of evidence and contact. A card therefore cannot show something the full profile would
  withhold — and REC-12 ships no contact details at all, because discovery is not evaluation.
- **`PlaceholderPage` is contextual.** "Go back" returns to the previous screen, and the secondary
  link resolves to company home inside a company, `/home` when signed in, `/` when anonymous.
  Sending a recruiter who clicked "Open profile" out to the marketing page reads as being logged
  out, which is why it no longer does.
- **`BlockCompanyModal` states only what the server enforces.** Every line of its copy maps to a
  branch of `candidateAccess.service` — excluded from search, profile unopenable, no new messages,
  the company is not told, reversible. Nothing about "deleting your data" or "closing the
  conversation" appears, because no code does that, and a modal is exactly where an
  over-promise would be believed. Blocking lives on the candidate company page because that is the
  only screen where a candidate is looking at one specific company; CAN-04 and SET-01 → Privacy
  still own the list and the reverse action.
- **`LegalDocumentPage` renders content, and refuses to invent it.** One component serves `/terms`
  and `/privacy` from `content/legal/`. When a document is `published` it renders a contents list
  and `<h2>` per section; while it is `pending_approval` it says so instead of paraphrasing a policy
  that has not been written (D-09). Publishing approved text touches the content module only.
- **`RouteFallback` is what a split route shows while its chunk loads.** Every layout wraps its own
  `<Outlet/>` in `Suspense`, so the sidebar and navbar stay mounted and only the page area swaps —
  and the fallback is `role="status"` with an off-screen label, so the wait is announced rather than
  silent.
- **`CompanySetupPage` gets its steps from the server.** Step keys, order, fields and per-step
  progress come from `GET /companies/:id/editor`; the page renders whatever it is handed. The
  current step lives in `?step=`, so a wizard position is a shareable, refresh-safe URL.

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
| `ComboboxInput` *(built; single-select)* | Taxonomy selection where the list is long enough that **finding** the option is the work | Same vocabulary, same stored value as `SelectInput` — only the way in differs. See §4.1 |
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
| `ComboboxInput` | `components/form/ComboboxInput.jsx` | UI |
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
| `SelectInput` | UI | Native select | `options` | Keyboard-native; **still the default**. Do not replace with a custom listbox without an a11y budget — see `ComboboxInput` below, which paid one |
| `ComboboxInput` | UI | Searchable single-select | `options`, `value`, `onChange`, `listboxLabel`, `searchPlaceholder`, `emptyMessage` | ARIA 1.2 combobox with list autocomplete. `onChange` receives the **value**, not an event. Emits only option values, so free text can never reach the answer |
| `TagInput` | UI | Free-text list as chips | `value` (array), `onChange`, `maxTags`, `maxLength` | Enter or comma commits; Backspace on an empty box removes the last. **Commits on blur**, so text typed but not entered is never silently discarded. For `[String]` fields with no taxonomy — subjects, service regions, perks |
| `CheckCardGroup` | UI | Multi-select as selectable cards | `options`, `selected`, `onToggle`, `layout`, `id`, `required` | `layout` is `pill` / `tile` / `grid`, chosen by vocabulary size. A real checkbox in a label underneath, `sr-only` not `hidden`, so it stays focusable; the card shows focus via `peer-focus-visible`. `id` lands on the FIRST input, because a `<fieldset>` cannot receive the error focus the wizard sends |
| `CompanyProfileView` | Feature | **The** company profile — header, overview, open roles | `company`, `actions`, `banner`, `backTo`, `topSpacing`, `editStepHref` | Rendered by all three company surfaces: PUB-02, CAN-06 and REC-06's preview. Everything that is the same across them is **not a prop**, so it cannot diverge. See ADR-021 for why this exists |
| `CompanyProfileSkeleton` | Feature | Loading state for the above | `topSpacing` | Extracted for the same reason: two routes load one payload through one hook |
| `RoleResultCard` | Feature | One role, as a CAN-05b search result | `role` | Title links to the ROLE (`/me/roles/:id`), company name links to the company. The company link needs `relative z-10` to clear the title's stretched `after:inset-0` overlay — without it, it is drawn but unclickable. See ADR-022 |
| `OpenRoleCard` | Feature | One role, inside a company profile | `role`, `onExpressInterest` | Omitting `onExpressInterest` drops the Apply button entirely — that is how a blocked company and REC-06's preview render, rather than showing an action that cannot work |
| `CandidateResultCard` | Feature | One educator, as a REC-12 search result | `card`, `profileHref`, `isSaved`, `pipelineStage`, `matchReasons`, action callbacks | Draws only what `toSearchCard` returns. **No verified-credential badges** — B-04 verification is unbuilt, so there is no field that could back one; the reference's badge slot carries `matchedOn` instead (PRD §21.4). **No evidence/video** — dropped from the search payload on purpose; that is a §21.4 decision, not a layout one |
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

---

## 5. Workspace shell — layouts and navigation

The signed-in surface is a **fixed navbar + collapsible rail + scrolling content** shell. Three
layouts share one rail component, so there is one navigation implementation rather than one per
context.

| Component | Path | Responsibility | Used by |
|---|---|---|---|
| `WorkspaceSidebar` | `layouts/partials/WorkspaceSidebar.jsx` | The rail itself: desktop sticky column, collapse/expand toggle, mobile off-canvas drawer with scrim. Takes `label`, `items[]`, `expanded`, `onToggle`, `mobileOpen`, `onMobileClose` — it owns no routes and decides no permissions | Both workspace layouts |
| `SidebarTrigger` | same file | The mobile "open navigation" button, shown below `md` only | Both workspace layouts |
| `CandidateWorkspaceLayout` | `layouts/CandidateWorkspaceLayout.jsx` | Candidate context. Supplies the grouped rail — **DAILY** (Home, Discover companies, Shortlisted companies, Messages, Saved companies) · **MY PROFILE** (Portfolio, Edit profile, Publish & privacy, Visibility) · **ACCOUNT** (Settings) — owns collapse state, and fetches the Messages badge count | CAN-01 … CAN-11 + the builder |
| `CompanyWorkspaceLayout` | `layouts/CompanyWorkspaceLayout.jsx` | Company context. Supplies 9 rail items and **filters them by permission** via `can()` from `CompanyContext`, so the rail never offers a destination its route guard would refuse | REC-10 … REC-16 |
| `SettingsLayout` | `pages/settings/SettingsLayout.jsx` | SET-01 shell. A card dashboard at the root and sub-pages beneath it, with a top `BackLink` on every sub-page | SET-01 / SET-02 |
| `BackLink` | `components/ui/BackLink.jsx` | The single "back to the parent screen" affordance. A real `Link` to a **known parent**, never `history.back()` — a page opened from a link or a new tab has no history to return to, and a dead control is worse than none | Settings sub-pages, candidate/company overviews, company/candidate detail pages |

### Two load-bearing layout invariants

Both are easy to "clean up" and break, so they are recorded here and not only in code comments:

1. **`min-h-screen` on the workspace flex row is functional, not cosmetic.** The rail clears the
   fixed navbar with `sticky top-20`, and a sticky box can only take its offset while its containing
   block has room for it. On a short page — Messages sizes itself to the viewport — the row was not
   tall enough to absorb the 80 px offset, so the rail clamped back to `y: 0`, the `z-50` navbar
   covered its collapse toggle, and the control became genuinely unclickable. One viewport of height
   guarantees `80 px + rail height` always fits.
2. **The rail is a sticky column inside a flex row, never `fixed bottom-0`.** The footer renders
   after the whole row, so a sticky rail cannot overlap it. A fixed rail did, and the overlap was
   only visible at the end of a long page.

### Navigation is not duplicated

The rail is the navigation for screens inside a context. Two rules follow:

- **No page-level `<nav>` may link to a rail destination.** Page-foot pill rows on the candidate and
  company overviews previously repeated rail items verbatim (Companies / My interests / Messages,
  and Interest inbox / Find candidates / Edit company page / Team). They read as a second navigation
  and were removed. In-page navigation that is *not* app chrome — breadcrumbs, builder section tabs,
  conversation lists, pagination — is unaffected.
- **A `BackLink` must point *out* of the rail's context, never at another rail item.** A back link to
  a screen the rail already lists is a duplicated rail item wearing an arrow. So the candidate
  overview links up to `/home` and the company overview to "Your companies", while rail siblings —
  the builder and the preview — carry no back link at all.

`MarketingFooter` takes a `minimal` variant (identity, legal, copyright only), used on every
signed-in surface via `MarketingLayout minimalFooter`, for the same reason: full link columns under
a page that already has a rail are a third copy of the same destinations.

---

## 6. Candidate profile builder (CAN-02)

The builder renders **eight display steps** from server-owned sections. Three kinds of step exist,
and the kind — not the screen — decides the shape.

| Step | Section key | Kind | Component |
|---|---|---|---|
| 1 Professional identity | `professional_identity` | `questions` | `IdentitySection` |
| 2 Roles & work preferences | `role_preferences` | `questions` | `PreferencesSection` |
| 3 Teaching expertise | `teaching_expertise` | `questions` | `ExpertiseSection` |
| 4 Experience & Education | `experience` + `education` | `entries` | `EntrySection` ×2 |
| 5 Teaching practice | `teaching_practice` | `questions` | `PracticeSection` |
| 6 Portfolio & Media | `media` | `entries` | `PortfolioSection` |
| 7 Credentials & Scores | `credential` | `entries` | `CredentialsSection` |
| 8 Publish & Visibility | `visibility` | `visibility` | `VisibilitySection` |

Steps 4–7 are the four evidence collections (ADR-008). Experience and education are **two** server
sections merged into **one** display step — merging is display-time only, and each list still talks
to its own collection, so nothing about the API or the data changes shape.

| Component | Path | Responsibility |
|---|---|---|
| `questionLayout` | `features/candidate/sections/questionLayout.jsx` | The bridge between a bank section and a hand-laid-out screen. `render(key)` places one question and returns `null` for a key this bank version does not carry; `rest()` renders every question the layout did **not** place. That pair is what keeps "the bank is data" true — a retired question cannot break a screen, and a newly added one cannot vanish |
| `SectionCard` | `.../sections/SectionCard.jsx` | The builder's panel surface. Sections are built from several of these because the design groups questions into named modules ("Employment Parameters", "Core Methodology"). `tone="accent"` marks a role-conditional block |
| `IdentitySection` · `PreferencesSection` · `ExpertiseSection` · `PracticeSection` | `.../sections/` | The four question-driven screens, each a specific layout rather than a generic question list |
| `EntrySection` | `features/candidate/components/EntrySection.jsx` | The repeatable list-add-edit-remove pattern for `experience` and `education`. Its `FIELDS` map mirrors the server's `writable` list per kind. Each entry carries its own visibility, because ADR-008 gives it its own row — one role can be hidden without hiding the rest |
| `PortfolioSection` | `.../sections/PortfolioSection.jsx` | `media` entries as thumbnail cards (YouTube/Vimeo only). A separate screen from `EntrySection` because a video is presented as a card, not a list row |
| `CredentialsSection` | `.../sections/CredentialsSection.jsx` | `credential` entries as trust rows. States plainly that document **upload** is unavailable and that `documentUrl` takes a link the candidate already hosts — a "PDF uploaded" badge would be a lie |
| `VisibilitySection` | `features/candidate/components/VisibilitySection.jsx` | Publish + visibility inside the builder. **Reuses the CAN-04 endpoints exactly** (`fetchVisibility` / `updateVisibility`) — a second surface onto one implementation, not a second copy. Two screens showing different values would mean one is lying about who can see the candidate |
| `BuilderQuestion` | `features/candidate/components/BuilderQuestion.jsx` | Renders one bank question by type — including the role-card, chip and conditional variants the reference uses instead of dropdowns |

**Profile strength** is derived from the same `publishBlockers` the publish gate uses, so the meter
cannot disagree with whether the profile can actually be published. `unanswered` is reported
separately so an optional-answer nudge is never conflated with the publish gate.

### One primary action per question step

A question step offers **`[ Back ]` … `[ Save and Next ]`** and nothing else. It used to carry two
forward controls — a "Save section" button inside the form and a "Next: <step>" button below it —
which presented saving and moving on as two decisions when the builder only ever treats them as
one. The order is fixed and it does not skip: **validate → save → advance**, and a rejected save
(field `details` from the API, or a transport error) leaves the candidate on the step with the
inline errors and the summary already rendered.

Three properties hold it together, and each is load-bearing:

- **One writer.** `save()` is the only function that PATCHes a section. `saveAndAdvance()` calls it
  once and then calls `moveToSection()` — the *navigation half* of `goToSection()`, split out for
  exactly this reason. Going through `goToSection()` re-entered `save()`, because React has not
  re-rendered when the handler resumes and `draft` still reads dirty in that closure, so every
  "Next" sent **two identical PATCHes**.
- **One entry point.** The button lives in the footer but is `type="submit" form="…"`, so the
  button and the Enter key are the same path with one save between them.
- **One in-flight request.** `save()` guards on an `inFlight` ref set synchronously, so a
  double-click is a no-op rather than a second write; the button also disables and reads "Saving…".

Steps that are not `kind: 'questions'` keep a plain **`Next: <step>`** — entries and visibility
write as they are edited, so there is no draft to save and calling the control "Save" would be a
lie. The final step (Publish & Visibility) has no next step and is given no forward control; the
"no next section" branch on a question step falls back to plain **`Save section`** rather than
inventing a finish action the product does not have.

---

## 7. Settings, account, and recruiter components

| Component | Path | Responsibility |
|---|---|---|
| `SettingsHomePage` | `pages/settings/SettingsHomePage.jsx` | The SET-01 dashboard: five cards (Account, Security, Notifications, Privacy, Your data). Deliberately **not** one giant form — five unrelated concerns with different save semantics and different risk |
| `SettingsAccountPage` | `pages/settings/` | Photo, name, email, phone, location, account type. Account identity only, kept separate from the candidate profile builder |
| `SettingsSecurityPage` | `pages/settings/` | Change password (current + new + confirm with a `strengthOf` meter), active sessions via `describeDevice`, sign out others, connected sign-in methods |
| `SettingsNotificationsPage` | `pages/settings/` | A real `<table>` per-event × per-channel matrix. `security` is rendered locked, matching the service's refusal to store a preference for it |
| `SettingsPrivacyPage` | `pages/settings/` | Reports and blocked companies. **Links to CAN-04** rather than re-implementing visibility — settings owns the preference, `candidateAccess.service.js` remains the authority |
| `SettingsDataPage` | `pages/settings/` | Export, data-processing explanation, and the Danger Zone (separated by a divider) with a password-confirming delete modal. The modal states that some records are retained, because §16.1 mandates an audit trail an immediate purge would destroy |
| `CompanyJoinSearch` | `features/account/components/CompanyJoinSearch.jsx` | REC-01 find-and-ask-to-join. Search is **server-side and debounced, never filtered in the browser** — the result set is bounded by the server, and which companies may be seen at all is a privacy decision only the server can make. Joining is a **request**; the component cannot produce a membership on its own, which is what keeps ADR-001 intact |

### Shared form primitives — updated

`FormField` now derives `aria-describedby` from whichever of `error` / `hint` is actually rendered,
so the attribute never points at an absent element, and passes `hasError` down to the control.
`TextInput`, `Textarea` and `SelectInput` moved to the builder's input treatment — `rounded-xl`,
`bg-white`, `shadow-sm`, `border-slate-200`, and a `focus:ring-4 ring-brand-blue/15` focus ring
replacing the previous 2 px ring. All three consume `hasError`; their APIs are otherwise unchanged.

Every token used is a **light-theme value**, so the planned dark theme becomes a `dark:` pass over
these same tokens rather than a second set of components to keep in sync.
