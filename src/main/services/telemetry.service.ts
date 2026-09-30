/**
 * telemetry.service.ts — Workstation Telemetry & Error Monitor ("Mouchard")
 *
 * Automatically captures sync failures, database errors, and system blockages
 * on local workstations (PC1, PC2, etc.) and uploads them to Supabase `audit_logs`.
 * Strictly partitioned by ecole_id for multi-tenant isolation.
 *
 * @module TelemetryService
 */

import os from 'os'
import db from '../database/db'
import { supabase } from './sync.service'
import { LoggerService } from './logger.service'
import { SettingsRepository } from '../database/repositories/settings.repository'

export interface WorkstationTelemetryReport {
  station: string
  hostname: string
  platform: string
  context: string
  message: string
  table_name?: string
  record_id?: string
  pending_count?: number
  error_details?: any
  timestamp: string
  ecole_id?: string
}

export function isNetworkOrOfflineError(error: any): boolean {
  if (!error) return false
  let msg = ''
  if (typeof error === 'string') {
    msg = error
  } else {
    try {
      const causeMsg = error?.cause ? error.cause.message || String(error.cause) : ''
      const detailsMsg =
        typeof error?.details === 'object' ? JSON.stringify(error.details) : error?.details || ''
      msg = `${error?.message || ''} ${error?.code || ''} ${detailsMsg} ${causeMsg} ${JSON.stringify(error)}`
    } catch {
      msg = `${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`
    }
  }

  msg = msg.toLowerCase()

  return (
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('délai d’attente') ||
    msg.includes("délai d'attente") ||
    msg.includes('offline') ||
    msg.includes('hors ligne') ||
    msg.includes('hors-ligne') ||
    msg.includes('socket hang up') ||
    msg.includes('supabase not configured') ||
    msg.includes('supabase non configuré') ||
    msg.includes('aborted') ||
    msg.includes('abort') ||
    msg.includes('the operation was aborted') ||
    msg.includes('undici') ||
    msg.includes('fetch error')
  )
}

function getActiveEcoleId(): string {
  return (
    (SettingsRepository.get('ecole_id') as string) ||
    process.env.VITE_DEFAULT_TENANT_ID ||
    'ecole_dev'
  )
}

export class TelemetryService {
  /**
   * Retrieves the current station code (e.g. 'C1', 'C2') or fallback to hostname
   */
  static getStationCode(): string {
    try {
      const explicitStation =
        (SettingsRepository.get('pos_station_code') as string | null) ||
        (SettingsRepository.get('station_id') as string | null)
      if (explicitStation && explicitStation.trim()) {
        return explicitStation.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
      }
    } catch {
      // ignore
    }
    return os.hostname() || 'PC-INCONNU'
  }

  /**
   * Reports a critical error or sync failure to local SQLite and attempts transmission to Supabase
   */
  static async reportError(
    context: string,
    message: string,
    details?: any,
    extra?: { tableName?: string; recordId?: string; pendingCount?: number }
  ): Promise<boolean> {
    const extraDetails = extra
      ? { ...(typeof details === 'object' ? details : { details }), ...extra }
      : details

    // SAFEGUARD: Do not spam cloud telemetry with normal offline network disconnections
    if (
      isNetworkOrOfflineError(message) ||
      isNetworkOrOfflineError(details) ||
      isNetworkOrOfflineError(extra)
    ) {
      LoggerService.log('info', context, `[Hors-ligne] ${message}`, extraDetails)
      return false
    }

    const ecoleId = getActiveEcoleId()

    // 1. Log locally to SQLite app_logs (persisted with resolved = 0)
    LoggerService.log('error', context, message, extraDetails, ecoleId)

    // 2. Attempt to flush pending logs (including this one) to Supabase audit_logs
    const flushResult = await this.flushPendingLogs()
    return flushResult.success
  }

  /**
   * Flushes all un-transmitted local logs (resolved = 0) from SQLite `app_logs` to Supabase `audit_logs`.
   * Preserves all logs in local SQLite forever (never deletes), and marks resolved = 1 on success.
   */
  static async flushPendingLogs(): Promise<{ success: boolean; count: number }> {
    try {
      const ecoleId = getActiveEcoleId()
      const rows = db
        .prepare(
          'SELECT * FROM app_logs WHERE (resolved = 0 OR resolved IS NULL) ORDER BY id ASC LIMIT 50'
        )
        .all() as Array<{
        id: number
        level: string
        context: string
        message: string
        details: string | null
        created_at: string
      }>

      if (!rows || rows.length === 0) {
        return { success: true, count: 0 }
      }

      const stationCode = this.getStationCode()
      const hostname = os.hostname()
      let sentCount = 0

      for (const row of rows) {
        // Ignore info/debug logs and network disconnects from cloud station_error telemetry
        if (row.level !== 'error') {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          continue
        }

        let parsedDetails: any = null
        try {
          parsedDetails = row.details ? JSON.parse(row.details) : null
        } catch {
          parsedDetails = row.details
        }

        if (isNetworkOrOfflineError(row.message) || isNetworkOrOfflineError(parsedDetails)) {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          continue
        }

        const payload: WorkstationTelemetryReport = {
          station: stationCode,
          hostname,
          platform: `${process.platform} ${os.release()}`,
          context: row.context || 'app',
          message: row.message,
          error_details: parsedDetails,
          timestamp: row.created_at || new Date().toISOString(),
          ecole_id: ecoleId
        }

        const { error } = await supabase.from('audit_logs').insert({
          action: 'station_error',
          table_name: 'telemetry',
          record_id: stationCode,
          new_value: JSON.stringify(payload),
          ecole_id: ecoleId
        })

        if (!error) {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          sentCount++
        } else {
          // If transmission fails due to network, stop loop without error spam
          if (isNetworkOrOfflineError(error.message)) {
            return { success: false, count: sentCount }
          }
          console.warn('Could not transmit queued telemetry to Supabase:', error.message)
          return { success: false, count: sentCount }
        }
      }

      return { success: true, count: sentCount }
    } catch (err) {
      if (!isNetworkOrOfflineError(err)) {
        console.warn('Telemetry flush exception:', err)
      }
      return { success: false, count: 0 }
    }
  }

  /**
   * Reports a sync blockage specifically (e.g., failed item blocking the queue)
   */
  static async reportSyncBlockage(
    tableName: string,
    recordId: string,
    errorMessage: string,
    pendingCount: number
  ): Promise<boolean> {
    if (isNetworkOrOfflineError(errorMessage)) {
      return false
    }
    return this.reportError(
      'sync_blockage',
      `Blocage d'envoi cloud sur ${tableName} (ID: ${recordId}) : ${errorMessage}`,
      { error: errorMessage },
      { tableName, recordId, pendingCount }
    )
  }

  /**
   * Fetches remote error telemetry for Superadmin dashboard
   */
  static async fetchWorkstationTelemetry(limit = 250): Promise<{
    success: boolean
    reports?: Array<{
      id: number
      station: string
      hostname: string
      context: string
      message: string
      table_name?: string
      record_id?: string
      pending_count?: number
      error_details?: string
      timestamp: string
    }>
    totalCount?: number
    error?: string
  }> {
    try {
      const ecoleId = getActiveEcoleId()
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .eq('table_name', 'telemetry')

      // If not ecole_dev or if establishment specific, filter by ecole_id
      if (ecoleId && ecoleId !== 'ecole_dev') {
        query = query.eq('ecole_id', ecoleId)
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        return { success: false, error: error.message }
      }

      const reports = (data || []).map((row: any) => {
        let parsed: any = {}
        try {
          parsed = JSON.parse(row.new_value)
        } catch {
          parsed = { message: row.new_value }
        }

        return {
          id: row.id,
          station: parsed.station || row.record_id || 'Inconnu',
          hostname: parsed.hostname || '',
          context: parsed.context || row.action,
          message: parsed.message || 'Erreur non spécifiée',
          table_name: parsed.table_name,
          record_id: parsed.record_id,
          pending_count: parsed.pending_count,
          error_details: parsed.error_details,
          timestamp: parsed.timestamp || row.created_at || row.timestamp
        }
      })

      return { success: true, reports, totalCount: count ?? reports.length }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Purges remote telemetry error logs from Supabase audit_logs
   */
  static async clearCloudTelemetry(): Promise<{ success: boolean; error?: string }> {
    try {
      const ecoleId = getActiveEcoleId()
      let query = supabase.from('audit_logs').delete().eq('table_name', 'telemetry')

      if (ecoleId && ecoleId !== 'ecole_dev') {
        query = query.eq('ecole_id', ecoleId)
      }

      const { error } = await query

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}
