import { ipcMain } from 'electron'
import { getSupabaseAdmin } from '../services/sync.service'
import { LoggerService } from '../services/logger.service'

export function registerSuperAdminHandlers() {
  ipcMain.handle('superadmin:getTenants', async () => {
    try {
      const supabase = getSupabaseAdmin()
      if (!supabase) {
        throw new Error('Supabase Admin Client not initialized. Are credentials missing?')
      }

      // Fetch all schools from remote Supabase
      const { data, error } = await supabase.from('ecoles').select('*').order('created_at', { ascending: false })
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error: any) {
      LoggerService.log('error', 'superadmin', 'Erreur lors de la récupération des locataires', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('superadmin:updateTenantSubscription', async (_, id: string, status: string) => {
    try {
      const supabase = getSupabaseAdmin()
      if (!supabase) {
        throw new Error('Supabase Admin Client not initialized.')
      }

      const { data: tenant, error: fetchError } = await supabase.from('ecoles').select('parametrage').eq('id', id).single()
      if (fetchError) throw fetchError

      let parametrage: any = {}
      if (typeof tenant.parametrage === 'object' && tenant.parametrage !== null) {
        parametrage = tenant.parametrage
      } else if (typeof tenant.parametrage === 'string') {
        try {
          parametrage = JSON.parse(tenant.parametrage)
        } catch (e) {}
      }

      parametrage = {
        ...parametrage,
        subscription_status: status, // 'active', 'late', 'suspended'
        subscription_updated_at: new Date().toISOString()
      }

      const { error: updateError } = await supabase.from('ecoles').update({
        parametrage: JSON.stringify(parametrage)
      }).eq('id', id)

      if (updateError) throw updateError

      return { success: true }
    } catch (error: any) {
      LoggerService.log('error', 'superadmin', "Erreur lors de la mise à jour de l'abonnement", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('superadmin:renewTenantSubscription', async (_, id: string, durationMonths: number, customEndDate?: string) => {
    try {
      const supabase = getSupabaseAdmin()
      if (!supabase) {
        throw new Error('Supabase Admin Client not initialized.')
      }

      const { data: tenant, error: fetchError } = await supabase.from('ecoles').select('parametrage').eq('id', id).single()
      if (fetchError) throw fetchError

      let parametrage: any = {}
      if (typeof tenant.parametrage === 'object' && tenant.parametrage !== null) {
        parametrage = tenant.parametrage
      } else if (typeof tenant.parametrage === 'string') {
        try {
          parametrage = JSON.parse(tenant.parametrage)
        } catch (e) {}
      }

      let newEndDate: Date
      if (customEndDate) {
        newEndDate = new Date(customEndDate)
      } else {
        const currentEnd = parametrage.subscription_end_date ? new Date(parametrage.subscription_end_date) : null
        const baseDate = currentEnd && !isNaN(currentEnd.getTime()) && currentEnd.getTime() > Date.now() ? currentEnd : new Date()
        newEndDate = new Date(baseDate)
        newEndDate.setMonth(newEndDate.getMonth() + (durationMonths || 12))
      }

      parametrage = {
        ...parametrage,
        subscription_status: 'active',
        subscription_duration_months: durationMonths || 12,
        subscription_end_date: newEndDate.toISOString(),
        subscription_updated_at: new Date().toISOString()
      }

      const { error: updateError } = await supabase.from('ecoles').update({
        parametrage: JSON.stringify(parametrage)
      }).eq('id', id)

      if (updateError) throw updateError

      return { success: true, newEndDate: newEndDate.toISOString() }
    } catch (error: any) {
      LoggerService.log('error', 'superadmin', "Erreur lors du renouvellement de l'abonnement", error)
      return { success: false, error: error.message }
    }
  })
}
