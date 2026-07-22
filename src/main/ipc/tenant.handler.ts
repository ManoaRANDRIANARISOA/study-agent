import { ipcMain } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { reinitSupabaseClient } from '../services/sync.service'

export function registerTenantHandlers(): void {
  // Check if tenant_id is set
  ipcMain.handle('tenant:check', () => {
    const tenantId = SettingsRepository.get('tenant_id');
    return { isConfigured: !!tenantId, tenantId };
  })

  // Set tenant_id (called once during onboarding, no auth required)
  ipcMain.handle('tenant:setup', (_, tenantId: string) => {
    // 1. Save to SQLite
    const success = SettingsRepository.set('tenant_id', tenantId);
    
    // 2. Re-initialize Supabase Sync to point to this new schema
    if (success) {
      reinitSupabaseClient(tenantId);
    }
    
    return { success };
  })
}
