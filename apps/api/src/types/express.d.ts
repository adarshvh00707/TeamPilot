import type { Role } from '@teampilot/shared';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string; email: string | null };
      org?: { organizationId: string; role: Role };
    }
  }
}

export {};
