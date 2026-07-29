export const PASSWORD_RESET_OTP_LENGTH = 6;

// The verify-otp step trades the OTP for this token; reset-password accepts
// nothing else, so the code itself never travels twice.
export const PASSWORD_RESET_TOKEN_EXPIRES_IN = '10m';
export const PASSWORD_RESET_TOKEN_PURPOSE = 'password-reset';
