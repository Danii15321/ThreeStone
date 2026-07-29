import {
  accountExportSchema,
  type AccountExport,
  type AccountMetadata,
} from '@three-stone/api-contracts';

import type { ProfileService } from './profile-service.js';
import type { SoloResultsService } from './solo-results-service.js';

export class AccountExportService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly results: SoloResultsService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async export(userId: string, account: AccountMetadata): Promise<AccountExport> {
    const [profile, preferences, stats] = await Promise.all([
      this.profiles.getProfile(userId),
      this.profiles.getPreferences(userId),
      this.results.stats(userId),
    ]);
    const results = [];
    let offset = 0;

    while (true) {
      const page = await this.results.history(userId, { limit: 100, offset });
      results.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }

    return accountExportSchema.parse({
      account,
      exportedAt: this.clock().toISOString(),
      preferences,
      profile,
      results,
      schemaVersion: '1.0.0',
      stats,
    });
  }
}
