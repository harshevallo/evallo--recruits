import {
  signupSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changeEmailSchema,
  resendVerificationSchema,
  setPasswordSchema,
  restoreAccountSchema,
} from '@evallo/shared';

export const signupValidation = { body: signupSchema };
export const loginValidation = { body: loginSchema };
export const googleValidation = { body: googleAuthSchema };
export const forgotPasswordValidation = { body: forgotPasswordSchema };
export const resetPasswordValidation = { body: resetPasswordSchema };
export const verifyEmailValidation = { body: verifyEmailSchema };
export const setPasswordValidation = { body: setPasswordSchema };
export const resendVerificationValidation = { body: resendVerificationSchema };
export const restoreAccountValidation = { body: restoreAccountSchema };
export const changeEmailValidation = { body: changeEmailSchema };
