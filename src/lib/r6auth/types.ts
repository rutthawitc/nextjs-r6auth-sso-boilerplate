/** The user profile r6auth's token.php returns. Every field is a string; missing data is "". */
export interface R6AuthUser {
  /** Employee code. */
  username: string;
  /** Permanent Keycloak user id. */
  sub: string;
  name: string;
  first_name: string;
  last_name: string;
  name_en: string;
  email: string;
  title: string;
  level: string;
  company: string;
  division: string;
  department: string;
  office: string;
  costcenter: string;
  /** Business area code, e.g. 1059. */
  ba: string;
}

export interface R6AuthResult {
  user: R6AuthUser;
  /** Epoch seconds. */
  loginAt: number;
  /** Epoch seconds; the central session ends here (at most 8 hours after login). */
  expiresAt: number;
}
