import { ipcMain } from 'electron'
import { LoggerService } from '../services/logger.service'

export function registerLogHandlers(): void {
  ipcMain.handle('logs:get', async (_, limit = 100, offset = 0, tenantId?: string) => {
    return LoggerService.getLogs(limit, offset, tenantId)
  })

  ipcMain.handle('logs:clear', async (_, tenantId?: string) => {
    return LoggerService.clearLogs(tenantId)
  })
}
