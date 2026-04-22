import type { AuthenticatedRequestUser } from "../lib/authTokens";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
    }
  }
}

export {};
