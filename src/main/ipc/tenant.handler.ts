import { ipcMain } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { reinitSupabaseClient } from '../services/sync.service'

export function registerTenantHandlers(): void {
  // Check if ecole_id is set
  ipcMain.handle('tenant:check', () => {
    let tenantId = SettingsRepository.get('ecole_id');
    
    // Auto-configuration silencieuse si un ID par défaut a été défini à la compilation
    if (!tenantId && process.env.VITE_DEFAULT_TENANT_ID) {
      tenantId = process.env.VITE_DEFAULT_TENANT_ID;
      SettingsRepository.set('ecole_id', tenantId);
      reinitSupabaseClient(tenantId as string);
    }
    
    return { isConfigured: !!tenantId, tenantId };
  })

  // Set ecole_id (called once during onboarding, no auth required)
  ipcMain.handle('tenant:setup', (_, tenantId: string) => {
    // 1. Save to SQLite
    const success = SettingsRepository.set('ecole_id', tenantId);
    
    // 2. Re-initialize Supabase Sync to point to this new schema
    if (success) {
      reinitSupabaseClient(tenantId);
    }
    
    return { success };
  })
}
