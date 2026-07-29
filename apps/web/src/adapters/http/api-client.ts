import {
  accountExportSchema,
  apiErrorResponseSchema,
  playerPreferencesSchema,
  playerProfileSchema,
  soloGameResultSchema,
  soloResultHistorySchema,
  soloStatsSchema,
  type ApiErrorCode,
  type AccountExport,
  type CreateSoloResultRequest,
  type PlayerPreferences,
  type PlayerProfile,
  type SoloGameResult,
  type SoloResultHistory,
  type SoloStats,
  type UpdatePlayerPreferencesRequest,
  type UpdatePlayerProfileRequest,
} from '@three-stone/api-contracts';

interface RuntimeSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly success: true; readonly data: T } | { readonly success: false };
}

export interface SessionUser {
  readonly displayUsername: string;
  readonly id: string;
  readonly image: string | null;
  readonly username: string;
}

export interface SessionSnapshot {
  readonly expiresAt: string;
  readonly user: SessionUser;
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | 'AUTH_ERROR' | 'INVALID_RESPONSE';
  readonly requestId: string | null;
  readonly status: number;

  constructor(
    message: string,
    options: {
      readonly code: ApiClientError['code'];
      readonly requestId?: string | null;
      readonly status: number;
    },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.status = options.status;
  }
}

export class ApiClient {
  readonly baseUrl: string;
  readonly fetcher: typeof fetch;

  constructor(
    baseUrl: string,
    fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetcher = fetcher;
  }

  async signUp(input: { readonly password: string; readonly username: string }): Promise<void> {
    await this.request('/api/auth/sign-up/username', { body: input, method: 'POST' });
  }

  async signIn(input: {
    readonly password: string;
    readonly username: string;
  }): Promise<SessionSnapshot | null> {
    await this.request('/api/auth/sign-in/username', {
      body: { ...input, rememberMe: true },
      method: 'POST',
    });
    return this.getSession();
  }

  async signOut(): Promise<void> {
    await this.request('/api/auth/sign-out', { body: {}, method: 'POST' });
  }

  async getSession(): Promise<SessionSnapshot | null> {
    const payload = await this.request('/api/auth/get-session', { method: 'GET' });
    if (payload === null) {
      return null;
    }
    if (!isRecord(payload) || !isRecord(payload.user) || !isRecord(payload.session)) {
      throw invalidResponse();
    }

    const { session, user } = payload;
    if (
      typeof user.id !== 'string' ||
      typeof user.username !== 'string' ||
      typeof user.displayUsername !== 'string' ||
      (user.image !== null && user.image !== undefined && typeof user.image !== 'string') ||
      typeof session.expiresAt !== 'string'
    ) {
      throw invalidResponse();
    }

    return {
      expiresAt: session.expiresAt,
      user: {
        displayUsername: user.displayUsername,
        id: user.id,
        image: typeof user.image === 'string' ? user.image : null,
        username: user.username,
      },
    };
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/api/auth/change-password', {
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      method: 'POST',
    });
  }

  async updateUsername(username: string): Promise<SessionSnapshot | null> {
    await this.request('/api/auth/update-user', {
      body: {
        displayUsername: username,
        name: username,
        username,
      },
      method: 'POST',
    });
    return this.getSession();
  }

  async deleteAccount(password: string): Promise<void> {
    await this.request('/api/auth/delete-user', {
      body: { password },
      method: 'POST',
    });
  }

  async getProfile(): Promise<PlayerProfile> {
    return this.validatedRequest('/api/profile', playerProfileSchema);
  }

  async exportAccount(): Promise<AccountExport> {
    return this.validatedRequest('/api/account/export', accountExportSchema);
  }

  async updateProfile(input: UpdatePlayerProfileRequest): Promise<PlayerProfile> {
    return this.validatedRequest('/api/profile', playerProfileSchema, {
      body: input,
      method: 'PATCH',
    });
  }

  async uploadAvatar(file: File, expectedVersion: number): Promise<PlayerProfile> {
    return this.validatedRequest(
      `/api/profile/avatar?expectedVersion=${expectedVersion}`,
      playerProfileSchema,
      {
        contentType: file.type,
        method: 'PUT',
        rawBody: file,
      },
    );
  }

  async deleteAvatar(expectedVersion: number): Promise<PlayerProfile> {
    return this.validatedRequest(
      `/api/profile/avatar?expectedVersion=${expectedVersion}`,
      playerProfileSchema,
      { method: 'DELETE' },
    );
  }

  profileAvatarUrl(version: number): string {
    return `${this.baseUrl}/api/profile/avatar?v=${version}`;
  }

  async getPreferences(): Promise<PlayerPreferences> {
    return this.validatedRequest('/api/preferences', playerPreferencesSchema);
  }

  async updatePreferences(input: UpdatePlayerPreferencesRequest): Promise<PlayerPreferences> {
    return this.validatedRequest('/api/preferences', playerPreferencesSchema, {
      body: input,
      method: 'PUT',
    });
  }

  async recordSoloResult(input: CreateSoloResultRequest): Promise<SoloGameResult> {
    return this.validatedRequest('/api/results/solo', soloGameResultSchema, {
      body: input,
      method: 'POST',
    });
  }

  async getSoloHistory(limit = 20, offset = 0): Promise<SoloResultHistory> {
    return this.validatedRequest(
      `/api/results/solo?limit=${limit}&offset=${offset}`,
      soloResultHistorySchema,
    );
  }

  async getSoloStats(): Promise<SoloStats> {
    return this.validatedRequest('/api/stats/solo', soloStatsSchema);
  }

  private async validatedRequest<T>(
    path: string,
    schema: RuntimeSchema<T>,
    options?: RequestOptions,
  ): Promise<T> {
    const payload = await this.request(path, options);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw invalidResponse();
    }
    return parsed.data;
  }

  private async request(path: string, options: RequestOptions = {}): Promise<unknown> {
    const requestInit: RequestInit = {
      credentials: 'include',
      headers: {
        'content-type': options.contentType ?? 'application/json',
        'x-requested-with': 'three-stone-web',
      },
      method: options.method ?? 'GET',
    };
    if (options.rawBody !== undefined) {
      requestInit.body = options.rawBody;
    } else if (options.body !== undefined) {
      requestInit.body = JSON.stringify(options.body);
    }
    const response = await this.fetcher(`${this.baseUrl}${path}`, requestInit);

    const payload = await parseResponse(response);
    if (!response.ok) {
      const apiError = apiErrorResponseSchema.safeParse(payload);
      if (apiError.success) {
        throw new ApiClientError(apiError.data.error.message, {
          code: apiError.data.error.code,
          requestId: apiError.data.error.requestId,
          status: response.status,
        });
      }
      const authMessage =
        isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : 'La requête a échoué.';
      throw new ApiClientError(authMessage, {
        code: 'AUTH_ERROR',
        status: response.status,
      });
    }
    return payload;
  }
}

interface RequestOptions {
  readonly body?: unknown;
  readonly contentType?: string;
  readonly method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly rawBody?: BodyInit;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw invalidResponse();
  }
}

function invalidResponse(): ApiClientError {
  return new ApiClientError('Invalid API response', {
    code: 'INVALID_RESPONSE',
    status: 502,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
