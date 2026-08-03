import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { MarketingLayout } from '@/layouts/MarketingLayout';
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

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      /*
       * Transparent navbar is opt-in and ONLY for routes that render a dark hero in EVERY
       * state — otherwise white text lands on a white background.
       */
      {
        element: <MarketingLayout transparentOnTop />,
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
            element: <MarketingLayout />,
            children: [
              { path: PATHS.APP_HOME, element: <AppHomePage /> },

              // Destinations HOME-01 routes to. The screens themselves belong to later PRD
              // sections; placeholders keep every link on a shipped page functional.
              {
                path: PATHS.ACCOUNT_SETTINGS,
                element: (
                  <PlaceholderPage
                    title="Account settings"
                    description="Password, security, sign-in methods, and notification preferences."
                    replacedBy="SET-01"
                  />
                ),
              },

              // Personal / candidate context (CAN-*). RequireCandidate sends a user with no
              // candidate profile back to HOME-01, where creating one is an explicit action.
              {
                element: <RequireCandidate />,
                children: [
                  { path: PATHS.CANDIDATE_HOME, element: <CandidateHomePage /> },
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

              // Company context. RequireCompany keeps a non-member out of a company URL.
              {
                element: <RequireCompany />,
                children: [
                  {
                    path: PATHS.COMPANY_HOME,
                    element: (
                      <PlaceholderPage
                        title="Company home"
                        description="Recruiting activity, interests, pipeline, and team for this company."
                        replacedBy="REC-10"
                      />
                    ),
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
