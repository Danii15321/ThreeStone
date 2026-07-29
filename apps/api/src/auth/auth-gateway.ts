import type { AccountMetadata } from '@three-stone/api-contracts';

export interface AuthSession {
  readonly account: AccountMetadata;
  readonly userId: string;
}

export interface AuthGateway {
  getSession(headers: Headers): Promise<AuthSession | null>;
  handle(request: Request): Promise<Response>;
}
