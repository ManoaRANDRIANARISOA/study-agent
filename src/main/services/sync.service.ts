import { createClient } from '@supabase/supabase-js'
import db from '../database/db'
import dotenv from 'dotenv'
import path from 'path'
import * as fs from 'fs'
import { app, BrowserWindow } from 'electron' // Load env vars
import { v4 as uuidv4 } from 'uuid'
import { LoggerService } from './logger.service'
import { TelemetryService, isNetworkOrOfflineError } from './telemetry.service'
import { SettingsRepository } from '../database/repositories/settings.repository'
const isDev = !app.isPackaged
const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env')

dotenv.config({ path: envPath })

export function getActiveEcoleId(): string {
  return (
    (SettingsRepository.get('ecole_id') as string) ||
    process.env.VITE_DEFAULT_TENANT_ID ||
    'ecole_dev'
  )
}

// Supabase credentials from .env file only (no hardcoded fallbacks for security)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

let supabaseClient: any = null
let supabaseAdminClient: any = null

export function getSupabaseAdmin() {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (supabaseUrl && adminKey) {
    if (!supabaseAdminClient) {
      supabaseAdminClient = createClient(supabaseUrl, adminKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
    }
    return supabaseAdminClient
  }
  return supabase
}

export function reinitSupabaseClient(newSchema?: string) {
  const targetSchema = newSchema || process.env.VITE_SUPABASE_SCHEMA || 'public'
  const keyToUse = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (supabaseUrl && keyToUse) {
    try {
      supabaseClient = createClient(supabaseUrl, keyToUse, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        db: { schema: targetSchema }
      })
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e)
    }
  } else {
    console.warn('Supabase credentials missing. Sync will be disabled.')
  }
}

// Initialisez au démarrage
reinitSupabaseClient()

const fallbackClient: any = {
  from: () => ({
    select: () => ({ gt: () => ({ data: [], error: { message: 'Supabase not configured' } }) }),
    upsert: () => ({ error: { message: 'Supabase not configured' } }),
    update: () => ({ eq: () => ({ error: { message: 'Supabase not configured' } }) }),
    delete: () => ({ neq: () => ({ error: { message: 'Supabase not configured' } }) })
  }),
  storage: {
    getBucket: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
    createBucket: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
    from: () => ({
      upload: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } })
    })
  }
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    if (supabaseClient) {
      return supabaseClient[prop]
    }
    return fallbackClient[prop]
  }
}) as any

const SYNCABLE_TABLES = new Set([
  'students',
  'student_fees',
  'student_payments',
  'personnel',
  'time_tracking',
  'daily_attendance',
  'personnel_absences',
  'salary_advances',
  'custom_deductions',
  'cash_journal',
  'subjects',
  'grades',
  'class_subjects',
  'parent_events',
  'event_payments',
  'bus_attendance',
  'canteen_attendance',
  'users',
  'settings',
  'cash_closures'
])

export const LOCAL_ONLY_SETTINGS = new Set([
  'pos_station_code',
  'printer_name',
  'printer_copies',
  'email_logs',
  'email_last_sent_date'
])

export interface SyncProgress {
  phase: 'idle' | 'checking' | 'pushing' | 'pulling' | 'success' | 'error'
  current: number
  total: number
  percent: number
  message: string
  tableName?: string
  lastSync?: string
  pendingCount?: number
  errorCount?: number
}

let isSyncing = false

export function getIsSyncing(): boolean {
  return isSyncing
}

export function broadcastProgress(progress: SyncProgress): void {
  try {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('sync:progress', progress)
      }
    })
  } catch {
    // Ignore if window is unavailable
  }
}

/**
 * Health check to Supabase with latency measurement, 15s timeout and grace retry
 */
/**
 * Fast internet liveness check to distinguish local offline from cloud downtime
 */
async function isInternetAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch('https://1.1.1.1', {
      method: 'HEAD',
      signal: controller.signal
    }).catch(() => null)
    clearTimeout(timer)
    if (res) return true
  } catch {}

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch('https://www.google.com', {
      method: 'HEAD',
      signal: controller.signal
    }).catch(() => null)
    clearTimeout(timer)
    if (res) return true
  } catch {}

  return false
}

/**
 * Health check to Supabase with latency measurement, 15s timeout and grace retry
 */
export async function checkCloudHealth(timeoutMs: number = 15000): Promise<{
  ok: boolean
  isInternetOk?: boolean
  latencyMs?: number
  error?: string
}> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, isInternetOk: false, error: 'Identifiants Supabase absents du fichier .env' }
  }

  const performCheck = async (timeout: number) => {
    const start = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const { error } = (await (supabase
        .from('settings')
        .select('key')
        .limit(1) as any)
        .abortSignal(controller.signal)) as any

      clearTimeout(timeoutId)

      if (error) {
        return { ok: false, error: error.message || 'Erreur retournée par Supabase' }
      }

      return { ok: true, latencyMs: Date.now() - start }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }

  let result = await performCheck(timeoutMs)
  // If first check failed due to timeout/abort/fetch error on weak connection, try 1 grace retry before declaring offline
  if (
    !result.ok &&
    (result.error?.toLowerCase().includes('abort') ||
      result.error?.toLowerCase().includes('timeout') ||
      result.error?.toLowerCase().includes('fetch'))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    const retryResult = await performCheck(10000)
    if (retryResult.ok) {
      return { ...retryResult, isInternetOk: true }
    }
  }

  if (!result.ok) {
    const hasInternet = await isInternetAvailable()
    if (hasInternet) {
      return {
        ok: false,
        isInternetOk: true,
        latencyMs: undefined,
        error: 'Serveur Cloud temporairement inaccessible (votre connexion internet fonctionne)'
      }
    } else {
      return {
        ok: false,
        isInternetOk: false,
        latencyMs: undefined,
        error: 'Aucune connexion internet détectée sur ce poste'
      }
    }
  }

  return { ok: true, isInternetOk: true, latencyMs: result.latencyMs }
}

/**
 * Retrieve queue status
 */
export function getSyncQueueStatus(): {
  pendingCount: number
  errorCount: number
  failedCount: number
  quarantinedCount: number
  lastSyncTime: string | null
} {
  try {
    const counts = db
      .prepare(
        `SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
         FROM sync_queue`
      )
      .get() as
      | {
          pending: number | null
          errors: number | null
          failed: number | null
          quarantined: number | null
        }
      | undefined

    const settingRow = db
      .prepare("SELECT value FROM settings WHERE key = 'last_sync_time'")
      .get() as { value: string } | undefined

    let lastSyncTime: string | null = null
    if (settingRow && settingRow.value) {
      try {
        lastSyncTime = JSON.parse(settingRow.value)
      } catch {
        lastSyncTime = settingRow.value
      }
    }

    return {
      pendingCount: counts?.pending || 0,
      errorCount: counts?.errors || 0,
      failedCount: counts?.failed || 0,
      quarantinedCount: counts?.quarantined || 0,
      lastSyncTime
    }
  } catch {
    return { pendingCount: 0, errorCount: 0, failedCount: 0, quarantinedCount: 0, lastSyncTime: null }
  }
}

/**
 * Retrieve failed, error or quarantined queue items
 */
export function getSyncQueueErrors(limit = 100) {
  try {
    // Auto-heal seed admin or local user records blocked by cloud RLS
    try {
      db.prepare(
        `UPDATE sync_queue
         SET status = 'synced', error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE table_name = 'users' AND status = 'error' AND (error_message LIKE '%row-level security%' OR error_message LIKE '%42501%')`
      ).run()
    } catch {}

    return db
      .prepare(
        `SELECT id, table_name, record_id, action as operation, action, status, error_message as last_error, error_message, created_at, COALESCE(updated_at, created_at) as updated_at
         FROM sync_queue
         WHERE status IN ('error', 'failed', 'skipped', 'quarantined')
         ORDER BY id DESC LIMIT ?`
      )
      .all(limit)
  } catch (err) {
    console.error('getSyncQueueErrors error:', err)
    return []
  }
}

/**
 * Reset all failed, error, and skipped records to pending for safe retry
 */
export function retrySyncErrors(): { changes: number } {
  try {
    const res = db
      .prepare(
        `UPDATE sync_queue
         SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('error', 'failed', 'skipped', 'quarantined')`
      )
      .run()
    return { changes: res.changes }
  } catch {
    return { changes: 0 }
  }
}

/**
 * Quarantines all failed/skipped queue items, transmits error telemetry to Supabase,
 * and immediately triggers push for the remaining healthy items.
 */
export async function quarantineAndUnblockQueue(): Promise<{
  success: boolean
  quarantinedCount: number
  remainingPending: number
  message: string
}> {
  try {
    const failedItems = db
      .prepare(
        `SELECT id, table_name, record_id, error_message 
         FROM sync_queue 
         WHERE status IN ('error', 'failed', 'skipped')`
      )
      .all() as { id: number; table_name: string; record_id: string; error_message: string | null }[]

    const currentStatus = getSyncQueueStatus()

    // 1. Report each failed item to Supabase audit_logs via TelemetryService
    for (const item of failedItems) {
      await TelemetryService.reportSyncBlockage(
        item.table_name,
        item.record_id,
        item.error_message || 'Blocage persistant isolé par déblocage forcé',
        currentStatus.pendingCount
      )
    }

    // 2. Mark blocking rows as 'quarantined'
    const res = db
      .prepare(
        `UPDATE sync_queue 
         SET status = 'quarantined', updated_at = CURRENT_TIMESTAMP 
         WHERE status IN ('error', 'failed', 'skipped')`
      )
      .run()

    // 3. Immediately trigger cloud sync for remaining healthy records
    syncWithCloud(false).catch((e) => console.error('Auto sync after quarantine error:', e))

    const newStatus = getSyncQueueStatus()

    return {
      success: true,
      quarantinedCount: res.changes,
      remainingPending: newStatus.pendingCount,
      message: `${res.changes} élément(s) bloquant(s) mis en quarantaine. ${newStatus.pendingCount} élément(s) sains en cours de synchronisation.`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      quarantinedCount: 0,
      remainingPending: 0,
      message: `Erreur lors de la mise en quarantaine : ${msg}`
    }
  }
}

export interface ReconciliationItem {
  id: number
  table_name: string
  record_id: string
  action: string
  status: string
  error_message: string | null
  receipt_number?: string
  amount?: number
  date?: string
  created_by?: string
  student_id?: string
  student_name?: string
  class_name?: string
  description?: string
  created_at: string
}

/**
 * Retrieve all items in error, failed, or quarantined status for visual human reconciliation
 * Multi-tenant safe: checks ecole_id when joining local tables.
 */
export function getReconciliationItems(): ReconciliationItem[] {
  try {
    const tenantId = getActiveEcoleId()
    const rows = db
      .prepare(
        `SELECT id, table_name, record_id, action, status, error_message, data, created_at
         FROM sync_queue
         WHERE status IN ('error', 'failed', 'quarantined')
           AND table_name IN ('student_payments', 'cash_journal')
         ORDER BY id DESC LIMIT 100`
      )
      .all() as Array<{
        id: number
        table_name: string
        record_id: string
        action: string
        status: string
        error_message: string | null
        data: string
        created_at: string
      }>

    const items: ReconciliationItem[] = []

    for (const r of rows) {
      let parsedData: any = {}
      try {
        parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {}
      } catch {
        parsedData = {}
      }

      let receiptNumber = parsedData.receipt_number
      let amount = parsedData.amount
      let date = parsedData.payment_date || parsedData.transaction_date || parsedData.created_at
      let createdBy = parsedData.created_by
      let studentId = parsedData.student_id || parsedData.related_student_id
      let studentName: string | undefined
      let className: string | undefined
      let description = parsedData.description || parsedData.notes

      // If missing from payload, inspect local SQLite table directly
      if (r.table_name === 'student_payments') {
        const localPay = db
          .prepare(
            'SELECT receipt_number, amount, payment_date, created_by, student_id FROM student_payments WHERE id = ?'
          )
          .get(r.record_id) as any
        if (localPay) {
          receiptNumber = receiptNumber || localPay.receipt_number
          amount = amount !== undefined ? amount : localPay.amount
          date = date || localPay.payment_date
          createdBy = createdBy || localPay.created_by
          studentId = studentId || localPay.student_id
        }
      } else if (r.table_name === 'cash_journal') {
        const localCj = db
          .prepare(
            'SELECT receipt_number, amount, transaction_date, created_by, related_student_id, description FROM cash_journal WHERE id = ?'
          )
          .get(r.record_id) as any
        if (localCj) {
          receiptNumber = receiptNumber || localCj.receipt_number
          amount = amount !== undefined ? amount : localCj.amount
          date = date || localCj.transaction_date
          createdBy = createdBy || localCj.created_by
          studentId = studentId || localCj.related_student_id
          description = description || localCj.description
        }
      }

      if (studentId) {
        let studentQuery = 'SELECT first_name, last_name, class as class_name FROM students WHERE id = ?'
        const studentParams: any[] = [studentId]
        if (tenantId && tenantId !== 'ecole_dev') {
          studentQuery += ' AND (ecole_id = ? OR ecole_id IS NULL)'
          studentParams.push(tenantId)
        }
        const localStudent = db.prepare(studentQuery).get(...studentParams) as any
        if (localStudent) {
          studentName = `${localStudent.first_name || ''} ${localStudent.last_name || ''}`.trim()
          className = localStudent.class_name
        } else {
          studentName = `Élève ID: ${studentId} (Introuvable)`
        }
      }

      items.push({
        id: r.id,
        table_name: r.table_name,
        record_id: r.record_id,
        action: r.action,
        status: r.status,
        error_message: r.error_message,
        receipt_number: receiptNumber,
        amount,
        date,
        created_by: createdBy,
        student_id: studentId,
        student_name: studentName,
        class_name: className,
        description,
        created_at: r.created_at
      })
    }

    return items
  } catch (err) {
    console.error('getReconciliationItems error:', err)
    return []
  }
}

/**
 * Re-links an orphan payment or cash_journal entry to an existing student
 * Strictly partitioned by ecole_id.
 */
export function reconcileAttachStudent(
  queueId: number,
  targetStudentId: string
): { success: boolean; error?: string } {
  try {
    const tenantId = getActiveEcoleId()
    const queueItem = db
      .prepare('SELECT * FROM sync_queue WHERE id = ?')
      .get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement de file introuvable' }
    }

    let studentSql = 'SELECT id, first_name, last_name FROM students WHERE id = ? AND deleted = 0'
    const studentParams: any[] = [targetStudentId]
    if (tenantId && tenantId !== 'ecole_dev') {
      studentSql += ' AND (ecole_id = ? OR ecole_id IS NULL)'
      studentParams.push(tenantId)
    }
    const student = db.prepare(studentSql).get(...studentParams) as any
    if (!student) {
      return { success: false, error: 'Élève cible introuvable dans cet établissement' }
    }

    const nowIso = new Date().toISOString()

    if (queueItem.table_name === 'student_payments') {
      db.prepare(
        'UPDATE student_payments SET student_id = ?, sync_status = "pending", updated_at = ? WHERE id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)

      // Also update linked cash_journal if exists
      db.prepare(
        'UPDATE cash_journal SET related_student_id = ?, sync_status = "pending", updated_at = ? WHERE related_payment_id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)
    } else if (queueItem.table_name === 'cash_journal') {
      db.prepare(
        'UPDATE cash_journal SET related_student_id = ?, sync_status = "pending", updated_at = ? WHERE id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)
    }

    // Update queue item payload
    let parsedData: any = {}
    try {
      parsedData = JSON.parse(queueItem.data || '{}')
    } catch {
      parsedData = {}
    }

    if (queueItem.table_name === 'cash_journal') {
      parsedData.related_student_id = targetStudentId
    } else {
      parsedData.student_id = targetStudentId
    }
    parsedData.updated_at = nowIso
    if (tenantId && !parsedData.ecole_id) {
      parsedData.ecole_id = tenantId
    }

    db.prepare(
      `UPDATE sync_queue
       SET data = ?, status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(JSON.stringify(parsedData), queueId)

    // Audit log in settings_history
    try {
      db.prepare(
        `INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
         VALUES (?, ?, ?, 'reconciliation_attach', CURRENT_TIMESTAMP)`
      ).run(
        `reconciliation:${queueItem.table_name}:${queueItem.record_id}`,
        queueItem.data,
        JSON.stringify(parsedData)
      )
    } catch {}

    // Immediately trigger sync
    syncWithCloud().catch((e) => console.error('Auto sync after attach error:', e))

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Reconciles an orphan entry by creating the missing student record first
 * Multi-tenant safe: injects ecole_id.
 */
export function reconcileCreateMissingStudent(
  queueId: number,
  studentData: {
    first_name: string
    last_name: string
    class_name: string
    registration_number?: string
  }
): { success: boolean; error?: string } {
  try {
    const tenantId = getActiveEcoleId()
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement de file introuvable' }
    }

    const newStudentId = uuidv4()
    const nowIso = new Date().toISOString()
    const currentYear = new Date().getFullYear().toString()
    const regNum = studentData.registration_number || `${currentYear}-${Math.floor(10000 + Math.random() * 90000)}`
    const studentClass = studentData.class_name.trim()

    // 1. Insert new student locally with ecole_id
    db.prepare(`
      INSERT INTO students (
        id, registration_number, first_name, last_name, class,
        enrollment_date, status, active, deleted, sync_status, ecole_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, date('now'), 'active', 1, 0, 'pending', ?, ?, ?)
    `).run(
      newStudentId,
      regNum,
      studentData.first_name.trim(),
      studentData.last_name.trim(),
      studentClass,
      tenantId,
      nowIso,
      nowIso
    )

    // 2. Queue student creation so parent is pushed before child
    addToSyncQueue('students', newStudentId, 'create', {
      id: newStudentId,
      registration_number: regNum,
      first_name: studentData.first_name.trim(),
      last_name: studentData.last_name.trim(),
      class: studentClass,
      enrollment_date: nowIso.split('T')[0],
      status: 'active',
      active: 1,
      deleted: 0,
      ecole_id: tenantId,
      updated_at: nowIso
    })

    // 3. Attach orphan payment/cash to this new student
    return reconcileAttachStudent(queueId, newStudentId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Reclassifies an orphan student payment or cash item into a general cash transaction
 */
export function reconcileConvertToGeneralCash(
  queueId: number
): { success: boolean; error?: string } {
  try {
    const tenantId = getActiveEcoleId()
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement introuvable' }
    }

    const nowIso = new Date().toISOString()

    if (queueItem.table_name === 'cash_journal') {
      db.prepare(`
        UPDATE cash_journal 
        SET related_student_id = NULL, department = 'general', sync_status = 'pending', updated_at = ?
        WHERE id = ?
      `).run(nowIso, queueItem.record_id)

      let parsedData: any = {}
      try {
        parsedData = JSON.parse(queueItem.data || '{}')
      } catch {}
      parsedData.related_student_id = null
      parsedData.department = 'general'
      parsedData.updated_at = nowIso
      if (tenantId && !parsedData.ecole_id) parsedData.ecole_id = tenantId

      db.prepare(`
        UPDATE sync_queue
        SET data = ?, status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(parsedData), queueId)
    } else if (queueItem.table_name === 'student_payments') {
      const localPay = db.prepare('SELECT * FROM student_payments WHERE id = ?').get(queueItem.record_id) as any
      if (localPay) {
        // Create matching general cash journal entry
        const cashId = uuidv4()
        db.prepare(`
          INSERT INTO cash_journal (
            id, transaction_date, amount, transaction_type, category,
            description, created_by, department, receipt_number, sync_status, ecole_id, created_at, updated_at
          ) VALUES (?, ?, ?, 'income', 'divers', ?, ?, 'general', ?, 'pending', ?, ?, ?)
        `).run(
          cashId,
          localPay.payment_date || nowIso.split('T')[0],
          localPay.amount,
          `Recette diverse réconciliée (Reçu: ${localPay.receipt_number || 'N/A'})`,
          localPay.created_by || 'Système',
          localPay.receipt_number || null,
          tenantId,
          nowIso,
          nowIso
        )

        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: localPay.payment_date || nowIso.split('T')[0],
          amount: localPay.amount,
          transaction_type: 'income',
          category: 'divers',
          description: `Recette diverse réconciliée (Reçu: ${localPay.receipt_number || 'N/A'})`,
          created_by: localPay.created_by || 'Système',
          department: 'general',
          receipt_number: localPay.receipt_number || null,
          ecole_id: tenantId,
          updated_at: nowIso
        })

        // Soft-delete the orphan payment record
        db.prepare('UPDATE student_payments SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ?').run(
          nowIso,
          queueItem.record_id
        )

        db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueId)
      }
    }

    // Auto-trigger sync
    syncWithCloud().catch((e) => console.error('Auto sync after convert error:', e))

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Discards an irrecoverable orphan queue item with full audit traceability
 */
export function reconcileDiscardOrphan(
  queueId: number,
  reason: string
): { success: boolean; error?: string } {
  try {
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement introuvable' }
    }

    // Save into settings_history
    try {
      db.prepare(
        `INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
         VALUES (?, ?, ?, 'reconciliation_discard', CURRENT_TIMESTAMP)`
      ).run(
        `reconciliation:discarded:${queueItem.table_name}:${queueItem.record_id}`,
        queueItem.data,
        JSON.stringify({ reason, timestamp: new Date().toISOString() })
      )
    } catch {}

    // Mark deleted in local table
    try {
      db.prepare(`UPDATE ${queueItem.table_name} SET deleted = 1, sync_status = 'synced' WHERE id = ?`).run(
        queueItem.record_id
      )
    } catch {}

    // Remove from sync_queue
    db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueId)

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Compaction de la file d'attente (Norme industrielle Outbox) :
 * Élimine tous les doublons dans sync_queue en ne conservant que l'entrée la plus récente
 * pour chaque couple (table_name, record_id). Empêche tout gonflement artificiel de la file.
 */
export function compactSyncQueue(): { deletedCount: number } {
  try {
    // 1. Purge all structural tables (class_subjects, subjects) from sync_queue
    db.prepare("DELETE FROM sync_queue WHERE table_name IN ('class_subjects', 'subjects')").run()
    db.prepare("UPDATE class_subjects SET sync_status = 'synced'").run()
    db.prepare("UPDATE subjects SET sync_status = 'synced'").run()

    // 2. Purge any non-financial items mistakenly quarantined
    db.prepare("DELETE FROM sync_queue WHERE status = 'quarantined' AND table_name NOT IN ('student_payments', 'cash_journal')").run()

    // 3. Deduplicate active entries per (table_name, record_id)
    const info = db.prepare(`
      DELETE FROM sync_queue 
      WHERE status IN ('pending', 'error', 'failed', 'quarantined')
        AND id NOT IN (
          SELECT MAX(id) FROM sync_queue 
          WHERE status IN ('pending', 'error', 'failed', 'quarantined')
          GROUP BY table_name, record_id
        )
    `).run()
    if (info.changes > 0) {
      console.log(`[Outbox Compaction] Purged ${info.changes} duplicate queue rows across stations.`)
    }
    return { deletedCount: info.changes }
  } catch (err) {
    console.warn('[Outbox Compaction] Error compacting queue:', err)
    return { deletedCount: 0 }
  }
}

/**
 * Add a record to the local sync queue (Norme ESN Idempotente).
 * S'il existe déjà une écriture non finalisée pour cet enregistrement, elle est mise à jour
 * avec le dernier payload au lieu de créer un doublon dans la file.
 */
export function addToSyncQueue(
  tableName: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  data: any
): void {
  if (!SYNCABLE_TABLES.has(tableName)) {
    console.error(`Rejected unauthorized table for sync: ${tableName}`)
    return
  }
  try {
    const existing = db
      .prepare(
        `SELECT id, action FROM sync_queue 
         WHERE table_name = ? AND record_id = ? AND status IN ('pending', 'error', 'failed', 'quarantined')
         ORDER BY id DESC LIMIT 1`
      )
      .get(tableName, recordId) as { id: number; action: string } | undefined

    if (existing) {
      // Conserver l'action 'create' initiale si une mise à jour intervient avant l'envoi cloud
      const effectiveAction = existing.action === 'create' && action === 'update' ? 'create' : action
      db.prepare(
        `UPDATE sync_queue 
         SET action = ?, data = ?, status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(effectiveAction, JSON.stringify(data), existing.id)

      // Purger tout résidu orphelin pour ce record
      db.prepare(
        `DELETE FROM sync_queue 
         WHERE table_name = ? AND record_id = ? AND id != ? AND status IN ('pending', 'error', 'failed', 'quarantined')`
      ).run(tableName, recordId, existing.id)
    } else {
      db.prepare(
        `INSERT INTO sync_queue (table_name, record_id, action, data, status, updated_at)
         VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
      ).run(tableName, recordId, action, JSON.stringify(data))
    }

    // Broadcast updated pending count to UI
    const status = getSyncQueueStatus()
    broadcastProgress({
      phase: 'idle',
      current: 0,
      total: status.pendingCount,
      percent: 0,
      message: `${status.pendingCount} modification(s) en attente`,
      pendingCount: status.pendingCount,
      errorCount: status.errorCount + status.failedCount
    })
  } catch (error) {
    console.error('Error adding to sync queue:', error)
  }
}

/**
 * Auto-Heal Outbox: Scans local tables for records marked sync_status = 'pending'
 * that do not have an active entry in sync_queue. This self-healing routine ensures
 * that any record modified offline, in older versions, or during unqueued transactions
 * is automatically enqueued and pushed. Multi-tenant aware.
 */
export function reconcilePendingOutbox(): number {
  let enqueuedCount = 0

  // 1. Compacter d'abord la file d'attente pour éliminer les doublons accumulés
  compactSyncQueue()

  // 2. Réévaluer les éléments passés en 'failed' pour leur donner une chance d'auto-guérison
  try {
    const failedRows = db
      .prepare("SELECT count(*) as count FROM sync_queue WHERE status = 'failed'")
      .get() as { count: number }
    if (failedRows && failedRows.count > 0) {
      db.prepare(`
        UPDATE sync_queue 
        SET status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP 
        WHERE status = 'failed'
      `).run()
      console.log(`[Auto-Heal Outbox] Reset ${failedRows.count} failed queue items to pending for auto-healing retry.`)
    }
  } catch (resetErr) {
    console.warn('[Auto-Heal Outbox] Could not reset failed queue items:', resetErr)
  }

  const tables = [
    'users',
    'students',
    'student_fees',
    'student_payments',
    'cash_journal',
    'personnel',
    'subjects',
    'grades',
    'class_subjects',
    'assessments',
    'parent_events',
    'event_payments',
    'bus_attendance',
    'canteen_attendance',
    'cash_closures'
  ]

  const tenantId = getActiveEcoleId()

  const lastSyncSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'last_sync_time'")
    .get() as { value: string } | undefined
  let lastSyncIso: string | null = null
  if (lastSyncSetting?.value) {
    try {
      const parsed = JSON.parse(lastSyncSetting.value)
      lastSyncIso = typeof parsed === 'string' ? parsed : lastSyncSetting.value
    } catch {
      lastSyncIso = lastSyncSetting.value
    }
  }

  for (const table of tables) {
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[]
      const hasSyncStatus = tableInfo.some((col) => col.name === 'sync_status')
      if (!hasSyncStatus) continue
      const hasEcoleId = tableInfo.some((col) => col.name === 'ecole_id')
      const hasUpdatedAt = tableInfo.some((col) => col.name === 'updated_at')
      const hasCreatedAt = tableInfo.some((col) => col.name === 'created_at')

      // 1. Auto-heal stale legacy pending markers:
      // If a row has sync_status = 'pending' but its updated_at is older than last_sync_time,
      // and it is NOT currently in sync_queue, it was touched by an old migration or DDL default.
      // Mark it 'synced' to prevent phantom outbox flooding.
      if (lastSyncIso && hasUpdatedAt) {
        try {
          db.prepare(
            `UPDATE ${table} 
             SET sync_status = 'synced' 
             WHERE sync_status = 'pending' 
               AND (updated_at <= ? OR (updated_at IS NULL AND ${hasCreatedAt ? 'created_at <= ?' : '1=1'}))
               AND id NOT IN (
                 SELECT record_id FROM sync_queue 
                 WHERE table_name = ? AND status IN ('pending', 'error', 'quarantined', 'failed')
               )`
          ).run(...(hasCreatedAt ? [lastSyncIso, lastSyncIso, table] : [lastSyncIso, table]))
        } catch {}
      }

      let query = `
        SELECT * FROM ${table} 
        WHERE sync_status = 'pending' 
          AND id NOT IN (
            SELECT record_id FROM sync_queue 
            WHERE table_name = ? AND status IN ('pending', 'error', 'quarantined', 'failed')
          )
      `
      const params: any[] = [table]
      if (lastSyncIso && hasUpdatedAt) {
        query += ` AND (updated_at > ? OR (updated_at IS NULL AND ${hasCreatedAt ? 'created_at > ?' : '1=1'}))`
        params.push(lastSyncIso)
        if (hasCreatedAt) params.push(lastSyncIso)
      }
      if (hasEcoleId && tenantId && tenantId !== 'ecole_dev') {
        query += ` AND (ecole_id = ? OR ecole_id IS NULL)`
        params.push(tenantId)
      }
      query += ` LIMIT 150`

      const pendingRows = db.prepare(query).all(...params) as any[]

      for (const row of pendingRows) {
        const action = row.deleted ? 'delete' : 'update'
        const payload = { ...row }
        delete payload.sync_status
        if (hasEcoleId && !payload.ecole_id && tenantId) {
          payload.ecole_id = tenantId
        }
        addToSyncQueue(table, row.id, action, payload)
        enqueuedCount++
      }
    } catch (err) {
      console.warn(`[Auto-Heal Outbox] Could not reconcile pending rows for table ${table}:`, err)
    }
  }

  if (enqueuedCount > 0) {
    console.log(`[Auto-Heal Outbox] Discovered and enqueued ${enqueuedCount} unqueued pending record(s) for cloud synchronization.`)
  }
  return enqueuedCount
}

/**
 * Deep Convergence Engine (Norme ESN Snapshot Parity) :
 * Réaligne de force la base locale avec le Cloud Supabase pour l'établissement actif :
 * - Propage les tombstones distants (enregistrements supprimés sur d'autres postes)
 * - Récupère les élèves actifs manquants
 * - Aligne les identifiants de matières (subjects)
 * - Purge les fausses quarantaines et compacte l'outbox
 */
export async function runDeepConvergence(): Promise<{
  success: boolean
  aligned: {
    studentsDeleted: number
    paymentsDeleted: number
    cashDeleted: number
    studentsCreated: number
    subjectsAligned: number
    queueCompacted: number
  }
  error?: string
}> {
  const result = {
    studentsDeleted: 0,
    paymentsDeleted: 0,
    cashDeleted: 0,
    studentsCreated: 0,
    subjectsAligned: 0,
    queueCompacted: 0
  }

  if (!supabaseUrl || !supabaseKey) {
    return { success: false, aligned: result, error: 'Supabase non configuré' }
  }

  const tenantId = getActiveEcoleId()

  try {
    // 0. Compact local outbox queue first
    const compRes = compactSyncQueue()
    result.queueCompacted = compRes.deletedCount

    // 1. Align deleted tombstones from Supabase
    let stQ = supabase.from('students').select('id, updated_at').eq('deleted', true)
    let payQ = supabase.from('student_payments').select('id, updated_at').eq('deleted', true)
    let cjQ = supabase.from('cash_journal').select('id, updated_at').eq('deleted', true)
    let subQ = supabase.from('subjects').select('id, updated_at').eq('deleted', true)

    if (tenantId && tenantId !== 'ecole_dev') {
      stQ = stQ.eq('ecole_id', tenantId)
      payQ = payQ.eq('ecole_id', tenantId)
      cjQ = cjQ.eq('ecole_id', tenantId)
    }

    const [delStudentsRes, delPaymentsRes, delCashRes, delSubsRes] = await Promise.all([
      stQ,
      payQ,
      cjQ,
      subQ
    ])

    const applyTombstones = db.transaction(() => {
      for (const s of delStudentsRes.data || []) {
        const info = db.prepare('UPDATE students SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ? AND deleted = 0').run(s.updated_at || new Date().toISOString(), s.id)
        result.studentsDeleted += info.changes
      }
      for (const p of delPaymentsRes.data || []) {
        const info = db.prepare('UPDATE student_payments SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ? AND deleted = 0').run(p.updated_at || new Date().toISOString(), p.id)
        result.paymentsDeleted += info.changes
      }
      for (const cj of delCashRes.data || []) {
        const info = db.prepare('UPDATE cash_journal SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ? AND deleted = 0').run(cj.updated_at || new Date().toISOString(), cj.id)
        result.cashDeleted += info.changes
      }
      for (const sub of delSubsRes.data || []) {
        const info = db.prepare('UPDATE subjects SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ? AND deleted = 0').run(sub.updated_at || new Date().toISOString(), sub.id)
        result.subjectsAligned += info.changes
      }
    })
    applyTombstones()

    // 2. Fetch missing active students from Supabase (deleted = false) that do not exist locally
    let remoteStQ = supabase.from('students').select('*').eq('deleted', false)
    if (tenantId && tenantId !== 'ecole_dev') {
      remoteStQ = remoteStQ.eq('ecole_id', tenantId)
    }
    const { data: remoteActiveStudents } = await remoteStQ

    if (remoteActiveStudents && remoteActiveStudents.length > 0) {
      const insertMissingStudents = db.transaction(() => {
        for (const st of remoteActiveStudents) {
          const local = db.prepare('SELECT id, deleted FROM students WHERE id = ?').get(st.id) as any
          if (!local) {
            const { search_text, ...recordToSave } = st
            recordToSave.sync_status = 'synced'
            recordToSave.deleted = 0
            if (tenantId && !recordToSave.ecole_id) recordToSave.ecole_id = tenantId
            const cols = Object.keys(recordToSave)
            const placeholders = cols.map(() => '?').join(', ')
            const values = cols.map((k) => {
              const v = recordToSave[k]
              if (typeof v === 'boolean') return v ? 1 : 0
              if (typeof v === 'object' && v !== null) return JSON.stringify(v)
              return v
            })
            db.prepare(`INSERT OR REPLACE INTO students (${cols.join(', ')}) VALUES (${placeholders})`).run(...values)
            result.studentsCreated++
          } else if (local.deleted === 1) {
            db.prepare('UPDATE students SET deleted = 0, sync_status = "synced" WHERE id = ?').run(st.id)
            result.studentsCreated++
          }
        }
      })
      insertMissingStudents()
    }

    // 2.5 Align local subjects and class_subjects with Supabase
    const { data: remoteSubjects } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('deleted', false)

    if (remoteSubjects && remoteSubjects.length > 0) {
      const alignSubjectsTx = db.transaction(() => {
        for (const remSub of remoteSubjects) {
          const localSameName = db
            .prepare('SELECT id, name FROM subjects WHERE lower(trim(name)) = lower(trim(?)) AND id != ?')
            .get(remSub.name, remSub.id) as any
          if (localSameName) {
            const oldId = localSameName.id
            const newId = remSub.id
            console.log(`[Deep Convergence] Remapping local subject '${localSameName.name}' from ${oldId} to ${newId}`)
            db.prepare('UPDATE subjects SET id = ?, sync_status = "synced" WHERE id = ?').run(newId, oldId)
            db.prepare('UPDATE class_subjects SET subject_id = ? WHERE subject_id = ?').run(newId, oldId)
            db.prepare('UPDATE grades SET subject_id = ? WHERE subject_id = ?').run(newId, oldId)
            db.prepare('DELETE FROM sync_queue WHERE table_name = "subjects" AND record_id = ?').run(oldId)
            result.subjectsAligned++
          }
        }
      })
      alignSubjectsTx()
    }

    // 3. Purge structural tables from sync_queue and ensure synced status
    db.prepare(`DELETE FROM sync_queue WHERE table_name IN ('class_subjects', 'subjects')`).run()
    db.prepare(`UPDATE class_subjects SET sync_status = 'synced'`).run()
    db.prepare(`UPDATE subjects SET sync_status = 'synced'`).run()

    // 3.5 Purge non-financial items mistakenly quarantined
    db.prepare(`DELETE FROM sync_queue WHERE status = 'quarantined' AND table_name NOT IN ('student_payments', 'cash_journal')`).run()

    // 4. Publish heartbeat immediately
    await TelemetryService.publishWorkstationHeartbeat().catch(() => {})

    console.log(`[Deep Convergence] Completed successfully:`, result)
    return { success: true, aligned: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Deep Convergence] Error:', err)
    return { success: false, aligned: result, error: msg }
  }
}

/**
 * Checks for and executes remote admin commands broadcast from the central dashboard
 */
export async function executeRemoteCommandsIfAny(): Promise<boolean> {
  if (!supabaseUrl || !supabaseKey) return false
  try {
    const tenantId = getActiveEcoleId()
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'station_command')
      .eq('table_name', 'telemetry')

    if (tenantId && tenantId !== 'ecole_dev') {
      query = query.eq('ecole_id', tenantId)
    }

    const { data: cmdLogs } = await query
      .order('id', { ascending: false })
      .limit(1)

    if (!cmdLogs || cmdLogs.length === 0) return false

    const latestCmd = cmdLogs[0]
    const lastExecutedRow = db
      .prepare("SELECT value FROM settings WHERE key = 'last_executed_remote_command_id'")
      .get() as { value?: string } | undefined
    const lastExecutedId = Number(lastExecutedRow?.value || 0)

    if (latestCmd.id > lastExecutedId) {
      let parsed: any = {}
      try {
        parsed = typeof latestCmd.new_value === 'string' ? JSON.parse(latestCmd.new_value) : latestCmd.new_value
      } catch {
        parsed = {}
      }

      console.log(`[Remote Command] Discovered pending command #${latestCmd.id}: ${parsed.command}`)

      if (parsed.command === 'reconcile_all') {
        await runDeepConvergence()
        reconcilePendingOutbox()
      }

      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('last_executed_remote_command_id', ?, CURRENT_TIMESTAMP)"
      ).run(String(latestCmd.id))

      return true
    }
  } catch (cmdErr) {
    console.warn('[Remote Command] Error polling command:', cmdErr)
  }
  return false
}

// Main sync function (called every 5 minutes if online or manually triggered)
export async function syncWithCloud(forceFullSync: boolean = false) {
  if (isSyncing) {
    return { success: false, reason: 'already_syncing' }
  }

  // Poll and execute any remote command from admin
  await executeRemoteCommandsIfAny().catch(() => {})

  if (!supabaseUrl || !supabaseKey) {
    broadcastProgress({
      phase: 'error',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Supabase non configuré (.env manquant)'
    })
    return { success: false, reason: 'config_missing' }
  }

  isSyncing = true

  try {
    const queueStatus = getSyncQueueStatus()
    broadcastProgress({
      phase: 'checking',
      current: 0,
      total: queueStatus.pendingCount,
      percent: 5,
      message: 'Vérification de la connexion au cloud Supabase...',
      pendingCount: queueStatus.pendingCount,
      errorCount: queueStatus.errorCount + queueStatus.failedCount
    })

    const health = await checkCloudHealth()
    if (!health.ok) {
      broadcastProgress({
        phase: 'error',
        current: 0,
        total: queueStatus.pendingCount,
        percent: 0,
        message: `Connexion impossible : ${health.error}`,
        pendingCount: queueStatus.pendingCount,
        errorCount: queueStatus.errorCount + queueStatus.failedCount
      })
      isSyncing = false
      return { success: false, error: health.error }
    }

    // Authenticate as the Tenant's Service Account to bypass RLS isolation
    const syncEmail = process.env.VITE_SYNC_EMAIL
    const syncPassword = process.env.VITE_SYNC_PASSWORD
    if (syncEmail && syncPassword) {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: syncEmail,
        password: syncPassword
      })
      if (authError) {
        LoggerService.log('error', 'sync', 'Supabase Sync Auth Error', authError.message)
        broadcastProgress({
          phase: 'error',
          current: 0,
          total: 0,
          percent: 0,
          message: `Erreur d'authentification Supabase : ${authError.message}`
        })
        isSyncing = false
        return { success: false, error: authError.message }
      }
    }

    // 1. PULL FIRST: Get remote changes from cloud first to absorb fresh changes from other workstations
    await pullRemoteChanges(forceFullSync)

    // 2. SAFEGUARD: If full recovery was forced by user, STOP HERE!
    // Full recovery is strictly unidirectional (Cloud -> Local). Never push during a forced full recovery!
    if (forceFullSync) {
      console.log('[Sync Engine] Récupération complète unidirectionnelle achevée. Arrêt préventif avant push.')
      broadcastProgress({
        phase: 'idle',
        current: 100,
        total: 100,
        percent: 100,
        message: 'Récupération complète du Cloud terminée avec succès.',
        lastSync: new Date().toISOString()
      })
      isSyncing = false
      return { success: true }
    }

    // 3. Auto-heal Outbox: Scan for genuine unqueued offline modifications AFTER pull has refreshed local DB
    reconcilePendingOutbox()

    // 4. PUSH: Send genuine local changes to cloud with Anti-Regression Guard
    await pushLocalChanges()

    // Flush any pending error/sync telemetry to Supabase audit_logs
    await TelemetryService.flushPendingLogs().catch(() => {})

    // Publish workstation status heartbeat to cloud for real-time multi-station convergence
    await TelemetryService.publishWorkstationHeartbeat().catch(() => {})

    const finalStatus = getSyncQueueStatus()
    const totalBlocked = finalStatus.errorCount + finalStatus.failedCount + finalStatus.quarantinedCount
    const hasUnsyncedItems = finalStatus.pendingCount > 0 || totalBlocked > 0

    // Notify all open renderer windows that sync completed to trigger instant UI refresh
    try {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sync:completed', { timestamp: new Date().toISOString() })
      })
    } catch {}

    if (hasUnsyncedItems) {
      broadcastProgress({
        phase: 'error',
        current: 100,
        total: 100,
        percent: 100,
        message: `Synchronisation partielle : ${finalStatus.pendingCount} en attente, ${totalBlocked} anomalie(s)`,
        lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
        pendingCount: finalStatus.pendingCount,
        errorCount: totalBlocked
      })

      return {
        success: false,
        partial: true,
        pendingCount: finalStatus.pendingCount,
        errorCount: totalBlocked,
        error: `${finalStatus.pendingCount} modification(s) en attente, ${totalBlocked} anomalie(s) non synchronisée(s).`
      }
    }

    broadcastProgress({
      phase: 'success',
      current: 100,
      total: 100,
      percent: 100,
      message: 'Synchronisation terminée avec succès',
      lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
      pendingCount: 0,
      errorCount: 0
    })

    return { success: true }
  } catch (error: any) {
    LoggerService.log('error', 'sync', 'Sync error', error.message)
    broadcastProgress({
      phase: 'error',
      current: 0,
      total: 0,
      percent: 0,
      message: `Erreur de synchronisation : ${error?.message || 'Inconnue'}`
    })
    return { success: false, error: error.message }
  } finally {
    isSyncing = false
  }
}

// Wipe Remote Data
export async function wipeRemoteData() {
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    // Delete in reverse order of dependencies

    // 1. Attendance & Event Payments
    const { error: errBus } = await supabase
      .from('bus_attendance')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: errCanteen } = await supabase
      .from('canteen_attendance')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: errEventPay } = await supabase
      .from('event_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    // 2. Core Student Data
    const { error: errCash } = await supabase
      .from('cash_journal')
      .delete()
      .not('related_student_id', 'is', null)
    if (errCash) console.error('Error wiping student cash journal:', errCash)

    const { error: err1 } = await supabase
      .from('student_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err1) console.error('Error wiping payments:', err1)

    const { error: err2 } = await supabase
      .from('student_fees')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err2) console.error('Error wiping fees:', err2)

    const { error: err3 } = await supabase
      .from('students')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err3) console.error('Error wiping students:', err3)

    if (err1 || err2 || err3 || errBus || errCanteen || errEventPay || errCash) {
      return { success: false, error: 'Partial failure checking console logs' }
    }
    return { success: true }
  } catch (e: any) {
    console.error('Remote wipe error:', e)
    return { success: false, error: e.message }
  }
}

// Table sync priority: parent tables must be pushed before child tables
// to avoid FK violations on Supabase.
// This ordering is inlined in the SQL query below.

const TABLE_DEPENDENCIES: Record<string, string[]> = {
  class_subjects: ['subjects'],
  student_fees: ['students'],
  personnel_absences: ['personnel'],
  salary_advances: ['personnel'],
  custom_deductions: ['personnel'],
  grades: ['students', 'subjects', 'class_subjects'],
  time_tracking: ['personnel'],
  daily_attendance: ['personnel'],
  student_payments: ['students', 'student_fees'],
  event_payments: ['students', 'parent_events'],
  bus_attendance: ['students'],
  canteen_attendance: ['students']
}

async function pushLocalChanges() {
  const queue = db
    .prepare(
      `
    SELECT * FROM sync_queue
    WHERE status IN ('pending', 'error')
    ORDER BY
      CASE WHEN action = 'delete' THEN
        CASE table_name
          WHEN 'settings' THEN 1
          WHEN 'users' THEN 2
          WHEN 'event_payments' THEN 3
          WHEN 'bus_attendance' THEN 3
          WHEN 'canteen_attendance' THEN 3
          WHEN 'student_payments' THEN 4
          WHEN 'cash_journal' THEN 4
          WHEN 'cash_closures' THEN 4
          WHEN 'parent_events' THEN 4
          WHEN 'grades' THEN 5
          WHEN 'time_tracking' THEN 5
          WHEN 'daily_attendance' THEN 5
          WHEN 'personnel_absences' THEN 5
          WHEN 'salary_advances' THEN 5
          WHEN 'custom_deductions' THEN 5
          WHEN 'student_fees' THEN 6
          WHEN 'class_subjects' THEN 6
          WHEN 'students' THEN 7
          WHEN 'personnel' THEN 7
          WHEN 'subjects' THEN 8
          ELSE 99
        END
      ELSE
        CASE table_name
          WHEN 'subjects' THEN 1
          WHEN 'students' THEN 2
          WHEN 'personnel' THEN 2
          WHEN 'student_fees' THEN 3
          WHEN 'class_subjects' THEN 3
          WHEN 'grades' THEN 4
          WHEN 'time_tracking' THEN 4
          WHEN 'daily_attendance' THEN 4
          WHEN 'personnel_absences' THEN 4
          WHEN 'salary_advances' THEN 4
          WHEN 'custom_deductions' THEN 4
          WHEN 'student_payments' THEN 5
          WHEN 'cash_journal' THEN 5
          WHEN 'cash_closures' THEN 5
          WHEN 'parent_events' THEN 5
          WHEN 'event_payments' THEN 6
          WHEN 'bus_attendance' THEN 6
          WHEN 'canteen_attendance' THEN 6
          WHEN 'users' THEN 7
          WHEN 'settings' THEN 8
          ELSE 99
        END
      END ASC,
      created_at ASC
    LIMIT 100
  `
    )
    .all() as any[]

  // Batch pre-fetch remote records for Anti-Regression (LWW) and Anti-Resurrection guards
  const remoteCache = new Map<string, any>()
  const itemsByTable = new Map<string, string[]>()
  for (const item of queue) {
    if (item.table_name !== 'settings' && item.record_id) {
      const ids = itemsByTable.get(item.table_name) || []
      ids.push(item.record_id)
      itemsByTable.set(item.table_name, ids)
    }
  }

  for (const [tName, rIds] of itemsByTable.entries()) {
    try {
      const uniqueIds = Array.from(new Set(rIds)).filter(Boolean)
      if (uniqueIds.length === 0) continue
      const { data: rows } = await supabase
        .from(tName)
        .select('id, updated_at, deleted, receipt_number, print_count, last_printed_at, last_printed_by')
        .in('id', uniqueIds)
      if (rows) {
        for (const r of rows) {
          remoteCache.set(`${tName}:${r.id}`, r)
        }
      }
    } catch {
      // Non-blocking fallback to individual lookup
    }
  }

  const failedTables = new Set<string>()
  const totalItemsCount = queue.length
  let processedCount = 0

  for (const item of queue) {
    processedCount++
    const progressPercent = Math.round(10 + (processedCount / (totalItemsCount || 1)) * 40)
    broadcastProgress({
      phase: 'pushing',
      current: processedCount,
      total: totalItemsCount,
      percent: progressPercent,
      message: `Envoi au cloud : ${item.table_name} (${processedCount}/${totalItemsCount})`
    })

    try {
      if (!SYNCABLE_TABLES.has(item.table_name)) {
        console.error(`Skipping unauthorized table in sync queue: ${item.table_name}`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Forbidden table name' WHERE id = ?`
        ).run(item.id)
        continue
      }

      // Special case: Do not push ANY local machine settings
      if (item.table_name === 'settings') {
        db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(item.id)
        continue
      }

      // Check dependencies to prevent FK violations
      const deps = TABLE_DEPENDENCIES[item.table_name] || []
      const hasFailedDep = deps.some((dep) => failedTables.has(dep))
      if (hasFailedDep) {
        db.prepare(
          `UPDATE sync_queue SET status = 'pending', error_message = 'Delayed due to parent table error' WHERE id = ?`
        ).run(item.id)
        continue
      }

      // If status is error, we should retry.
      // But maybe check if we exceeded max retries? For now, infinite retry.

      const data = JSON.parse(item.data)
      let payload = { ...data }

      // FIX: Ensure payload has id for upsert and localRow fetching
      if (!payload.id && item.record_id) {
        payload.id = item.record_id
      }

      // FIX: Merge with full local row to prevent Supabase UPSERT failures
      // due to missing NOT NULL columns if the remote record is missing.
      try {
        if (payload.id && item.action !== 'delete') {
          const localRow = db
            .prepare(`SELECT * FROM ${item.table_name} WHERE id = ?`)
            .get(payload.id)
          if (localRow) {
            payload = { ...localRow, ...payload }
          }
        }
      } catch (e) {
        console.warn('Could not merge local row for sync:', e)
      }

      // FIX: Remove GENERATED columns that Postgres will reject
      if ('search_text' in payload) {
        delete payload.search_text
      }
      
      // FIX: Strip local-only columns that do not exist in Supabase
      if ('is_reenrollment' in payload) delete payload.is_reenrollment
      if ('payroll_start_date' in payload) delete payload.payroll_start_date
      if (item.table_name === 'parent_events' && 'school_year' in payload) {
        delete payload.school_year
      }

      // FIX: Sanitize empty date strings for PostgreSQL
      // PostgreSQL rejects "" as date, must be NULL
      const dateFields = [
        'date_of_birth',
        'departure_date',
        'hire_date',
        'start_date',
        'end_date',
        'payment_date',
        'attendance_date',
        'advance_date',
        'repayment_date'
      ]
      for (const field of dateFields) {
        if (payload[field] === '') {
          payload[field] = null
        }
      }

      // FIX: Skip records with missing required foreign keys
      if (item.table_name === 'student_fees' && !payload.student_id) {
        console.warn(`Skipping student_fees ${payload.id}: missing student_id`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing student_id' WHERE id = ?`
        ).run(item.id)
        continue
      }
      if (item.table_name === 'student_fees' && !payload.school_year) {
        console.warn(`Skipping student_fees ${payload.id}: missing school_year`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing school_year' WHERE id = ?`
        ).run(item.id)
        continue
      }

      if (item.table_name === 'students') {
        // Remove undefined fields
        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key])

        // Ensure updated_at is set
        payload.updated_at = new Date().toISOString()

        // HARDENED VALIDATION: Prevent Ghost Records
        // If key fields are missing, DO NOT PUSH.
        if (
          item.action === 'create' &&
          (!payload.first_name || !payload.last_name || !payload.registration_number)
        ) {
          console.error(`Skipping invalid student record ${payload.id}: Missing required fields.`)
          // Mark as error to remove from pending queue, but don't delete data
          db.prepare(
            `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing required fields' WHERE id = ?`
          ).run(item.id)
          continue
        }
      } else {
        // For other tables, use data as is (or add more mapping if needed)
        // Ensure we don't send local-only fields if they exist
      }

      // FIX: Check for "guardian_contact" NOT NULL constraint in Supabase
      // If payload has no guardian_contact (because it was optional in UI),
      // but DB enforces NOT NULL, we must provide a default or allow NULL in DB.
      // Based on error: "null value in column "guardian_contact" ... violates not-null constraint"
      // We should provide an empty string if it is missing.

      if (item.table_name === 'students') {
        if (!payload.guardian_contact) payload.guardian_contact = ''
      }

      // FIX: Check for "class" NOT NULL constraint
      // IMPORTANT: Only set default class on CREATE, never on UPDATE.
      // Partial updates (e.g. address change) do not include 'class' in the payload.
      // We removed the 'Non inscrit' default because it overwrites local data on pull. SQLite allows empty strings.

      // FIX: Check for "enrollment_date" NOT NULL constraint
      if (item.table_name === 'students' && !payload.enrollment_date) {
        payload.enrollment_date = new Date().toISOString().split('T')[0]
      }

      // FIX: Handle Photo Upload (Offline-First)
      // If photo_path is a local path (starts with / or X:\), try to upload it.
      if (
        item.table_name === 'students' &&
        payload.photo_path &&
        !payload.photo_path.startsWith('http')
      ) {
        try {
          const localPath = payload.photo_path
          if (fs.existsSync(localPath)) {
            const fileBuffer = fs.readFileSync(localPath)
            const fileExt = path.extname(localPath)
            const fileName = `${payload.id}-${Date.now()}${fileExt}`

            // Automate Bucket Creation (Best effort)
            try {
              // We don't need the bucket data, just checking/creating
              const { error: bucketError } = await supabase.storage.getBucket('student-photos')
              if (bucketError) {
                // Bucket likely doesn't exist, try to create it
                // If create fails (e.g. permission denied), we can't do much automatically.
                // But we can try to upload anyway, sometimes getBucket fails but upload works if public.
                const { error: createError } = await supabase.storage.createBucket(
                  'student-photos',
                  { public: true }
                )
                if (createError) console.warn('Bucket creation warning:', createError.message)
              }
            } catch (e) {
              // Ignore bucket creation errors (might be permission issue or already exists)
            }

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('student-photos')
              .upload(fileName, fileBuffer, {
                contentType: 'image/' + fileExt.replace('.', ''),
                upsert: true
              })

            if (uploadError) {
              console.error('Photo upload failed:', uploadError)

              // If error is "Bucket not found", it means we really need that bucket.
              // Since we can't create it with Anon key usually, user MUST do it in Dashboard.
              // We should NOT throw error here to block the whole student sync?
              // Actually user said "pas de reaction imprevue".
              // If we throw, the student stays in "pending" sync. That's good.

              throw new Error('Photo upload failed: ' + uploadError.message)
            } else if (uploadData) {
              const { data: publicUrlData } = supabase.storage
                .from('student-photos')
                .getPublicUrl(fileName)

              if (publicUrlData && publicUrlData.publicUrl) {
                payload.photo_path = publicUrlData.publicUrl

                // Update Local DB immediately to reflect the Cloud URL
                // This ensures next time we don't try to upload again
                db.prepare('UPDATE students SET photo_path = ? WHERE id = ?').run(
                  payload.photo_path,
                  payload.id
                )
              }
            }
          }
        } catch (uploadEx) {
          console.error('Error processing photo upload:', uploadEx)
        }
      }

      // Users table: password_hash is synced. It is securely hashed with bcrypt.

      if (item.action === 'create' || item.action === 'update') {
        // Convert SQLite booleans (0/1 or "0.0") to PostgreSQL booleans (true/false)
        const supabasePayload: any = {}
        const booleanFields = [
          'deleted',
          'active',
          'bus_subscribed',
          'canteen_subscribed',
          'uniform_tshirt_purchased',
          'uniform_apron_purchased',
          'uniform_shorts_purchased',
          'uniform_badge_purchased',
          'fram_paid_by_parent',
          'is_personnel_child',
          'manually_edited',
          'justified',
          'present',
          'paid',
          'repaid',
          'has_droit'
        ]

        for (const key of Object.keys(payload)) {
          const val = payload[key]
          if (booleanFields.includes(key)) {
            supabasePayload[key] =
              val === 1 ||
              val === '1' ||
              val === '1.0' ||
              val === 1.0 ||
              val === true ||
              val === 'true'
          } else if (typeof val === 'boolean') {
            supabasePayload[key] = val
          } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
            supabasePayload[key] = JSON.stringify(val)
          } else {
            supabasePayload[key] = val
          }
        }

        // Inject ecole_id to satisfy Supabase Row Level Security (Multi-Tenant Isolation)
        const tenantId =
          (SettingsRepository.get('ecole_id') as string) || process.env.VITE_DEFAULT_TENANT_ID
        if (tenantId) {
          supabasePayload.ecole_id = tenantId
        }

        // ── ANTI-REGRESSION SAFEGUARD (LAST-WRITE-WINS) & ANTI-RESURRECTION ──
        if (item.table_name !== 'settings') {
          try {
            let remoteRow = remoteCache.get(`${item.table_name}:${item.record_id}`)
            if (remoteRow === undefined) {
              let singleQuery = supabase
                .from(item.table_name)
                .select('updated_at, deleted, receipt_number, print_count, last_printed_at, last_printed_by')
                .eq('id', item.record_id)
              if (tenantId) singleQuery = singleQuery.eq('ecole_id', tenantId)
              const { data: singleRow } = await singleQuery.maybeSingle()
              remoteRow = singleRow
            }

            if (remoteRow) {
              // 1. Anti-Resurrection: If remote is deleted, keep deleted on local and skip overwrite
              if (remoteRow.deleted && !payload.deleted) {
                db.prepare(`UPDATE ${item.table_name} SET deleted = 1, sync_status = 'synced' WHERE id = ?`).run(
                  item.record_id
                )
                db.prepare("UPDATE sync_queue SET status = 'synced', error_message = NULL WHERE id = ?").run(item.id)
                processedCount++
                continue
              }

              // 2. Preserve print tracking: Cloud impressions always take precedence
              if (item.table_name === 'student_payments' || item.table_name === 'cash_journal') {
                if ((remoteRow.print_count || 0) > (payload.print_count || 0)) {
                  payload.print_count = remoteRow.print_count
                  supabasePayload.print_count = remoteRow.print_count
                  if (remoteRow.last_printed_at) {
                    payload.last_printed_at = remoteRow.last_printed_at
                    supabasePayload.last_printed_at = remoteRow.last_printed_at
                  }
                  if (remoteRow.last_printed_by) {
                    payload.last_printed_by = remoteRow.last_printed_by
                    supabasePayload.last_printed_by = remoteRow.last_printed_by
                  }
                }
              }

              // 3. Anti-Regression: If remote record is strictly newer than local payload (1s tolerance buffer)
              if (remoteRow.updated_at) {
                const remoteDate = new Date(remoteRow.updated_at).getTime()
                const localDate = new Date(payload.updated_at || item.created_at || '1970-01-01').getTime()
                if (remoteDate > localDate + 1000) {
                  console.warn(
                    `[Anti-Regression LWW] Refusing to push older local record for ${item.table_name}:${item.record_id}. ` +
                    `Cloud (${remoteRow.updated_at}) is newer than Local (${payload.updated_at || item.created_at}).`
                  )
                  db.prepare("UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL WHERE id = ?").run(item.id)
                  try {
                    db.prepare(`UPDATE ${item.table_name} SET sync_status = 'synced' WHERE id = ?`).run(item.record_id)
                  } catch {}
                  processedCount++
                  continue
                }
              }
            }
          } catch (lwwErr) {
            if (isNetworkOrOfflineError(lwwErr)) throw lwwErr
            console.warn(`[Anti-Regression Check] Non-blocking warning for ${item.table_name}:${item.record_id}:`, lwwErr)
          }
        }

        // Handle tables with composite unique constraints that differ from PK
        let upsertError: any
        if (item.table_name === 'time_tracking') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(supabasePayload, { onConflict: 'personnel_id,month' })
          upsertError = error
        } else if (item.table_name === 'users') {
          const adminSupabase = getSupabaseAdmin() || supabase

          // Ensure password_hash is present if required by cloud schema
          if (!supabasePayload.password_hash) {
            const localUser = db
              .prepare('SELECT password_hash FROM users WHERE id = ?')
              .get(item.record_id) as any
            if (localUser?.password_hash) {
              supabasePayload.password_hash = localUser.password_hash
            }
          }

          // Check if user already exists on cloud by (username, ecole_id) to avoid duplicate key constraint
          let userQuery = adminSupabase.from('users').select('id').eq('username', supabasePayload.username)
          if (supabasePayload.ecole_id) {
            userQuery = userQuery.eq('ecole_id', supabasePayload.ecole_id)
          }
          const { data: existingUser } = await userQuery.maybeSingle()

          if (existingUser) {
            const { error } = await adminSupabase
              .from('users')
              .update(supabasePayload)
              .eq('id', existingUser.id)
            upsertError = error
          } else {
            const { error } = await adminSupabase
              .from('users')
              .upsert(supabasePayload, { onConflict: 'id' })
            upsertError = error
          }

          // Auto-heal local seed users blocked by cloud RLS policies or constraint collisions:
          if (
            upsertError &&
            (upsertError.code === '42501' ||
              upsertError.code === '23505' ||
              upsertError.message?.toLowerCase().includes('row-level security') ||
              upsertError.message?.toLowerCase().includes('unique constraint') ||
              upsertError.message?.toLowerCase().includes('security policy'))
          ) {
            LoggerService.log(
              'info',
              'sync',
              `[Sync] Users table constraint bypass: local user '${item.record_id}' resolved without blocking queue.`
            )
            upsertError = null
          }
        } else if (item.table_name === 'student_fees') {
          const { error } = await supabase
            .from('student_fees')
            .upsert(supabasePayload, { onConflict: 'student_id,school_year' })
          upsertError = error
        } else if (item.table_name === 'grades') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(supabasePayload, { onConflict: 'student_id,subject_id,school_year,term' })
          upsertError = error
        } else {
          const { error } = await supabase.from(item.table_name).upsert(supabasePayload)
          upsertError = error
        }

        let autoHealed = false
        if (upsertError) {
          const errMsg = upsertError.message || ''

          // 1. Auto-heal: Duplicate unique constraint on students (registration_number collision across stations)
          if (
            upsertError.code === '23505' &&
            item.table_name === 'students' &&
            (errMsg.includes('registration_number') || errMsg.includes('students_registration_number_key'))
          ) {
            try {
              console.warn(
                `[Auto-healing sync] Registration number collision on student '${item.record_id}' (${payload.registration_number}). Resolving collision...`
              )
              const currentYearPrefix = new Date().getFullYear().toString()

              // Check if student with this matricule in cloud is identical (same first_name, last_name) for this tenant
              let query = supabase
                .from('students')
                .select('id, first_name, last_name, registration_number')
                .eq('registration_number', payload.registration_number)
              if (tenantId) {
                query = query.eq('ecole_id', tenantId)
              }
              const { data: cloudMatch } = await query.maybeSingle()

              if (
                cloudMatch &&
                cloudMatch.first_name?.trim().toLowerCase() === payload.first_name?.trim().toLowerCase() &&
                cloudMatch.last_name?.trim().toLowerCase() === payload.last_name?.trim().toLowerCase()
              ) {
                // Same student created under different UUID across stations: adopt cloud ID locally
                console.warn(
                  `[Auto-healing sync] Matching student found in cloud (ID: ${cloudMatch.id}). Aligning local UUID...`
                )
                db.prepare('UPDATE students SET id = ?, sync_status = "synced" WHERE id = ?').run(
                  cloudMatch.id,
                  item.record_id
                )
                db.prepare('UPDATE student_fees SET student_id = ? WHERE student_id = ?').run(
                  cloudMatch.id,
                  item.record_id
                )
                db.prepare('UPDATE student_payments SET student_id = ? WHERE student_id = ?').run(
                  cloudMatch.id,
                  item.record_id
                )
                db.prepare('UPDATE cash_journal SET related_student_id = ? WHERE related_student_id = ?').run(
                  cloudMatch.id,
                  item.record_id
                )
                autoHealed = true
              } else {
                // Distinct student: allocate next non-colliding registration number for this tenant
                const localMaxRow = db
                  .prepare(
                    `
                  SELECT MAX(CAST(SUBSTR(registration_number, 6) AS INTEGER)) as max_num 
                  FROM students 
                  WHERE registration_number LIKE ? ${tenantId ? 'AND (ecole_id = ? OR ecole_id IS NULL)' : ''}
                `
                  )
                  .get(
                    `${currentYearPrefix}-%`,
                    ...(tenantId ? [tenantId] : [])
                  ) as { max_num: number | null } | undefined

                let nextNum = (localMaxRow?.max_num || 0) + 1

                // Also check remote max for this tenant to be safe
                let remoteQuery = supabase
                  .from('students')
                  .select('registration_number')
                  .ilike('registration_number', `${currentYearPrefix}-%`)
                if (tenantId) {
                  remoteQuery = remoteQuery.eq('ecole_id', tenantId)
                }
                const { data: remoteMaxRows } = await remoteQuery
                  .order('registration_number', { ascending: false })
                  .limit(1)

                if (remoteMaxRows && remoteMaxRows.length > 0) {
                  const remoteNum = parseInt(remoteMaxRows[0].registration_number.split('-')[1]) || 0
                  if (remoteNum >= nextNum) {
                    nextNum = remoteNum + 1
                  }
                }

                const newRegNum = `${currentYearPrefix}-${String(nextNum).padStart(5, '0')}`
                console.warn(
                  `[Auto-healing sync] Reassigning unique registration_number '${newRegNum}' to student '${item.record_id}'`
                )

                db.prepare('UPDATE students SET registration_number = ? WHERE id = ?').run(
                  newRegNum,
                  item.record_id
                )
                payload.registration_number = newRegNum
                supabasePayload.registration_number = newRegNum

                const { error: retryErr } = await supabase.from('students').upsert(supabasePayload)
                if (!retryErr) {
                  autoHealed = true
                }
              }
            } catch (stHealErr) {
              console.warn('[Auto-healing sync] Student registration_number collision auto-heal failed:', stHealErr)
            }
          }

          // 2. Auto-heal: Foreign key violation missing parent student (23503)
          if (
            !autoHealed &&
            upsertError.code === '23503' &&
            (item.table_name === 'student_payments' ||
              item.table_name === 'cash_journal' ||
              item.table_name === 'student_fees')
          ) {
            try {
              const studentId =
                item.table_name === 'cash_journal'
                  ? payload.related_student_id
                  : payload.student_id
              if (studentId) {
                const localStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any
                if (localStudent) {
                  console.warn(
                    `[Auto-healing sync] Pushing missing parent student '${studentId}' to Supabase before retrying '${item.table_name}'`
                  )
                  const studentPayload: any = { ...localStudent }
                  if (tenantId) studentPayload.ecole_id = tenantId
                  const { error: studentErr } = await supabase.from('students').upsert(studentPayload)
                  if (!studentErr) {
                    const { error: retryErr } = await supabase
                      .from(item.table_name)
                      .upsert(supabasePayload)
                    if (!retryErr) {
                      autoHealed = true
                    }
                  } else if (item.table_name === 'cash_journal') {
                    // Fallback: If parent student push fails on constraint, nullify related_student_id on cash_journal so ledger is not blocked
                    console.warn(
                      `[Auto-healing sync] Student push failed (${studentErr.message}). Nullifying related_student_id on cash_journal '${item.record_id}'`
                    )
                    payload.related_student_id = null
                    supabasePayload.related_student_id = null
                    const { error: retryCjErr } = await supabase
                      .from('cash_journal')
                      .upsert(supabasePayload)
                    if (!retryCjErr) {
                      autoHealed = true
                    }
                  }
                } else if (item.table_name === 'cash_journal') {
                  // Orphaned student reference in cash_journal: clear foreign key so the financial transaction is recorded
                  console.warn(
                    `[Auto-healing sync] Nullifying orphaned related_student_id on cash_journal '${item.record_id}'`
                  )
                  payload.related_student_id = null
                  supabasePayload.related_student_id = null
                  const { error: retryErr } = await supabase.from('cash_journal').upsert(supabasePayload)
                  if (!retryErr) {
                    autoHealed = true
                  }
                } else if (item.table_name === 'student_payments') {
                  // Truly orphaned payment (student does not exist locally): quarantine to prevent blocking the queue
                  console.warn(
                    `[Auto-healing sync] Parent student '${studentId}' not found for payment '${item.record_id}'. Quarantining.`
                  )
                  db.prepare(
                    `UPDATE sync_queue SET status = 'quarantined', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                  ).run(
                    `Élève parent inexistant (${studentId}) - paiement mis en quarantaine pour réconciliation`,
                    item.id
                  )
                  continue
                }
              }
            } catch (fkHealErr) {
              console.warn('[Auto-healing sync] Foreign key resolution failed:', fkHealErr)
            }
          }

          // 3. Auto-heal: Postgres integer type mismatch for boolean false/true (22P02)
          if (
            !autoHealed &&
            (upsertError?.code === '22P02' ||
              errMsg.includes('type integer') ||
              errMsg.includes('integer: "false"') ||
              errMsg.includes('integer: "true"'))
          ) {
            try {
              console.warn(
                `[Auto-healing sync] Integer syntax error on '${item.table_name}' (${errMsg}). Converting booleans to 0/1 and retrying...`
              )
              for (const k of Object.keys(supabasePayload)) {
                if (supabasePayload[k] === false) supabasePayload[k] = 0
                else if (supabasePayload[k] === true) supabasePayload[k] = 1
              }
              const { error: retryErr } = await supabase.from(item.table_name).upsert(supabasePayload)
              if (!retryErr) {
                autoHealed = true
              }
            } catch (intHealErr) {
              console.warn('[Auto-healing sync] Integer auto-heal failed:', intHealErr)
            }
          }

          // 4. Auto-heal: class_subjects foreign key to subjects (23503)
          if (!autoHealed && upsertError?.code === '23503' && item.table_name === 'class_subjects') {
            try {
              if (supabasePayload.subject_id) {
                const localSub = db.prepare('SELECT * FROM subjects WHERE id = ?').get(supabasePayload.subject_id) as any
                if (localSub) {
                  console.warn(
                    `[Auto-healing sync] Pushing missing parent subject '${supabasePayload.subject_id}' before retrying class_subjects`
                  )
                  const formattedSub = { ...localSub }
                  delete formattedSub.sync_status
                  if (tenantId) formattedSub.ecole_id = tenantId
                  const { error: subErr } = await supabase.from('subjects').upsert(formattedSub)
                  if (!subErr) {
                    const { error: retryErr } = await supabase.from('class_subjects').upsert(supabasePayload)
                    if (!retryErr) {
                      autoHealed = true
                    }
                  }
                }
              }
            } catch (csHealErr) {
              console.warn('[Auto-healing sync] class_subjects foreign key heal failed:', csHealErr)
            }
          }

          // 5. Auto-heal: subjects unique constraint collision on name (23505)
          if (
            !autoHealed &&
            (upsertError?.code === '23505' ||
              errMsg.includes('subjects_name_key') ||
              errMsg.includes('duplicate key')) &&
            item.table_name === 'subjects'
          ) {
            try {
              const subRow = db.prepare('SELECT name FROM subjects WHERE id = ?').get(item.record_id) as any
              const targetName = (supabasePayload?.name || subRow?.name || '').trim()
              console.warn(`[Auto-healing sync] Subject name collision for '${targetName}'. Aligning local UUID with remote...`)
              if (targetName) {
                const { data: remoteSub } = await supabase
                  .from('subjects')
                  .select('id')
                  .ilike('name', targetName)
                  .maybeSingle()
                if (remoteSub?.id) {
                  const oldId = item.record_id
                  const newId = remoteSub.id
                  db.prepare('UPDATE subjects SET id = ?, sync_status = "synced" WHERE id = ?').run(newId, oldId)
                  db.prepare('UPDATE class_subjects SET subject_id = ? WHERE subject_id = ?').run(newId, oldId)
                  db.prepare('UPDATE grades SET subject_id = ? WHERE subject_id = ?').run(newId, oldId)
                  autoHealed = true
                }
              }
            } catch (subHealErr) {
              console.warn('[Auto-healing sync] Subject collision auto-heal failed:', subHealErr)
            }
          }

          if (!autoHealed) {
            throw upsertError
          }
        }
      } else if (item.action === 'delete') {
        const { error } = await supabase
          .from(item.table_name)
          .update({ deleted: true })
          .eq('id', item.record_id)
        if (error) throw error
      }

      // Mark as synced
      db.prepare(
        `
        UPDATE sync_queue
        SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL
        WHERE id = ?
      `
      ).run(item.id)

      // Update record sync status
      db.prepare(
        `
        UPDATE ${item.table_name}
        SET sync_status = 'synced'
        WHERE id = ?
      `
      ).run(item.record_id)
    } catch (error: any) {
      // Add to failed tables so dependents are skipped
      failedTables.add(item.table_name)

      const errorCode = error?.code || ''
      const isUnrecoverable = errorCode === '23503' || errorCode === '23505'

      if (!isUnrecoverable) {
        LoggerService.log('error', 'sync', `Supabase Push Error [${item.table_name}]`, error.message || error, null)
      }

      db.prepare(
        `
        UPDATE sync_queue
        SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(isUnrecoverable ? 'skipped' : 'error', error.message || 'Unknown error', item.id)

      TelemetryService.reportSyncBlockage(
        item.table_name,
        item.record_id,
        error?.message || 'Erreur push inconnue',
        totalItemsCount
      ).catch(() => {})
    }
  }
}

async function pullRemoteChanges(forceFullSync: boolean = false) {
  let hasPullErrors = false
  const settingsRow = db
    .prepare(
      `
    SELECT value FROM settings WHERE key = 'last_sync_time'
  `
    )
    .get() as { value: string } | undefined

  let lastSync = forceFullSync ? '2000-01-01T00:00:00Z' : '2020-01-01T00:00:00Z'
  if (!forceFullSync && settingsRow && settingsRow.value) {
    try {
      lastSync = JSON.parse(settingsRow.value)
    } catch (e) {
      lastSync = settingsRow.value
    }
  }

  const tables = [
    'students',
    'student_fees',
    'student_payments',
    'personnel',
    'time_tracking',
    'daily_attendance',
    'personnel_absences',
    'salary_advances',
    'custom_deductions',
    'cash_journal',
    'subjects',
    'grades',
    'class_subjects',
    'parent_events',
    'event_payments',
    'bus_attendance',
    'canteen_attendance',
    'assessments',
    'cash_closures'
  ]

  db.pragma('foreign_keys = OFF')

  try {
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]
      if (!SYNCABLE_TABLES.has(table)) {
        continue
      }

      const tablePercent = Math.round(50 + ((i + 1) / tables.length) * 45)
      broadcastProgress({
        phase: 'pulling',
        current: i + 1,
        total: tables.length,
        percent: tablePercent,
        message: `Récupération depuis le cloud : ${table}...`
      })

      let remoteRecords: any[] = []
      let page = 0
      const pageSize = 1000
      let fetchMore = true

      while (fetchMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true })
          .range(from, to)

        if (error) {
          console.error(`Error pulling ${table}:`, error)
          hasPullErrors = true
          fetchMore = false
          break
        }

        if (data && data.length > 0) {
          remoteRecords.push(...data)
          if (data.length < pageSize) {
            fetchMore = false
          } else {
            page++
          }
        } else {
          fetchMore = false
        }
      }

      for (const record of remoteRecords) {
        const local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(record.id) as any

        // Remove computed or Supabase-only columns
        const { search_text, ...recordToSave } = record

        // Sanitize object values & quotes
        for (const key in recordToSave) {
          const val = recordToSave[key]
          if (typeof val === 'boolean') {
            recordToSave[key] = val ? 1 : 0
          } else if (typeof val === 'object' && val !== null) {
            recordToSave[key] = JSON.stringify(val)
          } else if (key === 'school_year' && typeof val === 'string') {
            recordToSave[key] = val.replace(/['"]/g, '').trim()
          }
        }

        // Handle deleted records
        if (recordToSave.deleted) {
          if (local) {
            db.prepare(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`).run(
              recordToSave.updated_at,
              record.id
            )
          } else {
            const fields = Object.keys(recordToSave).join(', ')
            const placeholders = Object.keys(recordToSave)
              .map(() => '?')
              .join(', ')
            db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`).run(
              ...Object.values(recordToSave)
            )
          }
          continue
        }

        // Handle schema differences for cash_journal
        if (table === 'cash_journal' && !recordToSave.department) {
          recordToSave.department = 'ecole'
        }

        // Conflict resolution on unique constraints
        const uniqueConstraints = {
          student_fees: ['student_id', 'school_year'],
          bus_attendance: ['student_id', 'attendance_date'],
          canteen_attendance: ['student_id', 'attendance_date'],
          salary_calculations: ['personnel_id', 'month'],
          grades: ['student_id', 'subject_id', 'school_year', 'term'],
          custom_deductions: ['personnel_id', 'month'],
          daily_attendance: ['personnel_id', 'attendance_date'],
          class_subjects: ['class_name', 'subject_id'],
          assessments: ['school_year', 'class_name', 'term_value'],
          time_tracking: ['personnel_id', 'month'],
          cash_closures: ['closure_date', 'cashier_alias', 'ecole_id']
        }

        const constraintKeys = uniqueConstraints[table]
        if (constraintKeys) {
          const hasAllKeys = constraintKeys.every(
            (k) => recordToSave[k] !== undefined && recordToSave[k] !== null
          )
          if (hasAllKeys) {
            const whereClause = constraintKeys.map((k) => `${k} = ?`).join(' AND ')
            const values = constraintKeys.map((k) => recordToSave[k])

            const conflict = db
              .prepare(`SELECT id FROM ${table} WHERE ${whereClause} AND id != ?`)
              .get(...values, record.id) as any
            if (conflict) {
              console.warn(
                `Unique constraint conflict detected on ${table} for ${constraintKeys.join(',')}. Deleting local conflict ${conflict.id} to favor cloud record ${record.id}.`
              )
              db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(conflict.id)
            }
          }
        }

        // Multi-station receipt & print count preservation
        if (table === 'student_payments') {
          if (!recordToSave.receipt_number && local?.receipt_number) {
            recordToSave.receipt_number = local.receipt_number
          }
          recordToSave.print_count = Math.max(
            Number(local?.print_count || 0),
            Number(recordToSave.print_count || 0)
          )
          if (!recordToSave.last_printed_at && local?.last_printed_at) {
            recordToSave.last_printed_at = local.last_printed_at
          }
          if (!recordToSave.last_printed_by && local?.last_printed_by) {
            recordToSave.last_printed_by = local.last_printed_by
          }

          // If local workstation has a verified receipt number but remote cloud has NULL, schedule cloud healing
          if (local?.receipt_number && !record.receipt_number) {
            addToSyncQueue(table, local.id, 'update', {
              id: local.id,
              receipt_number: local.receipt_number,
              print_count: recordToSave.print_count,
              school_year: recordToSave.school_year
            })
          }
        }

        try {
          if (!local) {
            const fields = Object.keys(recordToSave).join(', ')
            const placeholders = Object.keys(recordToSave)
              .map(() => '?')
              .join(', ')
            db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`).run(
              ...Object.values(recordToSave)
            )
          } else {
            const hasNewerPrint =
              table === 'student_payments' &&
              (recordToSave.print_count || 0) > (local.print_count || 0)

            if (
              new Date(local.updated_at) > new Date(record.updated_at) &&
              !forceFullSync &&
              !hasNewerPrint
            ) {
              console.warn(
                `Conflict detected for ${table} ${record.id} (Local is newer). Keeping local.`
              )
            } else {
              const updates = Object.entries(recordToSave)
                .map(([key]) => `${key} = ?`)
                .join(', ')
              db.prepare(`UPDATE ${table} SET ${updates}, sync_status = 'synced' WHERE id = ?`).run(
                ...Object.values(recordToSave),
                record.id
              )

              if (table === 'student_payments') {
                try {
                  db.prepare(`
                    UPDATE cash_journal 
                    SET print_count = MAX(COALESCE(print_count, 0), ?),
                        last_printed_at = COALESCE(?, last_printed_at),
                        last_printed_by = COALESCE(?, last_printed_by),
                        receipt_number = COALESCE(?, receipt_number)
                    WHERE related_payment_id = ?
                  `).run(
                    recordToSave.print_count || 0,
                    recordToSave.last_printed_at || null,
                    recordToSave.last_printed_by || null,
                    recordToSave.receipt_number || null,
                    record.id
                  )
                } catch {
                  // Ignore if cash_journal column not migrated yet
                }
              }
            }
          }
        } catch (err: any) {
          LoggerService.log('error', 'sync', `Sync error on pull for ${table} ID ${record.id}`, err.message || err, null)
          hasPullErrors = true
        }
      }
    }

    // --------------------------------------------
    // Pull users from cloud (with pagination)
    // --------------------------------------------
    try {
      let remoteUsers: any[] = []
      let userPage = 0
      const userPageSize = 1000
      let fetchMoreUsers = true

      while (fetchMoreUsers) {
        const from = userPage * userPageSize
        const to = from + userPageSize - 1
        const { data, error: usersError } = await supabase
          .from('users')
          .select('id, username, role, full_name, email, active, version, updated_at, password_hash, ecole_id')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true })
          .range(from, to)

        if (usersError) {
          console.error('Error pulling users:', usersError)
          hasPullErrors = true
          fetchMoreUsers = false
          break
        }

        if (data && data.length > 0) {
          remoteUsers.push(...data)
          if (data.length < userPageSize) {
            fetchMoreUsers = false
          } else {
            userPage++
          }
        } else {
          fetchMoreUsers = false
        }
      }

      for (const remoteUser of remoteUsers) {
        const localUser = db.prepare('SELECT * FROM users WHERE id = ?').get(remoteUser.id) as any
        const { ...userData } = remoteUser

        if (typeof userData.active === 'boolean') {
          userData.active = userData.active ? 1 : 0
        }

        if (!localUser) {
          const fields = Object.keys(userData).join(', ')
          const placeholders = Object.keys(userData)
            .map(() => '?')
            .join(', ')
          db.prepare(
            `INSERT INTO users (${fields}, sync_status) VALUES (${placeholders}, 'synced')`
          ).run(...Object.values(userData))
        } else {
          if (new Date(localUser.updated_at) > new Date(remoteUser.updated_at)) {
            console.warn(
              `Conflict detected for users ${remoteUser.id} (Local is newer). Keeping local.`
            )
          } else {
            const updates = Object.entries(userData)
              .map(([key]) => `${key} = ?`)
              .join(', ')
            db.prepare(`UPDATE users SET ${updates}, sync_status = 'synced' WHERE id = ?`).run(
              ...Object.values(userData),
              remoteUser.id
            )
          }
        }
      }
    } catch (e) {
      console.error('Error syncing users from cloud:', e)
      hasPullErrors = true
    }

    // --------------------------------------------
    // Pull settings from cloud (school_year, school_name, finance_prices, etc.)
    // --------------------------------------------
    try {
      const { data: remoteSettings, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .neq('key', 'last_sync_time')

      if (!settingsError && remoteSettings) {
        broadcastProgress({
          phase: 'pulling',
          current: tables.length,
          total: tables.length,
          percent: 95,
          message: 'Synchronisation des tarifs et paramètres...'
        })

        for (const remoteSetting of remoteSettings) {
          if (LOCAL_ONLY_SETTINGS.has(remoteSetting.key)) {
            continue
          }

          const localSetting = db
            .prepare('SELECT value, updated_at FROM settings WHERE key = ?')
            .get(remoteSetting.key) as { value: string; updated_at: string } | undefined

          if (!localSetting) {
            db.prepare(
              'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
            ).run(
              remoteSetting.key,
              remoteSetting.value,
              remoteSetting.updated_at || new Date().toISOString()
            )
          } else {
            const localDate = new Date(localSetting.updated_at || '2000-01-01')
            const remoteDate = new Date(remoteSetting.updated_at || '2000-01-01')
            if (remoteDate >= localDate) {
              db.prepare(
                'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
              ).run(
                remoteSetting.value,
                remoteSetting.updated_at || new Date().toISOString(),
                remoteSetting.key
              )
            }
          }
        }
      }
    } catch (e) {
      console.error('Error syncing settings from cloud:', e)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }

  // Update last sync time ONLY if no errors occurred
  if (!hasPullErrors) {
    db.prepare(
      `
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('last_sync_time', ?, CURRENT_TIMESTAMP)
    `
    ).run(JSON.stringify(new Date().toISOString()))
  }
}

/**
 * Assainissement intelligent et unique de l'outbox (v2.3.7) :
 * S'exécute une seule fois par poste pour aligner les marqueurs 'pending' résiduels
 * sans jamais perdre de vraies modifications hors-ligne.
 */
export async function oneTimeSanitizeSyncQueue(): Promise<void> {
  try {
    const done = db
      .prepare("SELECT value FROM settings WHERE key = 'v237_sync_outbox_healed'")
      .get() as { value: string } | undefined
    if (done && done.value === 'true') {
      return
    }

    console.log('[Sanitize Outbox] Exécution de la sanitisation unique de l\'Outbox...')

    // 1. Purger les anciens éléments 'synced' de plus de 7 jours et tables structurelles
    db.prepare("DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', '-7 days')").run()
    db.prepare("DELETE FROM sync_queue WHERE table_name IN ('class_subjects', 'subjects')").run()

    // 2. Aligner les tables métiers : si une ligne est en 'pending' mais n'a pas d'écriture en attente dans sync_queue
    const tables = Array.from(SYNCABLE_TABLES).filter((t) => t !== 'settings' && t !== 'assessments')
    for (const t of tables) {
      try {
        db.prepare(`
          UPDATE ${t} 
          SET sync_status = 'synced' 
          WHERE sync_status = 'pending' 
            AND id NOT IN (
              SELECT record_id FROM sync_queue 
              WHERE table_name = ? AND status IN ('pending', 'error', 'failed', 'quarantined')
            )
        `).run(t)
      } catch {}
    }

    // 3. Compacter et dédoublonner la file sync_queue
    compactSyncQueue()

    // 4. Enregistrer la marque d'exécution
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('v237_sync_outbox_healed', 'true', CURRENT_TIMESTAMP)"
    ).run()

    console.log('[Sanitize Outbox] Sanitisation unique terminée avec succès.')
  } catch (err) {
    console.warn('[Sanitize Outbox] Erreur lors de la sanitisation unique:', err)
  }
}

// Start periodic sync (every 5 minutes)
export function startPeriodicSync() {
  // Sync immediately on startup
  setTimeout(async () => {
    await oneTimeSanitizeSyncQueue().catch(() => {})
    await syncWithCloud()
  }, 3000) // Wait 3s for app to settle

  setInterval(
    async () => {
      // In Main process, we just attempt sync.
      // If offline, the try/catch in syncWithCloud will handle it.
      await syncWithCloud()
    },
    5 * 60 * 1000
  ) // 5 minutes
}
