import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { CompanyWorkspaceLayout } from '@/layouts/CompanyWorkspaceLayout';
import { CandidateWorkspaceLayout } from '@/layouts/CandidateWorkspaceLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { RequireAuth } from '@/router/guards/RequireAuth';
import { RequireCompany } from '@/router/guards/RequireCompany';
import { RequireCandidate } from '@/router/guards/RequireCandidate';
import { CandidateHomePage } from '@/pages/candidate/CandidateHomePage';
import { ProfileBuilderPage } from '@/pages/candidate/ProfileBuilderPage';
import { ProfilePreviewPage } from '@/pages/candidate/ProfilePreviewPage';
import { VisibilitySettingsPage } from '@/pages/candidate/VisibilitySettingsPage';
import { CandidateCompanyPage } from '@/pages/candidate/CandidateCompanyPage';
import { MyInterestsPage } from '@/pages/candidate/MyInterestsPage';
import { MessagesPage } from '@/pages/candidate/MessagesPage';
import { CompanyStartPage } from '@/pages/company/CompanyStartPage';
import { CompanySetupPage } from '@/pages/company/CompanySetupPage';
import { CompanyPreviewPage } from '@/pages/company/CompanyPreviewPage';
import { CompanyTeamPage } from '@/pages/company/CompanyTeamPage';
import { CompanyHomePage } from '@/pages/company/CompanyHomePage';
import { CompanyInterestsPage } from '@/pages/company/CompanyInterestsPage';
import { CompanyTalentSearchPage } from '@/pages/company/CompanyTalentSearchPage';
import { CompanyCandidatePage } from '@/pages/company/CompanyCandidatePage';
import { CompanyHiringPage } from '@/pages/company/CompanyHiringPage';
import { CompanyPipelinePage } from '@/pages/company/CompanyPipelinePage';
import { CompanyMessagesPage } from '@/pages/company/CompanyMessagesPage';
import { CompanySettingsPage } from '@/pages/company/CompanySettingsPage';
import { MarketingPage } from '@/pages/marketing/MarketingPage';
import { CompanyDirectoryPage } from '@/pages/public/CompanyDirectoryPage';
import { CompanyProfilePage } from '@/pages/public/CompanyProfilePage';
import { SignInPage } from '@/pages/auth/SignInPage';
import { SignUpPage } from '@/pages/auth/SignUpPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { VerificationSentPage } from '@/pages/auth/VerificationSentPage';
import { ChangeEmailPage } from '@/pages/auth/ChangeEmailPage';
import { SetPasswordPage } from '@/pages/auth/SetPasswordPage';
import { BasicSetupPage } from '@/pages/auth/BasicSetupPage';
import { FirstActionPage } from '@/pages/auth/FirstActionPage';
import { AppHomePage } from '@/pages/home/AppHomePage';
import { SettingsLayout } from '@/pages/settings/SettingsLayout';
import { SettingsHomePage } from '@/pages/settings/SettingsHomePage';
import { SettingsAccountPage } from '@/pages/settings/SettingsAccountPage';
import { SettingsSecurityPage } from '@/pages/settings/SettingsSecurityPage';
import { SettingsNotificationsPage } from '@/pages/settings/SettingsNotificationsPage';
import { SettingsPrivacyPage } from '@/pages/settings/SettingsPrivacyPage';
import { SettingsDataPage } from '@/pages/settings/SettingsDataPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { PATHS } from './paths';

/** Routes whose real implementation is not built yet. Keeps every internal link functional. */
const PLACEHOLDERS = [
  [PATHS.TERMS, 'Terms of Service', 'Our terms of service.', 'legal content'],
  [PATHS.PRIVACY, 'Privacy Policy', 'How we handle your data.', 'legal content'],
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
            /* Signed-in surface: minimal footer, because the rail already carries navigation. */
            element: <MarketingLayout minimalFooter />,
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
                   * Every candidate screen carries the same nav, including the builder. It used to
                   * run in its own full-height shell, which read as a second sidebar beside this one
                   * and swapped the entire chrome on navigation.
                   */
                  {
                    element: <CandidateWorkspaceLayout />,
                    children: [
                  { path: PATHS.CANDIDATE_HOME, element: <CandidateHomePage /> },
                  /* CAN-02 shares the candidate shell — one navbar, one rail, one scroll. */
                  { path: PATHS.CANDIDATE_PROFILE_BUILDER, element: <ProfileBuilderPage /> },
                  { path: PATHS.CANDIDATE_PROFILE_PREVIEW, element: <ProfilePreviewPage /> },
                  { path: PATHS.CANDIDATE_VISIBILITY, element: <VisibilitySettingsPage /> },

                  /*
                   * CAN-05 reuses the PUB-01 directory component rather than duplicating it —
                   * the only difference is where a card links, which is a prop.
                   */
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

      { path: PATHS.NOT_FOUND, element: <NotFoundPage /> },
    ],
  },
]);
