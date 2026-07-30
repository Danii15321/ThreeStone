export {
  createDatabase,
  type Database,
  type DatabaseClientOptions,
} from './client/create-database.js';
export {
  DrizzleMultiplayerLeaseRepository,
  DrizzleMultiplayerResultRepository,
} from './repositories/multiplayer.js';
export type {
  AcquireMultiplayerLeaseInput,
  AcquireMultiplayerLeaseOutcome,
  ActiveMultiplayerLease,
  MultiplayerParticipantInput,
  MultiplayerRoundInput,
  MultiplayerSeat,
  PersistedTerminalReason,
  RenewMultiplayerLeaseInput,
  SaveMultiplayerGameInput,
  SaveMultiplayerGameOutcome,
} from './repositories/multiplayer.js';
export * as schema from './schema/index.js';
