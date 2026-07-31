# 01 — Business Requirements Document

**Version:** 1.0 · 2026-07-31
**Derived from:** `Evallo_Recruit_PRD_v1.pdf` (v1.0, 30 July 2026)

> This document states the *business* case: why the product exists, who it serves, and what
> success means. Product behaviour is in `02_PRD.md`; implementation is in `03_TRD.md`.
> Where this document and the source PDF differ, **the source PDF is authoritative.**

---

## 1. Product vision

> Become the professional identity and talent-discovery layer for the education ecosystem: a
> place where educators can demonstrate *how they teach*, and where education organizations can
> evaluate fit using structured, comparable evidence. *(PRD §2.2)*

Evallo Recruit is **not** a job board and **not** an enterprise ATS. Its defensible asset is a
**structured educator evidence layer** — qualifications, teaching experience, certifications,
subject expertise, learner segments, curriculum familiarity, verified assessment results,
teaching videos, written responses, work preferences, references, and outcomes assembled into
one recruiter-ready profile (PRD §1).

---

## 2. The problem

| Audience | Problem |
|---|---|
| Education businesses | Recruiters re-collect the same evidence across applications, emails, interviews, and attachments. Screening is slow and inconsistent |
| Educators | No single professional profile credibly demonstrates teaching expertise, methods, credentials, samples, and preferences |
| Generic job platforms | Resumes and generic screening do not represent teaching ability, test scores, curriculum experience, or learner outcomes |
| Tutor marketplaces | Connect students to tutors for one-off lessons; they do not help businesses *recruit staff* |
| Evallo (go-to-market) | A bootstrapped product needs an inbound channel faster than SEO alone and cheaper than outbound sales |

*(PRD §2.1)*

---

## 3. Business goals

### 3.1 Strategic
Recruitment is the **entry point**, not the end state. The strategic wedge (PRD §2.3) is
sequential, and the delivery milestones in `14_PROGRESS_TRACKER.md` deliberately follow it:

| Stage | User value | Evallo value |
|---|---|---|
| 1. Public company presence | Indexable hiring page; inbound interest | Acquire education businesses **before** selling operational software |
| 2. Candidate profiles | Reusable professional identity | Acquire educators; build a proprietary evidence graph |
| 3. Search and matching | Recruiters source; candidates discover | Repeat usage and network effects |
| 4. Hiring workflow | In-platform decisions and communication | Retention and relationship depth |
| 5. Product expansion | CRM, scheduling, billing, PrepWork, assessments | Convert marketplace trust into broader Evallo adoption |

### 3.2 Product goals *(PRD §3.1)*
1. One global account per person; candidate and recruiter capabilities without duplicate accounts.
2. Public, Google-indexable company pages with lightweight hiring intent.
3. Candidate profiles rich enough for serious recruiter evaluation.
4. Minimal-friction expression of interest.
5. Education-specific candidate search and filtering.
6. A lightweight hiring workflow for inbound and sourced candidates.
7. Candidate contact and personal data under explicit privacy control.
8. Validate marketplace demand through pilots **before** building a full ATS.

---

## 4. User personas

### P1 — The educator (candidate)
A tutor, teacher, professor, counselor, curriculum designer, or academic leader. Maintains a
scattered evidence trail: a resume, some certificates, score reports, sample lessons, a few
references. Wants one credible profile that travels, and control over who sees their contact
details.
**Success:** publishes a profile, is discovered or expresses interest, receives a relevant reply.

### P2 — The recruiter / hiring owner
Often a founder, centre manager, or academic head at a small-to-mid education business —
**not** a full-time talent professional. Time-poor. Screens repetitively. Does not want to
write formal job descriptions.
**Success:** publishes a credible company page, marks the company hiring, receives qualified
inbound interest, progresses someone toward a hire.

### P3 — The anonymous visitor
Arrives at a company page from Google, a shared link, or the directory. Not signed in, possibly
not yet convinced.
**Success:** understands the organization and clicks "I'm interested" without hitting a wall.

### P4 — The multi-company user
Belongs to several organizations, or is simultaneously a candidate and a recruiter. This
persona is why ADR-001 exists — the platform must never force them into a second account.

### P5 — Evallo operations
Handles verification, moderation, company claims, and support. Needs auditability and
least-privilege internal access (PRD §16.4).

---

## 5. Core user journeys

**J1 — Anonymous to interest** *(PRD §9.2, the primary acquisition loop)*
Google/shared link → public company page → "I'm interested" → sign up → verify email →
minimum candidate profile → consent review → submit → company receives it in the interest inbox.
*Business criticality: highest.* Every friction point here costs acquisition on both sides at once.

**J2 — Recruiter onboarding** *(PRD §7.2)*
Create company → basics → brand → education footprint → hiring intent → preview → publish →
invite team.

**J3 — Candidate profile creation** *(PRD §8.1)*
Start profile → professional identity → evidence → visibility → preview → publish → discover
companies → express interest.

**J4 — Proactive sourcing** *(PRD §7.1 E–G)*
Talent search → filter → review candidate → shortlist or message → pipeline → outcome.

---

## 6. Functional requirements (summary)

Detailed behaviour, user stories, and acceptance criteria are in `02_PRD.md`.

| # | Area | Requirement |
|---|---|---|
| FR-1 | Accounts | One global account. Email verification precedes password creation. Google/Microsoft SSO. No role selection at sign-up |
| FR-2 | Companies | Create, publish, and maintain public, indexable company pages with team membership and roles |
| FR-3 | Hiring intent | Declare hiring with role categories only — **no mandatory job description** |
| FR-4 | Candidate profiles | Structured educator profile with dynamic role-specific modules and an evidence layer |
| FR-5 | Visibility | Candidate-controlled: draft, private, discoverable, paused, archived; contact-reveal rules; company blocks |
| FR-6 | Discovery | Public company directory; authenticated candidate search with education-specific filters |
| FR-7 | Interest | One-action expression of interest with consent, returning anonymous users to their exact context |
| FR-8 | Workflow | Interest inbox, shortlist, in-platform messaging, internal notes, default pipeline stages |
| FR-9 | Trust | Email and company-domain verification, evidence verification labels, reporting and blocking |
| FR-10 | Notifications | Essential email and in-app events with granular, company-scoped preferences |
| FR-11 | Analytics | Core funnel and marketplace events; company activity summaries |

---

## 7. Non-functional requirements *(PRD §19)*

| Area | Requirement |
|---|---|
| Responsive web | Desktop-first with full functionality at common laptop widths; **public company pages responsive to mobile**. No mobile app |
| Accessibility | Keyboard navigation, visible focus, semantic labels, sufficient contrast, screen-reader support, error association, media captions |
| Performance | Fast public pages; paginated/virtualised search; asynchronous media; optional enrichment never blocks onboarding |
| Reliability | Idempotent interest submission, invitation acceptance, and verification; recoverable drafts; transactional audit events |
| Scalability | Search and evidence metadata designed for growing profile volume; public-company and private-candidate workloads kept separate |
| Internationalization | Unicode names, global locations, time zones, multiple currencies and compensation periods |
| Data portability | Candidate and company export; deletion workflows; retention policy |
| Observability | Application logs, authorization failures, search latency, notification delivery, upload failures, funnel analytics |
| Browser support | Current stable major desktop browsers; graceful degradation below that |
| Visual system | `#0671E0` primary, `#0A0A0B` text, white surfaces, restrained borders, floating labels, one principal task per onboarding screen *(§19.1)* |

---

## 8. Success metrics *(PRD §3.3)*

| Metric | Definition |
|---|---|
| Verified account conversion | Sign-up initiations that verify email and create a password |
| Candidate profile completion | Verified accounts that publish a discoverable profile (core vs. evidence-rich measured separately) |
| Company publication | Recruiter-intent users who publish a company profile |
| **Hiring activation** | Published companies marking themselves hiring with ≥ 1 role — *the core recruiter activation event* |
| Candidate interest rate | Company-page viewers submitting interest (logged-in vs. anonymous tracked separately) |
| Recruiter response rate | Interests receiving a recruiter action within 7 days — *marketplace trust signal* |
| Search-to-shortlist rate | Profile views resulting in shortlist, message, or pipeline addition |
| **Connection outcome** | Interests or sourced candidates reaching screening, interview, offer, or hired — *primary proof of concept* |
| Profile evidence depth | Average verified credentials, assessments, samples, and videos per completed profile |
| Pilot retention | Businesses returning in subsequent weeks |

Targets are deliberately **not** fixed pre-launch; they are improvement trajectories measured
across the pilot (PRD §3.3).

---

## 9. Assumptions

1. Education businesses will publish a public page in exchange for inbound interest, without
   payment, during the pilot.
2. Educators will invest meaningful time in a long structured profile if it is reusable.
3. Lightweight hiring intent is sufficient — companies do not need formal job descriptions to
   receive quality interest (PRD §7.5). *Explicitly flagged for pilot validation.*
4. Recruiters will accept in-platform messaging rather than direct candidate contact details.
5. YouTube-style embeds are acceptable for teaching samples; native video hosting is not needed
   for MVP (PRD §3.2).
6. Pilot demand concentrates in five priority roles (PRD §20.2), so role-specific depth can be
   bounded initially.

---

## 10. Constraints

| Constraint | Source |
|---|---|
| MERN stack, JavaScript. No TypeScript, no Next.js, no alternative framework | CTO — ADR-002 |
| MongoDB is the sole datastore and sole search engine | CTO — ADR-010 |
| SEO targets Google only | CTO — ADR-004 |
| One engineer building and documenting the entire platform | Project brief |
| Deployment infrastructure deliberately deferred | CTO |
| Candidate profiles must never be publicly indexable | PRD §3.2, §9.1 |
| No full ATS before demand is validated | PRD §3.2 |

The single-engineer constraint is the reason documentation is a first-class deliverable rather
than a courtesy: it is the only bus-factor mitigation available.

---

## 11. Explicit non-goals for MVP *(PRD §3.2)*

Payroll, contracts, timesheets, employee onboarding, background-check execution · a full
enterprise ATS with requisition approvals, interview panels, offer letters, and HRIS
integrations · student-to-tutor lesson booking · publicly indexable candidate profiles ·
mandatory formal job descriptions · automated ranking that decides hires without recruiter
review · native video recording and hosting.

---

## 12. Future roadmap

**Phase 2** *(PRD §20.3)* — saved-search alerts and recommendations · expanded assessments and
company-requested tasks · reference collection and issuer verification · formal job postings
*if pilots demonstrate need* · interview scheduling, scorecards, calendar integration · profile
comparison, talent pools, bulk operations, exports · company following and candidate alerts ·
company analytics dashboards.

**Later / optional** *(PRD §20.4)* — native video recording and async video interviews ·
HRIS/ATS, calendar, email, background-check and identity integrations · offer and contract
workflows · advanced semantic matching · public API and white-label talent portals · candidate
endorsements and a long-term reputation graph.

---

## 13. Definition of MVP success

> Education businesses can publish credible public pages, receive qualified interest, find
> relevant educators, and make real hiring progress using profiles that **materially reduce
> repetitive screening.** *(PRD, closing definition)*

Registration counts are explicitly **not** the measure. Connection outcomes and pilot retention are.
