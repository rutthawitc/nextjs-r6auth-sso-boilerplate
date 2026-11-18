export const BCRYPT_COST = 12;
export const CONTRACTOR_MAX_ROLE_LEVEL = 50;
export const EXPIRING_SOON_DAYS = 30;
export const CONTRACTOR_CODE_RE = /^\d{1,20}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
// bcrypt ignores everything past 72 bytes; Thai characters are 3 bytes each.
export const PASSWORD_MAX_BYTES = 72;
