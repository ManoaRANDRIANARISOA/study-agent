import { ipcMain } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { reinitSupabaseClient, getSupabaseAdmin } from '../services/sync.service'

export function registerTenantHandlers(): void {
  // Check if ecole_id is set
  ipcMain.handle('tenant:check', () => {
    let tenantId = SettingsRepository.get('ecole_id')

    // Auto-configuration silencieuse si un ID par défaut a été défini à la compilation
    if (!tenantId && process.env.VITE_DEFAULT_TENANT_ID) {
      tenantId = process.env.VITE_DEFAULT_TENANT_ID
      SettingsRepository.set('ecole_id', tenantId)
      reinitSupabaseClient(tenantId as string)
    }

    return { isConfigured: !!tenantId, tenantId }
  })

  // Set ecole_id (called once during onboarding, no auth required)
  ipcMain.handle('tenant:setup', (_, tenantId: string) => {
    // 1. Save to SQLite
    const success = SettingsRepository.set('ecole_id', tenantId)

    // 2. Re-initialize Supabase Sync to point to this new schema
    if (success) {
      reinitSupabaseClient(tenantId)
    }

    return { success }
  })

  // Check subscription status from Supabase (with offline fallback and J-10 expiration logic)
  ipcMain.handle('tenant:checkSubscription', async () => {
    const tenantId =
      (SettingsRepository.get('ecole_id') as string) ||
      process.env.VITE_DEFAULT_TENANT_ID ||
      'ecole_dev'

    try {
      const supabase = getSupabaseAdmin()
      if (supabase && tenantId) {
        const { data: tenant, error } = await supabase
          .from('ecoles')
          .select('id, nom, parametrage')
          .eq('id', tenantId)
          .maybeSingle()

        if (!error && tenant) {
          let parametrage: any = {}
          if (typeof tenant.parametrage === 'object' && tenant.parametrage !== null) {
            parametrage = tenant.parametrage
          } else if (typeof tenant.parametrage === 'string') {
            try {
              parametrage = JSON.parse(tenant.parametrage)
            } catch (e) {}
          }

          let status = parametrage.subscription_status || 'active'
          const schoolName = parametrage.school_name || tenant.nom || 'Votre Établissement'
          const endDateStr = parametrage.subscription_end_date || null

          let daysRemaining: number | null = null
          let isBlocked = status === 'suspended'
          let isExpiringSoon = false

          if (endDateStr) {
            const endDate = new Date(endDateStr)
            if (!isNaN(endDate.getTime())) {
              const now = new Date()
              const diffTime = endDate.getTime() - now.getTime()
              daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

              if (daysRemaining < 0) {
                status = 'expired'
                isBlocked = true
              } else if (daysRemaining <= 10 && daysRemaining >= 0 && status !== 'suspended') {
                isExpiringSoon = true
              }
            }
          }

          // Cache locally
          SettingsRepository.set('cached_subscription_status', status)
          SettingsRepository.set('cached_subscription_end_date', endDateStr)
          SettingsRepository.set('cached_school_name', schoolName)

          return {
            success: true,
            status,
            isBlocked,
            isExpiringSoon,
            daysRemaining,
            subscriptionEndDate: endDateStr,
            schoolName
          }
        }
      }
    } catch (err: any) {
      console.warn('[Subscription] Remote check failed, using cached status:', err.message)
    }

    // Fallback to cached status if offline
    let cachedStatus = (SettingsRepository.get('cached_subscription_status') as string) || 'active'
    const cachedEndDateStr = (SettingsRepository.get('cached_subscription_end_date') as string) || null
    const cachedSchoolName =
      (SettingsRepository.get('school_name') as string) ||
      (SettingsRepository.get('cached_school_name') as string) ||
      'Votre Établissement'

    let cachedDaysRemaining: number | null = null
    let cachedIsBlocked = cachedStatus === 'suspended'
    let cachedIsExpiringSoon = false

    if (cachedEndDateStr) {
      const endDate = new Date(cachedEndDateStr)
      if (!isNaN(endDate.getTime())) {
        const now = new Date()
        const diffTime = endDate.getTime() - now.getTime()
        cachedDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (cachedDaysRemaining < 0) {
          cachedStatus = 'expired'
          cachedIsBlocked = true
        } else if (cachedDaysRemaining <= 10 && cachedDaysRemaining >= 0 && cachedStatus !== 'suspended') {
          cachedIsExpiringSoon = true
        }
      }
    }

    return {
      success: true,
      status: cachedStatus,
      isBlocked: cachedIsBlocked,
      isExpiringSoon: cachedIsExpiringSoon,
      daysRemaining: cachedDaysRemaining,
      subscriptionEndDate: cachedEndDateStr,
      schoolName: cachedSchoolName,
      offline: true
    }
  })
}
