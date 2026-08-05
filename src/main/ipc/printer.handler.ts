import { ipcMain } from 'electron'
import { PrinterService } from '../services/printer.service'

export function setupPrinterHandlers() {
  ipcMain.handle('printer:getPrinters', async () => {
    return await PrinterService.getPrinters()
  })

  ipcMain.handle('printer:printReceipt', async (_, data) => {
    return await PrinterService.printReceipt(data)
  })

  ipcMain.handle('printer:testPrint', async (_, size) => {
    return await PrinterService.printTest(size)
  })
}
