import type { WorkspaceConfig } from './session';

export interface ShareSnapshot {
  wsName: string;
  wsConfig: WorkspaceConfig;
  created_at?: string;
}

export interface ShareCreateResponse {
  id: string;
  url: string;
}
