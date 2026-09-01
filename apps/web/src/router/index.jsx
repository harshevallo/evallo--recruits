import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { CompanyWorkspaceLayout } from '@/layouts/CompanyWorkspaceLayout';
import { CandidateWorkspaceLayout } from '@/layouts/CandidateWorkspaceLayout';
import { BuilderLayout } from '@/layouts/BuilderLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { RequireAuth } from '@/router/guards/RequireAuth';
import { RequireCompany } from '@/router/guards/RequireCompany';
import { RequireCandidate } from '@/router/guards/RequireCandidate';
import { MarketingPage } from '@/pages/marketing/MarketingPage';
import { SignInPage } from '@/pages/auth/SignInPage';
import { SignUpPage } from '@/pages/auth/SignUpPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { TERMS_DOCUMENT, PRIVACY_DOCUMENT } from '@/content/legal';
import { PATHS } from './paths';

/*
 * ── Code splitting ────────────────────────────────────────────────────────────────────────────
 *
 * Everything below `lazy()` becomes its own chunk, fetched the first time its route is entered.
 * Each layout wraps its `<Outlet/>` in a Suspense boundary with `RouteFallback`, so the chrome
 * stays mounted and the page area shows an announced loading state instead of going blank.
 *
 * Four things stay EAGER, on purpose:
 *
 *   layouts + guards   they render on every navigation, and a guard that arrives late would
 *                      flash unauthenticated content before redirecting
 *   MarketingPage      the landing page is the first paint for an anonymous visitor; splitting it
 *                      buys nothing and costs a round trip on the page that matters most for SEO
 *   SignInPage/SignUpPage  the two entry points every unauthenticated deep link redirects into
 *   NotFoundPage       tiny, and needed exactly when routing has already gone wrong
 *
 * Nothing in the authentication BOOTSTRAP path is split: AuthContext, the API client and the
 * token refresh live in the entry chunk, so a page can never render before auth state is known.
 */

// Public
const CompanyDirectoryPage = lazy(() =>
  import('@/pages/public/CompanyDirectoryPage').then((m) => ({ default: m.CompanyDirectoryPage })),
);
const CompanyProfilePage = lazy(() =>
  import('@/pages/public/CompanyProfilePage').then((m) => ({ default: m.CompanyProfilePage })),
);
const LegalDocumentPage = lazy(() =>
  import('@/pages/legal/LegalDocumentPage').then((m) => ({ default: m.LegalDocumentPage })),
);
const PlaceholderPage = lazy(() =>
  import('@/pages/PlaceholderPage').then((m) => ({ default: m.PlaceholderPage })),
);
/*
 * ADR-019 — a candidate portfolio opened by its share token. Unauthenticated, and outside every
 * layout: the reader is a guest, so the page carries its own minimal chrome rather than the
 * marketing navbar and footer, which exist to sell the product to a visitor.
 */
const SharedPortfolioPage = lazy(() =>
  import('@/pages/public/SharedPortfolioPage').then((m) => ({ default: m.SharedPortfolioPage })),
);

// Auth (beyond the two entry screens)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('@/pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const VerificationSentPage = lazy(() =>
  import('@/pages/auth/VerificationSentPage').then((m) => ({ default: m.VerificationSentPage })),
);
const ChangeEmailPage = lazy(() =>
  import('@/pages/auth/ChangeEmailPage').then((m) => ({ default: m.ChangeEmailPage })),
);
const SetPasswordPage = lazy(() =>
  import('@/pages/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })),
);
const RestoreAccountPage = lazy(() =>
  import('@/pages/auth/RestoreAccountPage').then((m) => ({ default: m.RestoreAccountPage })),
);
const BasicSetupPage = lazy(() =>
  import('@/pages/auth/BasicSetupPage').then((m) => ({ default: m.BasicSetupPage })),
);
const FirstActionPage = lazy(() =>
  import('@/pages/auth/FirstActionPage').then((m) => ({ default: m.FirstActionPage })),
);

// Personal
const AppHomePage = lazy(() =>
  import('@/pages/home/AppHomePage').then((m) => ({ default: m.AppHomePage })),
);
const SettingsLayout = lazy(() =>
  import('@/pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })),
);
const SettingsHomePage = lazy(() =>
  import('@/pages/settings/SettingsHomePage').then((m) => ({ default: m.SettingsHomePage })),
);
const SettingsAccountPage = lazy(() =>
  import('@/pages/settings/SettingsAccountPage').then((m) => ({ default: m.SettingsAccountPage })),
);
const SettingsSecurityPage = lazy(() =>
  import('@/pages/settings/SettingsSecurityPage').then((m) => ({ default: m.SettingsSecurityPage })),
);
const SettingsNotificationsPage = lazy(() =>
  import('@/pages/settings/SettingsNotificationsPage').then((m) => ({
    default: m.SettingsNotificationsPage,
  })),
);
const SettingsPrivacyPage = lazy(() =>
  import('@/pages/settings/SettingsPrivacyPage').then((m) => ({ default: m.SettingsPrivacyPage })),
);
const SettingsDataPage = lazy(() =>
  import('@/pages/settings/SettingsDataPage').then((m) => ({ default: m.SettingsDataPage })),
);

// Candidate workspace
const CandidateHomePage = lazy(() =>
  import('@/pages/candidate/CandidateHomePage').then((m) => ({ default: m.CandidateHomePage })),
);
const ProfileBuilderPage = lazy(() =>
  import('@/pages/candidate/ProfileBuilderPage').then((m) => ({ default: m.ProfileBuilderPage })),
);
const ProfilePreviewPage = lazy(() =>
  import('@/pages/candidate/ProfilePreviewPage').then((m) => ({ default: m.ProfilePreviewPage })),
);
const PortfolioPage = lazy(() =>
  import('@/pages/candidate/PortfolioPage').then((m) => ({ default: m.PortfolioPage })),
);
const SavedCompaniesPage = lazy(() =>
  import('@/pages/candidate/SavedCompaniesPage').then((m) => ({ default: m.SavedCompaniesPage })),
);
const RoleSearchPage = lazy(() =>
  import('@/pages/candidate/RoleSearchPage').then((m) => ({ default: m.RoleSearchPage })),
);
const RoleDetailPage = lazy(() =>
  import('@/pages/candidate/RoleDetailPage').then((m) => ({ default: m.RoleDetailPage })),
);
const VisibilitySettingsPage = lazy(() =>
  import('@/pages/candidate/VisibilitySettingsPage').then((m) => ({
    default: m.VisibilitySettingsPage,
  })),
);
const CandidateCompanyPage = lazy(() =>
  import('@/pages/candidate/CandidateCompanyPage').then((m) => ({ default: m.CandidateCompanyPage })),
);
const MyInterestsPage = lazy(() =>
  import('@/pages/candidate/MyInterestsPage').then((m) => ({ default: m.MyInterestsPage })),
);
const MessagesPage = lazy(() =>
  import('@/pages/candidate/MessagesPage').then((m) => ({ default: m.MessagesPage })),
);

// Company workspace
const CompanyStartPage = lazy(() =>
  import('@/pages/company/CompanyStartPage').then((m) => ({ default: m.CompanyStartPage })),
);
const CompanySetupPage = lazy(() =>
  import('@/pages/company/CompanySetupPage').then((m) => ({ default: m.CompanySetupPage })),
);
const CompanyPreviewPage = lazy(() =>
  import('@/pages/company/CompanyPreviewPage').then((m) => ({ default: m.CompanyPreviewPage })),
);
const CompanyTeamPage = lazy(() =>
  import('@/pages/company/CompanyTeamPage').then((m) => ({ default: m.CompanyTeamPage })),
);
const CompanyHomePage = lazy(() =>
  import('@/pages/company/CompanyHomePage').then((m) => ({ default: m.CompanyHomePage })),
);
const CompanyInterestsPage = lazy(() =>
  import('@/pages/company/CompanyInterestsPage').then((m) => ({ default: m.CompanyInterestsPage })),
);
const CompanyTalentSearchPage = lazy(() =>
  import('@/pages/company/CompanyTalentSearchPage').then((m) => ({
    default: m.CompanyTalentSearchPage,
  })),
);
const CompanyCandidatePage = lazy(() =>
  import('@/pages/company/CompanyCandidatePage').then((m) => ({ default: m.CompanyCandidatePage })),
);
const CompanyHiringPage = lazy(() =>
  import('@/pages/company/CompanyHiringPage').then((m) => ({ default: m.CompanyHiringPage })),
);
const CompanyPipelinePage = lazy(() =>
  import('@/pages/company/CompanyPipelinePage').then((m) => ({ default: m.CompanyPipelinePage })),
);
const CompanyHiresPage = lazy(() =>
  import('@/pages/company/CompanyHiresPage').then((m) => ({ default: m.CompanyHiresPage })),
);
const CompanyMessagesPage = lazy(() =>
  import('@/pages/company/CompanyMessagesPage').then((m) => ({ default: m.CompanyMessagesPage })),
);
const CompanySettingsPage = lazy(() =>
  import('@/pages/company/CompanySettingsPage').then((m) => ({ default: m.CompanySettingsPage })),
);

/**
 * Routes whose real implementation is not built yet. Keeps every internal link functional.
 *
 * `/terms` and `/privacy` are NOT here any more — they are real pages backed by `content/legal`
 * (D-09). Every route left in this list is marketing content, and none of them is referenced by a
 * consent statement.
 */
const PLACEHOLDERS = [
  [PATHS.PRICING, 'Pricing', 'Plans and pricing for education businesses.', 'pricing model'],
  [PATHS.ASSESSMENTS, 'Assessment Engine', 'Built-in assessments for evaluating educators.', 'the assessments module'],
  [PATHS.HELP, 'Help Center', 'Guides and support articles.', 'support content'],
  [PATHS.GUIDES, 'Hiring Guides', 'How to hire and evaluate educators.', 'content marketing'],
  [PATHS.BLOG, 'Blog', 'News and insight from Evallo Recruit.', 'content marketing'],
  [PATHS.RESEARCH, 'Market Research', 'Education hiring market research.', 'content marketing'],
  [PATHS.ABOUT, 'About Us', 'Why we built Evallo Recruit.', 'company content'],
  [PATHS.CONTACT, 'Contact', 'Get in touch with the team.', 'company content'],
];

/**
 * Company-scoped screens that shipped pages already link to, but whose PRD section is not built.
 *
 * These sit inside RequireCompany so a non-member still gets the company guard rather than a
 * teaser. Without them the links are dead: React Router falls through to `*` and a recruiter who
 * clicks "Open profile" on a real interest lands on a 404 that looks like the app is broken.
 */
/*
 * No company screen is a placeholder any more: REC-17 reuses the setup editor and SET-02 is built.
 * The list stays (empty) because the router maps over it, and a future unbuilt company screen
 * should land here rather than as a dead link.
 */
const COMPANY_PLACEHOLDERS = [];

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      /*
       * The landing page now uses the same light base as the rest of the site, so the navbar stays
       * SOLID here too — the transparent variant only ever worked over the old dark hero, and white
       * text on a white hero is invisible.
       */
      {
        element: <MarketingLayout />,
        children: [{ path: PATHS.HOME, element: <MarketingPage /> }],
      },

      // Public pages with a solid navbar.
      {
        element: <MarketingLayout />,
        children: [
          { path: PATHS.COMPANY_DIRECTORY, element: <CompanyDirectoryPage /> },
          { path: PATHS.COMPANY_PROFILE, element: <CompanyProfilePage /> },

          /*
           * Public role discovery (Phase 1).
           *
           * The same two components the candidate workspace renders, at public paths with public
           * links. `/api/public/roles` was already unauthenticated and already excluded inactive
           * roles and invisible companies — the only thing missing was a page, so nothing here
           * relaxes a rule; it exposes a surface that was already safe to expose.
           *
           * Defaults handle the paths, so no props: the components default to the PUBLIC routes
           * and it is `/me/roles` below that passes overrides.
           */
          { path: PATHS.PUBLIC_ROLES, element: <RoleSearchPage /> },
          { path: PATHS.PUBLIC_ROLE_DETAIL, element: <RoleDetailPage /> },

          /*
           * D-09 — Terms and Privacy are referenced by the sign-up consent line, the early-access
           * form and SET-01, so they are real routes with a real document page. The approved text
           * is a founder/legal deliverable; until it lands the page says so rather than inventing
           * policy language (see content/legal).
           */
          { path: PATHS.TERMS, element: <LegalDocumentPage document={TERMS_DOCUMENT} /> },
          { path: PATHS.PRIVACY, element: <LegalDocumentPage document={PRIVACY_DOCUMENT} /> },

          ...PLACEHOLDERS.map(([path, title, description, replacedBy]) => ({
            path,
            element: (
              <PlaceholderPage
                title={title}
                description={description}
                replacedBy={replacedBy}
              />
            ),
          })),
        ],
      },

      // AUTH-01 / AUTH-10 — single-task layout, no competing navigation (PRD §19.1).
      {
        element: <AuthLayout />,
        children: [
          { path: PATHS.SIGN_IN, element: <SignInPage /> },
          { path: PATHS.SIGN_UP, element: <SignUpPage /> },
          { path: PATHS.FORGOT_PASSWORD, element: <ForgotPasswordPage /> },
          { path: PATHS.RESET_PASSWORD, element: <ResetPasswordPage /> },
          { path: PATHS.VERIFY_EMAIL, element: <VerifyEmailPage /> },
          { path: PATHS.VERIFICATION_SENT, element: <VerificationSentPage /> },
          { path: PATHS.CHANGE_EMAIL, element: <ChangeEmailPage /> },
          { path: PATHS.SET_PASSWORD, element: <SetPasswordPage /> },
          { path: PATHS.BASIC_SETUP, element: <BasicSetupPage /> },
          // Cancels a pending account deletion — reachable only from the emailed link.
          { path: PATHS.RESTORE_ACCOUNT, element: <RestoreAccountPage /> },
        ],
      },

      // AUTH-05 — same single-task shell, wider measure for the three side-by-side choices.
      {
        element: <AuthLayout width="wide" />,
        children: [{ path: PATHS.FIRST_ACTION, element: <FirstActionPage /> }],
      },

      // Authenticated. RequireAuth redirects to sign-in, preserving the attempted path.
      {
        element: <RequireAuth />,
        children: [
          {
            /*
             * Signed-in surface: navbar and rail, NO footer.
             *
             * The workspace is an application, not a document. Its navigation is the rail, several
             * of its screens size themselves to the viewport, and marketing/legal links under a
             * pipeline board are chrome nobody working there wants. Public routes above keep the
             * full footer, which for a visitor is the site's navigation.
             */
            element: <MarketingLayout footer={false} />,
            children: [
              { path: PATHS.APP_HOME, element: <AppHomePage /> },

              /*
               * SET-01 — a dashboard with sub-pages, not one giant form. Five unrelated concerns
               * with different save semantics and different risk: a single form would submit a
               * password change and a notification toggle in the same request.
               */
              {
                path: PATHS.ACCOUNT_SETTINGS,
                element: <SettingsLayout />,
                children: [
                  { index: true, element: <SettingsHomePage /> },
                  { path: PATHS.SETTINGS_ACCOUNT, element: <SettingsAccountPage /> },
                  { path: PATHS.SETTINGS_SECURITY, element: <SettingsSecurityPage /> },
                  { path: PATHS.SETTINGS_NOTIFICATIONS, element: <SettingsNotificationsPage /> },
                  { path: PATHS.SETTINGS_PRIVACY, element: <SettingsPrivacyPage /> },
                  { path: PATHS.SETTINGS_DATA, element: <SettingsDataPage /> },
                ],
              },

              // REC-01 — create or join. Authenticated only: RequireCompany cannot apply,
              // because the point of the screen is that you are not a member yet.
              { path: PATHS.COMPANY_START, element: <CompanyStartPage /> },

              // Personal / candidate context (CAN-*). RequireCandidate sends a user with no
              // candidate profile back to HOME-01, where creating one is an explicit action.
              {
                element: <RequireCandidate />,
                children: [
                  /*
                   * Every candidate screen carries this rail EXCEPT the builder, which runs in its
                   * own full-height shell — see the BuilderLayout block below.
                   */
                  {
                    element: <CandidateWorkspaceLayout />,
                    children: [
                  { path: PATHS.CANDIDATE_HOME, element: <CandidateHomePage /> },
                  /*
                   * The portfolio and the preview are siblings over one payload, not two features.
                   * The preview is the inspection (publish state, what is withheld, gaps drawn);
                   * the portfolio is the artefact plus its share controls. Same endpoint, same
                   * renderer, different surroundings.
                   */
                  { path: PATHS.CANDIDATE_PORTFOLIO, element: <PortfolioPage /> },
                  { path: PATHS.CANDIDATE_PROFILE_PREVIEW, element: <ProfilePreviewPage /> },
                  { path: PATHS.CANDIDATE_VISIBILITY, element: <VisibilitySettingsPage /> },
                  // CAN-11 — the read side of the save action CAN-06 already had.
                  { path: PATHS.CANDIDATE_SAVED, element: <SavedCompaniesPage /> },

                  /*
                   * CAN-05 reuses the PUB-01 directory component rather than duplicating it —
                   * the only difference is where a card links, which is a prop.
                   */
                  /*
                   * Two searches, deliberately separate. Roles returns hiring intents across every
                   * visible company; Companies returns organisations. Same visibility predicate on
                   * the server, different result unit, different card.
                   */
                  {
                    /* Same page as `/roles`; only the links change, so a signed-in candidate stays
                       inside their workspace instead of being bounced out to the public site. */
                    path: PATHS.CANDIDATE_ROLES,
                    element: (
                      <RoleSearchPage
                        roleDetailPath={PATHS.CANDIDATE_ROLE_DETAIL}
                        companyProfilePath={PATHS.CANDIDATE_COMPANY_PROFILE}
                        companyDirectoryPath={PATHS.CANDIDATE_COMPANIES}
                      />
                    ),
                  },
                  /*
                   * A role has its own page. Declared after the search it is reached from; the two
                   * paths do not overlap (`/me/roles` vs `/me/roles/:roleId`), so order is for
                   * reading rather than for matching.
                   */
                  {
                    path: PATHS.CANDIDATE_ROLE_DETAIL,
                    element: (
                      <RoleDetailPage
                        rolesPath={PATHS.CANDIDATE_ROLES}
                        companyProfilePath={PATHS.CANDIDATE_COMPANY_PROFILE}
                        candidateActions
                      />
                    ),
                  },
                  {
                    path: PATHS.CANDIDATE_COMPANIES,
                    element: (
                      <CompanyDirectoryPage profilePath={PATHS.CANDIDATE_COMPANY_PROFILE} />
                    ),
                  },
                  { path: PATHS.CANDIDATE_COMPANY_PROFILE, element: <CandidateCompanyPage /> },

                  { path: PATHS.CANDIDATE_INTERESTS, element: <MyInterestsPage /> },
                  { path: PATHS.CANDIDATE_MESSAGES, element: <MessagesPage /> },
                    ],
                  },
                ],
              },

              // Company context. RequireCompany keeps a non-member out of a company URL.
              {
                element: <RequireCompany />,
                children: [
                  {
                    /*
                     * The company workspace nav. Inside RequireCompany, so it can read the active
                     * membership's permissions and show only what this role may actually open.
                     */
                    element: <CompanyWorkspaceLayout />,
                    children: [
                  // REC-10. Open to any active member; the server decides which sections load.
                  { path: PATHS.COMPANY_HOME, element: <CompanyHomePage /> },
                  // REC-02 and REC-06. The server additionally requires company:edit.
                  { path: PATHS.COMPANY_SETUP, element: <CompanySetupPage /> },
                  /*
                   * REC-17 is the same editor as REC-02, not a second one. The fields, the API and
                   * the publish checklist are identical once a company exists; only the framing
                   * differs, which the page derives from its own status.
                   */
                  { path: PATHS.COMPANY_EDIT, element: <CompanySetupPage /> },
                  { path: PATHS.COMPANY_PREVIEW, element: <CompanyPreviewPage /> },
                  // REC-07. The server additionally requires member:manage, so a recruiter or
                  // viewer who reaches this URL gets an error rather than a team roster.
                  { path: PATHS.COMPANY_TEAM, element: <CompanyTeamPage /> },
                  // REC-11. The server requires interest:view, which every company role holds.
                  { path: PATHS.COMPANY_INTERESTS, element: <CompanyInterestsPage /> },
                  // REC-12. The server additionally requires candidate:search, which a hiring
                  // manager and a viewer do not hold.
                  { path: PATHS.COMPANY_SEARCH, element: <CompanyTalentSearchPage /> },
                  // REC-13. The server additionally requires candidate:view, and the candidate's
                  // own settings decide what comes back regardless of that permission.
                  { path: PATHS.COMPANY_CANDIDATE, element: <CompanyCandidatePage /> },

                  /*
                   * REC-16 / REC-14 / REC-15. Each screen is readable by any active member and
                   * gates its own write actions on the permission the server enforces —
                   * `hiring:manage`, `pipeline:edit`, `message:send` respectively. The route guard
                   * is membership; the button-level guard is the permission.
                   */
                  { path: PATHS.COMPANY_HIRING, element: <CompanyHiringPage /> },
                  { path: PATHS.COMPANY_PIPELINE, element: <CompanyPipelinePage /> },
                  { path: PATHS.COMPANY_HIRES, element: <CompanyHiresPage /> },
                  { path: PATHS.COMPANY_MESSAGES, element: <CompanyMessagesPage /> },
                  { path: PATHS.COMPANY_SETTINGS, element: <CompanySettingsPage /> },

                  ...COMPANY_PLACEHOLDERS.map(([path, title, description, replacedBy]) => ({
                    path,
                    element: (
                      <PlaceholderPage
                        title={title}
                        description={description}
                        replacedBy={replacedBy}
                      />
                    ),
                  })),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },

      /*
       * CAN-02 — its own shell, a sibling of MarketingLayout rather than a child of it.
       *
       * The builder is the one authenticated screen that owns the viewport: fixed bar, fixed
       * section rail, and a single scrolling pane. Nesting it under MarketingLayout put a marketing
       * navbar above its own bar (two bars), and nesting it under CandidateWorkspaceLayout put the
       * candidate rail beside its section rail (two rails). It is out of both for that reason.
       *
       * The guards are unchanged: RequireAuth still wraps this, and RequireCandidate still stands
       * between it and anyone without a candidate profile. Leaving the layout did not loosen access.
       */
      {
        element: <BuilderLayout />,
        children: [
          {
            element: <RequireCandidate />,
            children: [
              { path: PATHS.CANDIDATE_PROFILE_BUILDER, element: <ProfileBuilderPage /> },
            ],
          },
        ],
      },

      /*
       * ADR-019 — the share link.
       *
       * A sibling of every layout, deliberately. It is not marketing (no navbar or footer selling
       * the product over someone's CV), not the candidate workspace (the reader is not the
       * candidate, and has no account at all), and not behind RequireAuth (needing an account is
       * the exact thing the link exists to avoid). RootLayout's Suspense backstop covers the lazy
       * chunk, which is exactly the case that boundary exists for: a split route outside a layout.
       */
      { path: PATHS.PUBLIC_PORTFOLIO, element: <SharedPortfolioPage /> },

      { path: PATHS.NOT_FOUND, element: <NotFoundPage /> },
    ],
  },
]);
