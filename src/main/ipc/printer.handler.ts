/**
 * printer.handler.ts — Gestionnaires IPC pour Imprimante Thermique POS ESC/POS
 *
 * Fournit l'impression de tickets thermiques, la découverte des imprimantes et les tests.
 * RBAC: 'payments' ou 'cash_journal'.
 *
 * @module PrinterHandler
 */

import { ipcMain } from 'electron'
import { ThermalPrinterService, ReceiptData } from '../services/thermal-printer.service'
import { canRead, getCurrentUser } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { PaymentRepository } from '../database/repositories/payment.repository'
import db from '../database/db'

export function registerPrinterHandlers(): void {
  // --------------------------------------------
  // PRINT RECEIPT (Thermal ESC/POS 80mm / 58mm)
  // --------------------------------------------
  ipcMain.handle('printer:printReceipt', async (_, paymentData: ReceiptData, copies?: number) => {
    if (!canRead('payments') && !canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const user = getCurrentUser()
      const cashierName =
        paymentData.cashier_name || user?.full_name || user?.username || 'Caisse'

      // Lookup payment if payment_id or receipt_number is present
      const identifier = paymentData.payment_id || paymentData.receipt_number
      const paymentIds = paymentData.payment_ids || (paymentData.payment_id ? [paymentData.payment_id] : [])
      let isDuplicate = paymentData.is_duplicate ?? false
      let duplicateNumber = paymentData.duplicate_number

      if (paymentIds.length > 0) {
        const placeholders = paymentIds.map(() => '?').join(',')
        const payments = db
          .prepare(
            `
          SELECT id, receipt_number, print_count, payment_date 
          FROM student_payments 
          WHERE id IN (${placeholders}) OR receipt_number IN (${placeholders})
        `
          )
          .all(...paymentIds, ...paymentIds) as Array<{
          id: string
          receipt_number: string
          print_count: number
          payment_date: string
        }>

        if (payments.length > 0) {
          // If all payments were previously printed, whole receipt is duplicate
          const allPrinted = payments.every((p) => (p.print_count || 0) > 0)
          const maxPrints = Math.max(...payments.map((p) => p.print_count || 0))
          if (allPrinted && maxPrints > 0) {
            isDuplicate = true
            duplicateNumber = maxPrints
          }

          if (payments.length === 1) {
            if (!paymentData.receipt_number && payments[0].receipt_number) {
              paymentData.receipt_number = payments[0].receipt_number
            }
            if (!paymentData.payment_date && payments[0].payment_date) {
              paymentData.payment_date = payments[0].payment_date
            }
          }
        }
      }

      const preparedData: ReceiptData = {
        ...paymentData,
        cashier_name: cashierName,
        is_duplicate: isDuplicate,
        duplicate_number: isDuplicate ? duplicateNumber || 1 : undefined,
        reprint_date: isDuplicate ? new Date().toISOString() : undefined,
        reprint_by: isDuplicate ? cashierName : undefined
      }

      const defaultCopies =
        copies !== undefined ? copies : (Number(SettingsRepository.get('printer_copies')) || 2)
      const result = await ThermalPrinterService.printReceipt(preparedData, defaultCopies)

      if (result.success) {
        // Increment print count for all targeted payments
        for (const id of paymentIds) {
          PaymentRepository.incrementPrintCount(id, user?.username || cashierName)
        }
        logAction(
          user?.id || null,
          isDuplicate ? 'reprint_duplicate_receipt' : 'print_receipt',
          'student_payments',
          identifier || (paymentIds.length > 0 ? paymentIds[0] : null),
          null,
          JSON.stringify({
            receipt_number: preparedData.receipt_number,
            is_duplicate: isDuplicate,
            duplicate_number: preparedData.duplicate_number,
            affected_payments: paymentIds
          })
        )
      }

      return {
        ...result,
        receipt_number: preparedData.receipt_number,
        is_duplicate: isDuplicate,
        duplicate_number: preparedData.duplicate_number
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erreur lors de l'impression du ticket"
      return { success: false, error: message }
    }
  })

  // --------------------------------------------
  // GET PRINTERS LIST
  // --------------------------------------------
  ipcMain.handle('printer:getPrinters', async () => {
    try {
      return await ThermalPrinterService.getInstalledPrinters()
    } catch {
      return [{ name: 'POS-80', isDefault: true, displayName: 'POS-80' }]
    }
  })

  // --------------------------------------------
  // TEST PRINT
  // --------------------------------------------
  ipcMain.handle('printer:testPrint', async (_, sizeOrPrinterName?: string) => {
    try {
      if (sizeOrPrinterName === '58mm' || sizeOrPrinterName === '80mm') {
        return await ThermalPrinterService.printTestReceipt(undefined, sizeOrPrinterName)
      }
      return await ThermalPrinterService.printTestReceipt(sizeOrPrinterName)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur test d'impression"
      return { success: false, error: message }
    }
  })
}

// Alias pour compatibilité
export const setupPrinterHandlers = registerPrinterHandlers
