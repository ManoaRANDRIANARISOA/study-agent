import { ThermalPrinterService, ReceiptData } from './thermal-printer.service'

export class PrinterService {
  static async getPrinters() {
    return await ThermalPrinterService.getInstalledPrinters()
  }

  static async printReceipt(data: ReceiptData, copies?: number) {
    return await ThermalPrinterService.printReceipt(data, copies)
  }

  static async printTest(size: '58mm' | '80mm' = '80mm') {
    return await ThermalPrinterService.printTestReceipt(undefined, size)
  }
}
