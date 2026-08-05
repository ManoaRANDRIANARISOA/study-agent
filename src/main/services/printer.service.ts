import { BrowserWindow } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'
export class PrinterService {
  /**
   * Retourne la liste des imprimantes installées sur le système
   */
  static async getPrinters() {
    const win = new BrowserWindow({ show: false })
    const printers = await win.webContents.getPrintersAsync()
    win.destroy()
    return printers
  }

  /**
   * Imprime un reçu thermique (58mm ou 80mm) en arrière-plan
   */
  static async printReceipt(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      const printerName = SettingsRepository.get('thermal_printer_name') as string
      const printerSize = (SettingsRepository.get('thermal_printer_size') as string) || '80mm'
      
      if (!printerName) {
        return { success: false, error: 'Aucune imprimante configurée' }
      }

      // Largeur en pixels (approximation standard ESC/POS)
      const widthPx = printerSize === '58mm' ? 180 : 300 

      const htmlContent = this.generateReceiptHtml(data, printerSize)

      return await this.printHtml(htmlContent, printerName, widthPx)
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Imprime une page de test
   */
  static async printTest(size: '58mm' | '80mm'): Promise<{ success: boolean; error?: string }> {
    const printerName = SettingsRepository.get('thermal_printer_name') as string
    if (!printerName) {
      return { success: false, error: 'Aucune imprimante configurée' }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: monospace; text-align: center; margin: 0; padding: 10px; font-size: 12px; }
            h1 { font-size: 16px; margin-bottom: 5px; }
          </style>
        </head>
        <body>
          <h1>Test Impression</h1>
          <p>Taille: ${size}</p>
          <p>Imprimante: ${printerName}</p>
          <p>-------------------------</p>
          <p>L'impression thermique fonctionne correctement !</p>
        </body>
      </html>
    `

    const widthPx = size === '58mm' ? 180 : 300 
    return await this.printHtml(htmlContent, printerName, widthPx)
  }

  private static generateReceiptHtml(data: any, size: string): string {
    const schoolName = (SettingsRepository.get('school_name') as string) || 'Study Agent'
    const schoolAddress = (SettingsRepository.get('school_address') as string) || ''
    const schoolCity = (SettingsRepository.get('school_city') as string) || ''
    const currency = (SettingsRepository.get('currency') as string) || 'Ar'

    // Formatter le montant avec séparateurs de milliers
    const formattedAmount = Number(data.amount).toLocaleString('fr-FR')

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { margin: 0; size: ${size} auto; }
            body { 
              font-family: monospace; 
              margin: 0; 
              padding: 5px; 
              font-size: ${size === '58mm' ? '10px' : '12px'}; 
              line-height: 1.2;
              color: black;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .mb { margin-bottom: 5px; }
            .mt { margin-top: 5px; }
            .divider { border-bottom: 1px dashed black; margin: 5px 0; }
            .row { display: flex; justify-content: space-between; }
            .text-large { font-size: ${size === '58mm' ? '12px' : '14px'}; }
          </style>
        </head>
        <body>
          <div class="center bold text-large mb">${schoolName}</div>
          <div class="center mb">${schoolAddress} ${schoolCity}</div>
          <div class="divider"></div>
          <div class="center bold mb">RECU N° ${data.receiptNumber || '...'}</div>
          
          <div>Date: ${data.date}</div>
          <div>Eleve: ${data.studentName}</div>
          <div>Classe: ${data.className}</div>
          
          <div class="divider"></div>
          
          <div class="row bold">
            <span>${data.paymentTypeLabel}</span>
            <span>${formattedAmount} ${currency}</span>
          </div>
          
          <div class="divider"></div>
          
          <div>Paiement: ${data.paymentMethod}</div>
          <div>Recu par: ${data.cashier || 'Admin'}</div>
          
          <div class="divider"></div>
          <div class="center mt mb">Merci de votre confiance.</div>
        </body>
      </html>
    `
  }

  private static async printHtml(html: string, printerName: string, widthPx: number): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Create hidden window
      const win = new BrowserWindow({
        show: false,
        width: widthPx,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      // Load HTML
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

      win.webContents.on('did-finish-load', () => {
        win.webContents.print({
          silent: true,
          deviceName: printerName,
          margins: { marginType: 'none' }, // No margins, let CSS handle it
          color: false,
        }, (success, failureReason) => {
          win.destroy()
          if (success) {
            resolve({ success: true })
          } else {
            resolve({ success: false, error: failureReason || 'Erreur inconnue' })
          }
        })
      })
    })
  }
}
