import { createClient } from '@supabase/supabase-js'
import db from '../database/db'
import dotenv from 'dotenv'
import path from 'path'
import * as fs from 'fs'
import { app, BrowserWindow } from 'electron' // Load env vars
import { LoggerService } from './logger.service'
import { TelemetryService } from './telemetry.service'
import { SettingsRepository } from '../database/repositories/settings.repository'
const isDev = !app.isPackaged
const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env')

dotenv.config({ path: envPath })

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
 * Health check to Supabase with latency measurement and 5s timeout
 */
export async function checkCloudHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, error: 'Identifiants Supabase absents du fichier .env' }
  }

  const start = Date.now()
  try {
    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error("Délai d'attente réseau dépassé (5s)")), 5000)
    )

    const probePromise = supabase
      .from('settings')
      .select('key')
      .limit(1)

    const result = (await Promise.race([probePromise, timeoutPromise])) as any

    if (result && result.error) {
      return { ok: false, error: result.error.message || 'Erreur retournée par Supabase' }
    }

    return { ok: true, latencyMs: Date.now() - start }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/**
 * Retrieve queue status
 */
export function getSyncQueueStatus(): {
  pendingCount: number
  errorCount: number
  quarantinedCount: number
  lastSyncTime: string | null
} {
  try {
    const counts = db
      .prepare(
        `SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
         FROM sync_queue`
      )
      .get() as { pending: number | null; errors: number | null; quarantined: number | null } | undefined

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
      quarantinedCount: counts?.quarantined || 0,
      lastSyncTime
    }
  } catch {
    return { pendingCount: 0, errorCount: 0, quarantinedCount: 0, lastSyncTime: null }
  }
}

/**
 * Retrieve failed or quarantined queue items
 */
export function getSyncQueueErrors(limit = 100) {
  try {
    return db
      .prepare(
        `SELECT id, table_name, record_id, action, status, error_message, created_at, COALESCE(updated_at, created_at) as updated_at
         FROM sync_queue
         WHERE status IN ('error', 'skipped', 'quarantined')
         ORDER BY id DESC LIMIT ?`
      )
      .all(limit)
  } catch (err) {
    console.error('getSyncQueueErrors error:', err)
    return []
  }
}

/**
 * Reset all failed and skipped records to pending for safe retry
 */
export function retrySyncErrors(): { changes: number } {
  try {
    const res = db
      .prepare(
        `UPDATE sync_queue
         SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('error', 'skipped', 'quarantined')`
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
         WHERE status IN ('error', 'skipped')`
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
         WHERE status IN ('error', 'skipped')`
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

/**
 * Add a record to the local sync queue.
 * IMPORTANT: This function is SYNCHRONOUS because it is called inside
 * better-sqlite3 transactions (db.transaction) which do not support async.
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
    db.prepare(
      `
      INSERT INTO sync_queue (table_name, record_id, action, data, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
    ).run(tableName, recordId, action, JSON.stringify(data))
  } catch (error) {
    console.error('Error adding to sync queue:', error)
  }
}

// Main sync function (called every 5 minutes if online or manually triggered)
export async function syncWithCloud(forceFullSync: boolean = false) {
  if (isSyncing) {
    return { success: false, reason: 'already_syncing' }
  }

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
      errorCount: queueStatus.errorCount
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
        errorCount: queueStatus.errorCount
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

    // PUSH: Send local changes to cloud
    await pushLocalChanges()

    // PULL: Get remote changes from cloud
    await pullRemoteChanges(forceFullSync)

    // Flush any pending error/sync telemetry to Supabase audit_logs
    await TelemetryService.flushPendingLogs().catch(() => {})

    const finalStatus = getSyncQueueStatus()
    const hasUnsyncedItems = finalStatus.pendingCount > 0 || finalStatus.errorCount > 0

    if (hasUnsyncedItems) {
      broadcastProgress({
        phase: 'error',
        current: 100,
        total: 100,
        percent: 100,
        message: `Synchronisation partielle : ${finalStatus.pendingCount} en attente, ${finalStatus.errorCount} anomalie(s)`,
        lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
        pendingCount: finalStatus.pendingCount,
        errorCount: finalStatus.errorCount
      })

      return {
        success: false,
        partial: true,
        pendingCount: finalStatus.pendingCount,
        errorCount: finalStatus.errorCount,
        error: `${finalStatus.pendingCount} modification(s) en attente, ${finalStatus.errorCount} anomalie(s) non synchronisée(s).`
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
  daily_attendance: ['students'],
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

        // Handle tables with composite unique constraints that differ from PK
        let upsertError: any
        if (item.table_name === 'time_tracking') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(supabasePayload, { onConflict: 'personnel_id,month' })
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

        if (upsertError) {
          // Handle Duplicate Key Error (23505) for registration_number
          if (
            upsertError.code === '23505' &&
            upsertError.message?.includes('registration_number')
          ) {
            console.warn(
              `Duplicate registration_number detected for ${payload.id}. Regenerating...`
            )

            // Fetch the real max registration number from Supabase
            // Improved logic to avoid naive sorting issues (2024-10 > 2024-9)
            const year = new Date().getFullYear()
            const { data: allRegs } = await supabase
              .from('students')
              .select('registration_number')
              .ilike('registration_number', `${year}-%`)

            let nextNum = 1
            if (allRegs && allRegs.length > 0) {
              // Parse manually to find max
              const nums = allRegs.map((r) => {
                const parts = r.registration_number.split('-')
                return parts.length === 2 ? parseInt(parts[1], 10) : 0
              })
              nextNum = Math.max(...nums) + 1
            }
            const newMatricule = `${year}-${String(nextNum).padStart(5, '0')}`

            // Update payload with new matricule
            payload.registration_number = newMatricule

            // Update Local DB with new matricule so it stays consistent
            db.prepare(`UPDATE students SET registration_number = ? WHERE id = ?`).run(
              newMatricule,
              payload.id
            )

            // Retry Upsert
            const { error: retryError } = await supabase.from(item.table_name).upsert(payload)

            if (retryError) {
              console.error(`Retry failed for ${item.table_name}:`, retryError)
              throw retryError
            }
          } else {
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

// Start periodic sync (every 5 minutes)
export function startPeriodicSync() {
  // Sync immediately on startup
  setTimeout(async () => {
    // console.log('Starting initial sync...');
    await syncWithCloud()
  }, 5000) // Wait 5s for app to settle

  setInterval(
    async () => {
      // In Main process, we just attempt sync.
      // If offline, the try/catch in syncWithCloud will handle it.
      await syncWithCloud()
    },
    5 * 60 * 1000
  ) // 5 minutes
}
