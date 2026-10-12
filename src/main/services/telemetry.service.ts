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
import { app } from 'electron'
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

  /**
   * Broadcasts an administrative command to all workstations via Supabase audit_logs
   */
  static async broadcastRemoteCommand(
    command: string,
    params: any = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const ecoleId = getActiveEcoleId()
      const payload = {
        command,
        params,
        issued_at: new Date().toISOString(),
        issued_by: os.hostname(),
        ecole_id: ecoleId
      }
      const { error } = await supabase.from('audit_logs').insert({
        action: 'station_command',
        table_name: 'telemetry',
        record_id: 'ALL',
        ecole_id: ecoleId,
        new_value: JSON.stringify(payload)
      })
      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Publishes a workstation status heartbeat to Supabase with local row counts and queue status
   */
  static async publishWorkstationHeartbeat(): Promise<boolean> {
    try {
      const stationCode = this.getStationCode()
      const hostname = os.hostname()
      const platform = `${process.platform} ${os.release()}`
      const ecoleId = getActiveEcoleId()
      let appVersion = '2.3.6'
      try {
        appVersion = app.getVersion() || '2.3.6'
      } catch {}

      // Count local active records strictly partitioned by ecole_id
      const counts: Record<string, number> = {
        students:
          (
            db
              .prepare(
                "SELECT count(*) as c FROM students WHERE deleted = 0 AND (ecole_id = ? OR (? = 'ecole_dev' AND (ecole_id IS NULL OR ecole_id = 'ecole_dev')))"
              )
              .get(ecoleId, ecoleId) as any
          )?.c || 0,
        student_payments:
          (
            db
              .prepare(
                "SELECT count(*) as c FROM student_payments WHERE deleted = 0 AND (ecole_id = ? OR (? = 'ecole_dev' AND (ecole_id IS NULL OR ecole_id = 'ecole_dev')))"
              )
              .get(ecoleId, ecoleId) as any
          )?.c || 0,
        cash_journal:
          (
            db
              .prepare(
                "SELECT count(*) as c FROM cash_journal WHERE deleted = 0 AND (ecole_id = ? OR (? = 'ecole_dev' AND (ecole_id IS NULL OR ecole_id = 'ecole_dev')))"
              )
              .get(ecoleId, ecoleId) as any
          )?.c || 0,
        users:
          (
            db
              .prepare(
                "SELECT count(*) as c FROM users WHERE deleted = 0 AND (ecole_id = ? OR (? = 'ecole_dev' AND (ecole_id IS NULL OR ecole_id = 'ecole_dev')))"
              )
              .get(ecoleId, ecoleId) as any
          )?.c || 0
      }

      // Auto-purge structural tables and false quarantines from sync_queue
      try {
        db.prepare("DELETE FROM sync_queue WHERE table_name IN ('class_subjects', 'subjects')").run()
        db.prepare("UPDATE class_subjects SET sync_status = 'synced'").run()
        db.prepare("UPDATE subjects SET sync_status = 'synced'").run()
        db.prepare(
          "DELETE FROM sync_queue WHERE status = 'quarantined' AND table_name NOT IN ('student_payments', 'cash_journal')"
        ).run()
      } catch {}

      // Count sync_queue states
      const queueCounts = db
        .prepare(
          `
        SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
        FROM sync_queue
      `
        )
        .get() as any

      const queue = {
        pending: queueCounts?.pending || 0,
        errors: queueCounts?.errors || 0,
        failed: queueCounts?.failed || 0,
        quarantined: queueCounts?.quarantined || 0
      }

      let blocked_summary: any[] = []
      if (queue.errors > 0 || queue.failed > 0 || queue.quarantined > 0) {
        try {
          blocked_summary = db
            .prepare(
              `SELECT table_name, record_id, status, error_message, created_at 
               FROM sync_queue 
               WHERE status IN ('error', 'failed', 'quarantined') 
               ORDER BY id DESC LIMIT 5`
            )
            .all()
        } catch {}
      }

      const payload = {
        station: stationCode,
        hostname,
        platform,
        app_version: appVersion,
        counts,
        queue,
        blocked_summary,
        last_sync: new Date().toISOString(),
        ecole_id: ecoleId
      }

      const { error } = await supabase.from('audit_logs').insert({
        action: 'station_heartbeat',
        table_name: 'telemetry',
        record_id: stationCode,
        ecole_id: ecoleId,
        new_value: JSON.stringify(payload)
      })

      return !error
    } catch {
      return false
    }
  }

  /**
   * Fetches latest heartbeat for all workstations along with cloud row counts for cross-station convergence comparison
   */
  static async fetchWorkstationHeartbeats(): Promise<{
    success: boolean
    cloudCounts?: Record<string, number>
    stations?: Array<{
      station: string
      hostname: string
      platform: string
      app_version: string
      last_seen: string
      counts: Record<string, number>
      queue: { pending: number; errors: number; failed: number; quarantined: number }
      queue_pending?: number
      queue_failed?: number
      queue_quarantined?: number
      blocked_summary?: any[]
      station_error_count?: number
      last_sync?: string
    }>
    error?: string
  }> {
    try {
      const ecoleId = getActiveEcoleId()

      // 1. Fetch Cloud active counts filtered by ecole_id
      let stQuery = supabase.from('students').select('*', { count: 'exact', head: true }).eq('deleted', false)
      let payQuery = supabase.from('student_payments').select('*', { count: 'exact', head: true }).eq('deleted', false)
      let cjQuery = supabase.from('cash_journal').select('*', { count: 'exact', head: true }).eq('deleted', false)
      let usrQuery = supabase.from('users').select('*', { count: 'exact', head: true }).eq('deleted', false)

      if (ecoleId && ecoleId !== 'ecole_dev') {
        stQuery = stQuery.eq('ecole_id', ecoleId)
        payQuery = payQuery.eq('ecole_id', ecoleId)
        cjQuery = cjQuery.eq('ecole_id', ecoleId)
        usrQuery = usrQuery.eq('ecole_id', ecoleId)
      }

      const [stRes, payRes, cjRes, usrRes] = await Promise.all([stQuery, payQuery, cjQuery, usrQuery])

      const cloudCounts: Record<string, number> = {
        students: stRes.count ?? 0,
        student_payments: payRes.count ?? 0,
        cash_journal: cjRes.count ?? 0,
        users: usrRes.count ?? 0
      }

      // 2. Fetch recent station_heartbeat entries from audit_logs
      let hbQuery = supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'station_heartbeat')
        .eq('table_name', 'telemetry')

      if (ecoleId && ecoleId !== 'ecole_dev') {
        hbQuery = hbQuery.eq('ecole_id', ecoleId)
      }

      const { data: logs, error } = await hbQuery.order('id', { ascending: false }).limit(100)

      if (error) {
        return { success: false, cloudCounts, error: error.message }
      }

      const latestByMachine = new Map<string, any>()
      for (const row of logs || []) {
        try {
          const parsed = JSON.parse(row.new_value)
          const machineKey = parsed.hostname || row.record_id || 'UNKNOWN'
          if (!latestByMachine.has(machineKey)) {
            const queueObj = parsed.queue || {}
            latestByMachine.set(machineKey, {
              ...parsed,
              station: parsed.station || row.record_id || machineKey,
              last_seen: parsed.last_sync || row.timestamp,
              server_recorded_at: row.timestamp,
              queue: queueObj,
              queue_pending: queueObj.pending ?? parsed.queue_pending ?? 0,
              queue_failed:
                (queueObj.failed ?? 0) + (queueObj.errors ?? 0) + (parsed.queue_failed ?? 0),
              queue_quarantined: queueObj.quarantined ?? parsed.queue_quarantined ?? 0,
              blocked_summary: parsed.blocked_summary || []
            })
          }
        } catch {
          // ignore malformed
        }
      }

      // 3. Count recent station_error incidents per station
      let errQuery = supabase
        .from('audit_logs')
        .select('record_id')
        .eq('action', 'station_error')
        .limit(300)

      if (ecoleId && ecoleId !== 'ecole_dev') {
        errQuery = errQuery.eq('ecole_id', ecoleId)
      }

      const { data: errorRows } = await errQuery

      const errorCountByStation: Record<string, number> = {}
      for (const eRow of errorRows || []) {
        const st = eRow.record_id || 'UNKNOWN'
        errorCountByStation[st] = (errorCountByStation[st] || 0) + 1
      }

      for (const obj of latestByMachine.values()) {
        obj.station_error_count =
          (errorCountByStation[obj.station] || 0) +
          (obj.hostname && obj.hostname !== obj.station
            ? errorCountByStation[obj.hostname] || 0
            : 0)
      }

      const stations = Array.from(latestByMachine.values())

      return { success: true, cloudCounts, stations }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}
