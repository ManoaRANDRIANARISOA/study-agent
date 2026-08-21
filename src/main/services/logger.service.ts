import db from '../database/db'
import { BrowserWindow } from 'electron'

export class LoggerService {
  /**
   * Logs a message to the database and optionally to the Electron console,
   * then broadcasts it to the renderer process if it's an error.
   */
  static log(
    level: 'info' | 'warn' | 'error',
    context: string,
    message: string,
    details?: any,
    tenantId?: string | null
  ): void {
    const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null

    // Always log to the Electron console for developers
    if (level === 'error') {
      console.error(`[${context}] ${message}`, details || '')
    } else if (level === 'warn') {
      console.warn(`[${context}] ${message}`, details || '')
    } else {
      console.log(`[${context}] ${message}`, details || '')
    }

    try {
      db.prepare(
        `INSERT INTO app_logs (level, context, message, details, tenant_id) VALUES (?, ?, ?, ?, ?)`
      ).run(level, context, message, detailsStr, tenantId || null)
    } catch (dbError) {
      console.error('Failed to write log to database:', dbError)
    }

    // Broadcast severe errors to the renderer to show a Toast notification
    if (level === 'error') {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('app:log-error', { context, message, details: detailsStr, tenantId })
        }
      })
    }
  }

  static getLogs(limit = 100, offset = 0, tenantId?: string) {
    try {
      if (tenantId) {
        const logs = db
          .prepare(`SELECT * FROM app_logs WHERE tenant_id = ? OR tenant_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`)
          .all(tenantId, limit, offset)
        const countResult = db.prepare(`SELECT COUNT(*) as total FROM app_logs WHERE tenant_id = ? OR tenant_id IS NULL`).get(tenantId) as { total: number }
        return { success: true, logs, total: countResult.total }
      } else {
        const logs = db
          .prepare(`SELECT * FROM app_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`)
          .all(limit, offset)
        const countResult = db.prepare(`SELECT COUNT(*) as total FROM app_logs`).get() as { total: number }
        return { success: true, logs, total: countResult.total }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  static clearLogs(tenantId?: string) {
    try {
      if (tenantId) {
         db.prepare(`DELETE FROM app_logs WHERE tenant_id = ? OR tenant_id IS NULL`).run(tenantId)
      } else {
         db.prepare(`DELETE FROM app_logs`).run()
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
}
