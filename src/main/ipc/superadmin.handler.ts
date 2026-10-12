import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSupabaseAdmin, getActiveEcoleId } from '../services/sync.service'
import { LoggerService } from '../services/logger.service'
import { SettingsRepository } from '../database/repositories/settings.repository'

/**
 * Builds the canonical representation of the primary active / demo tenant.
 * This tenant is the first one, serves as the live demo, and must unconditionally
 * be available in the SuperAdmin dashboard.
 */
function getPrimaryDemoTenant() {
  const currentTenantId = getActiveEcoleId()
  const schoolName =
    (SettingsRepository.get('school_name') as string) ||
    (SettingsRepository.get('cached_school_name') as string) ||
    'École Dev (Démo)'
  const status = (SettingsRepository.get('cached_subscription_status') as string) || 'active'
  const endDate =
    (SettingsRepository.get('cached_subscription_end_date') as string) ||
    '2027-08-21T07:50:49.810Z'

  const demoParametrage = {
    school_name: schoolName,
    appName: (process.env.VITE_APP_NAME as string) || 'Study Agent (Démo)',
    subscription_status: status,
    subscription_end_date: endDate,
    subscription_duration_months: 12,
    module_cantine: SettingsRepository.get('module_cantine') ?? true,
    module_bus: SettingsRepository.get('module_bus') ?? true,
    module_uniforms: SettingsRepository.get('module_uniforms') ?? true,
    module_evaluations: SettingsRepository.get('module_evaluations') ?? true,
    exonerate_personnel_children: SettingsRepository.get('exonerate_personnel_children') ?? true,
    primary_color: (SettingsRepository.get('primary_color') as string) || '24 23% 57%',
    logoBase64: (SettingsRepository.get('school_logo') as string) || null
  }

  return {
    id: currentTenantId,
    nom: schoolName,
    is_demo: true,
    is_active: true,
    parametrage: JSON.stringify(demoParametrage),
    created_at: '2026-08-01T00:00:00.000Z'
  }
}

/**
 * Detect other local tenant SQLite databases in the application folder
 */
function getLocalDiscoveredTenants(primaryId: string): any[] {
  try {
    const isDev = !app.isPackaged
    const dbDir = isDev ? path.resolve(__dirname, '../../') : app.getPath('userData')
    if (!fs.existsSync(dbDir)) return []

    const files = fs.readdirSync(dbDir)
    const localTenants: any[] = []

    for (const f of files) {
      const match = f.match(/^study_agent_(.+)\.db$/)
      if (match) {
        const discoveredId = match[1]
        if (discoveredId !== primaryId && discoveredId !== 'legacy') {
          localTenants.push({
            id: discoveredId,
            nom: `Locataire Local (${discoveredId})`,
            is_demo: false,
            is_active: false,
            is_local: true,
            parametrage: JSON.stringify({
              appName: discoveredId,
              subscription_status: 'active',
              subscription_duration_months: 12,
              module_cantine: true,
              module_bus: true,
              module_uniforms: true,
              module_evaluations: true
            }),
            created_at: new Date().toISOString()
          })
        }
      }
    }

    return localTenants
  } catch (err) {
    console.warn('[SuperAdmin] Failed to scan local databases:', err)
    return []
  }
}

export function registerSuperAdminHandlers() {
  // --------------------------------------------
  // LIST ALL TENANTS (Always includes active/demo tenant first)
  // --------------------------------------------
  ipcMain.handle('superadmin:getTenants', async () => {
    try {
      const primaryDemo = getPrimaryDemoTenant()
      const otherLocal = getLocalDiscoveredTenants(primaryDemo.id)
      let remoteTenants: any[] = []

      try {
        const supabase = getSupabaseAdmin()
        if (supabase) {
          const { data, error } = await supabase
            .from('ecoles')
            .select('*')
            .order('created_at', { ascending: false })

          if (!error && Array.isArray(data)) {
            // Exclude the demo tenant from remote if duplicate to keep the local live status
            remoteTenants = data.filter((t: any) => t.id !== primaryDemo.id)
          }
        }
      } catch (remoteErr: any) {
        LoggerService.log(
          'warn',
          'superadmin',
          'Remote Supabase ecoles fetch failed or table absent, using local tenants:',
          remoteErr?.message
        )
      }

      // Merge: Primary demo tenant ALWAYS at index 0, followed by other local & remote tenants
      const combined = [primaryDemo, ...otherLocal, ...remoteTenants]

      return { success: true, data: combined }
    } catch (error: any) {
      LoggerService.log('error', 'superadmin', 'Erreur lors de la récupération des locataires', error)
      // Fallback: return at least the primary demo tenant
      return { success: true, data: [getPrimaryDemoTenant()] }
    }
  })

  // --------------------------------------------
  // UPDATE TENANT SUBSCRIPTION STATUS
  // --------------------------------------------
  ipcMain.handle('superadmin:updateTenantSubscription', async (_, id: string, status: string) => {
    try {
      const activeTenantId = getActiveEcoleId()

      // If active tenant, update local SettingsRepository immediately
      if (id === activeTenantId) {
        SettingsRepository.set('cached_subscription_status', status)
      }

      // Attempt Supabase remote update if reachable
      try {
        const supabase = getSupabaseAdmin()
        if (supabase) {
          const { data: tenant, error: fetchError } = await supabase
            .from('ecoles')
            .select('parametrage')
            .eq('id', id)
            .maybeSingle()

          if (!fetchError && tenant) {
            let parametrage: any = {}
            if (typeof tenant.parametrage === 'object' && tenant.parametrage !== null) {
              parametrage = tenant.parametrage
            } else if (typeof tenant.parametrage === 'string') {
              try {
                parametrage = JSON.parse(tenant.parametrage)
              } catch {}
            }

            parametrage = {
              ...parametrage,
              subscription_status: status,
              subscription_updated_at: new Date().toISOString()
            }

            await supabase
              .from('ecoles')
              .update({ parametrage: JSON.stringify(parametrage) })
              .eq('id', id)
          }
        }
      } catch (remoteErr: any) {
        console.warn('[SuperAdmin] Remote subscription status update skipped:', remoteErr?.message)
      }

      return { success: true }
    } catch (error: any) {
      LoggerService.log('error', 'superadmin', "Erreur lors de la mise à jour de l'abonnement", error)
      return { success: false, error: error.message }
    }
  })

  // --------------------------------------------
  // RENEW TENANT SUBSCRIPTION
  // --------------------------------------------
  ipcMain.handle(
    'superadmin:renewTenantSubscription',
    async (_, id: string, durationMonths: number, customEndDate?: string) => {
      try {
        const activeTenantId = getActiveEcoleId()
        let newEndDate: Date

        if (customEndDate) {
          newEndDate = new Date(customEndDate)
        } else {
          const existingStr =
            id === activeTenantId
              ? (SettingsRepository.get('cached_subscription_end_date') as string)
              : null
          const currentEnd = existingStr ? new Date(existingStr) : null
          const baseDate =
            currentEnd && !isNaN(currentEnd.getTime()) && currentEnd.getTime() > Date.now()
              ? currentEnd
              : new Date()
          newEndDate = new Date(baseDate)
          newEndDate.setMonth(newEndDate.getMonth() + (durationMonths || 12))
        }

        // If active tenant, persist in local SettingsRepository
        if (id === activeTenantId) {
          SettingsRepository.set('cached_subscription_status', 'active')
          SettingsRepository.set('cached_subscription_end_date', newEndDate.toISOString())
        }

        // Attempt remote update on Supabase
        try {
          const supabase = getSupabaseAdmin()
          if (supabase) {
            const { data: tenant, error: fetchError } = await supabase
              .from('ecoles')
              .select('parametrage')
              .eq('id', id)
              .maybeSingle()

            if (!fetchError && tenant) {
              let parametrage: any = {}
              if (typeof tenant.parametrage === 'object' && tenant.parametrage !== null) {
                parametrage = tenant.parametrage
              } else if (typeof tenant.parametrage === 'string') {
                try {
                  parametrage = JSON.parse(tenant.parametrage)
                } catch {}
              }

              parametrage = {
                ...parametrage,
                subscription_status: 'active',
                subscription_duration_months: durationMonths || 12,
                subscription_end_date: newEndDate.toISOString(),
                subscription_updated_at: new Date().toISOString()
              }

              await supabase
                .from('ecoles')
                .update({ parametrage: JSON.stringify(parametrage) })
                .eq('id', id)
            }
          }
        } catch (remoteErr: any) {
          console.warn('[SuperAdmin] Remote subscription renew skipped:', remoteErr?.message)
        }

        return { success: true, newEndDate: newEndDate.toISOString() }
      } catch (error: any) {
        LoggerService.log('error', 'superadmin', "Erreur lors du renouvellement de l'abonnement", error)
        return { success: false, error: error.message }
      }
    }
  )
}
