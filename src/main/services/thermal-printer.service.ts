/**
 * thermal-printer.service.ts — Service d'Impression Thermique POS ESC/POS
 *
 * Implémentation ESC/POS native pour imprimantes thermiques 80mm et 58mm (Xprinter XP-80U, POS-80, etc.).
 * Caractéristiques :
 *   - Impression directe RAW via winspool.Drv sous Windows (zéro coupure, rapide et net)
 *   - Logo d'établissement personnalisé tramé en bitmap monochrome (GS v 0)
 *   - Encodage direct des caractères accentués français (Windows-1252 / CP850)
 *   - Impression double exemplaire (Exemplaire Parent + Exemplaire Caisse/École)
 *   - Découpe automatique du papier entre les exemplaires (Massicot GS V)
 *   - Support des reçus groupés multi-paiements (ex: Inscription + Écolage + FRAM)
 *   - Dynamisme multi-tenant : nom de l'école, adresse, téléphone, devise
 *
 * @module ThermalPrinterService
 */

import { nativeImage, app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { SettingsRepository } from '../database/repositories/settings.repository'
import type { TicketZData } from '../../shared/types'

export interface ReceiptItem {
  label: string
  amount: number
  detail?: string
  payment_type?: string
  month?: string
}

export interface ReceiptData {
  student_name?: string
  student_id?: string
  student_number?: string
  registration_number?: string
  class_name?: string
  amount?: number
  payment_type?: string
  payment_date?: string
  month?: string
  receipt_number?: string
  payment_method?: string
  department?: string
  description?: string
  cashier_name?: string
  school_year?: string
  items?: ReceiptItem[]
  is_duplicate?: boolean
  duplicate_number?: number
  reprint_date?: string
  reprint_by?: string
  payment_id?: string
  payment_ids?: string[]
}

export class ThermalPrinterService {
  /**
   * Retourne le nom de l'imprimante thermique configurée
   */
  static getPrinterName(): string {
    const configured =
      (SettingsRepository.get('thermal_printer_name') as string | null) ||
      (SettingsRepository.get('printer_name') as string | null)
    return (configured && configured.trim()) || 'POS-80'
  }

  /**
   * Retourne la taille du papier configurée (80mm ou 58mm)
   */
  static getPrinterSize(): '80mm' | '58mm' {
    const size =
      (SettingsRepository.get('thermal_printer_size') as string | null) ||
      (SettingsRepository.get('printer_size') as string | null)
    return size === '58mm' ? '58mm' : '80mm'
  }

  /**
   * Formate une ligne avec texte à gauche et texte à droite sur une largeur fixe (48 colonnes pour 80mm, 32 pour 58mm)
   */
  static formatLine(left: string, right: string, width = 48): string {
    const leftLen = left.length
    const rightLen = right.length
    if (leftLen + rightLen >= width) {
      const maxLeft = Math.max(1, width - rightLen - 1)
      return left.slice(0, maxLeft) + ' ' + right + '\n'
    }
    const spaces = ' '.repeat(width - leftLen - rightLen)
    return left + spaces + right + '\n'
  }

  /**
   * Génère une ligne de séparation
   */
  static separatorLine(char = '-', width = 48): string {
    return char.repeat(width) + '\n'
  }

  /**
   * Convertit le logo de l'école PNG en image raster ESC/POS monochrome (GS v 0)
   */
  static generateLogoEscPos(targetWidth = 192): Buffer | null {
    try {
      let img: ReturnType<typeof nativeImage.createFromPath> | null = null
      const customLogo = SettingsRepository.get('school_logo') as string | null

      if (customLogo) {
        if (customLogo.startsWith('data:image/')) {
          img = nativeImage.createFromDataURL(customLogo)
        } else if (fs.existsSync(customLogo)) {
          img = nativeImage.createFromPath(customLogo)
        }
      }

      if (!img || img.isEmpty()) {
        const isDev = !app.isPackaged
        const defaultLogoPath = isDev
          ? path.join(process.cwd(), 'resources', 'logo.png')
          : path.join(process.resourcesPath, 'logo.png')

        if (fs.existsSync(defaultLogoPath)) {
          img = nativeImage.createFromPath(defaultLogoPath)
        }
      }

      if (!img || img.isEmpty()) {
        return null
      }

      const size = img.getSize()
      if (!size.width || !size.height) return null

      // La largeur cible doit être divisible par 8
      const width = Math.round(targetWidth / 8) * 8
      const height = Math.round((size.height * width) / size.width)

      const resized = img.resize({ width, height, quality: 'best' })
      const rawBitmap = resized.toBitmap() // BGRA

      const bytesWidth = width / 8
      const rasterData = Buffer.alloc(bytesWidth * height, 0)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * 4
          const b = rawBitmap[pixelIndex]
          const g = rawBitmap[pixelIndex + 1]
          const r = rawBitmap[pixelIndex + 2]
          const a = rawBitmap[pixelIndex + 3]

          let isBlack = false
          if (a > 64) {
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b
            isBlack = luminance < 170
          }

          if (isBlack) {
            const byteIndex = y * bytesWidth + Math.floor(x / 8)
            const bitPosition = 7 - (x % 8)
            rasterData[byteIndex] |= 1 << bitPosition
          }
        }
      }

      // GS v 0 m xL xH yL yH d1...dk
      const header = Buffer.from([
        0x1b, 0x61, 0x01, // Center align
        0x1d, 0x76, 0x30, 0x00, // GS v 0 0
        bytesWidth & 0xff,
        (bytesWidth >> 8) & 0xff,
        height & 0xff,
        (height >> 8) & 0xff
      ])

      return Buffer.concat([header, rasterData, Buffer.from([0x0a])])
    } catch (e) {
      console.warn('Could not generate ESC/POS logo:', e)
      return null
    }
  }

  /**
   * Encode une chaîne en Windows-1252 / CP850 pour garantir le rendu parfait des accents français
   */
  static encodeText(text: string): Buffer {
    const map1252: Record<string, number> = {
      'é': 0xe9,
      'É': 0xc9,
      'è': 0xe8,
      'È': 0xc8,
      'ê': 0xea,
      'Ê': 0xca,
      'ë': 0xeb,
      'Ë': 0xcb,
      'à': 0xe0,
      'À': 0xc0,
      'â': 0xe2,
      'Â': 0xc2,
      'ä': 0xe4,
      'Ä': 0xc4,
      'î': 0xee,
      'Î': 0xce,
      'ï': 0xef,
      'Ï': 0xcf,
      'ô': 0xf4,
      'Ô': 0xd4,
      'ö': 0xf6,
      'Ö': 0xd6,
      'ù': 0xf9,
      'Ù': 0xd9,
      'û': 0xfb,
      'Û': 0xdb,
      'ü': 0xfc,
      'Ü': 0xdc,
      'ç': 0xe7,
      'Ç': 0xc7,
      '°': 0xb0,
      '€': 0x80,
      '’': 0x27,
      '‘': 0x27,
      '“': 0x22,
      '”': 0x22,
      '–': 0x2d,
      '—': 0x2d,
      '«': 0xab,
      '»': 0xbb
    }

    const bytes: number[] = []
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (map1252[char] !== undefined) {
        bytes.push(map1252[char])
      } else {
        const code = char.charCodeAt(0)
        bytes.push(code <= 0xff ? code : 0x3f) // '?' si inconnu
      }
    }
    return Buffer.from(bytes)
  }

  /**
   * Construit le flux ESC/POS pour un exemplaire de reçu (Modèle unique harmonisé)
   */
  static buildSingleReceiptBytes(
    data: ReceiptData,
    copyType: 'PARENT' | 'CAISSE' | 'UNIQUE',
    size: '80mm' | '58mm' = '80mm'
  ): Buffer {
    const lineWidth = size === '58mm' ? 32 : 48
    const buffers: Buffer[] = []

    // 1. Initialisation ESC/POS & annulation mode chinois
    buffers.push(
      Buffer.from([
        0x1b, 0x40, // ESC @ - Initialize
        0x1c, 0x2e, // FS .  - Cancel Chinese character mode
        0x1b, 0x74, 0x10 // ESC t 16 - WPC1252 character table
      ])
    )

    // 2. Logo de l'école (si disponible)
    const logoBuffer = this.generateLogoEscPos(size === '58mm' ? 144 : 192)
    if (logoBuffer) {
      buffers.push(logoBuffer)
    }

    // 3. En-tête de l'école (dynamique multi-tenant)
    const schoolName = ((SettingsRepository.get('school_name') as string) || 'STUDY AGENT').toUpperCase()
    const schoolAddress = (SettingsRepository.get('school_address') as string) || ''
    const schoolCity = (SettingsRepository.get('school_city') as string) || ''
    const schoolPhone = (SettingsRepository.get('school_phone') as string) || ''
    const currency = (SettingsRepository.get('currency') as string) || 'Ar'

    // Centrage
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // ESC a 1 (Center)

    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Nom d'école en double hauteur / gras
    buffers.push(Buffer.from([0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01])) // Bold + Double height
    buffers.push(this.encodeText(schoolName + '\n'))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00])) // Reset

    // Adresse & Contacts
    if (schoolAddress || schoolCity) {
      buffers.push(this.encodeText(`${schoolAddress}${schoolAddress && schoolCity ? ', ' : ''}${schoolCity}\n`))
    }
    if (schoolPhone) {
      buffers.push(this.encodeText(`Tél : ${schoolPhone}\n`))
    }

    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // 4. Titre de l'exemplaire (Badge clair Original vs Duplicata)
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    if (data.is_duplicate) {
      const dupNum = data.duplicate_number || 2
      buffers.push(this.encodeText(`*** DUPLICATA OFFICIEL N° ${dupNum} ***\n`))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00]))
      buffers.push(this.encodeText('(RÉIMPRESSION - VALEUR INFORMATIVE)\n'))
    } else {
      if (copyType === 'PARENT') {
        buffers.push(this.encodeText('*** REÇU — EXEMPLAIRE PARENT / ÉLÈVE ***\n'))
      } else if (copyType === 'CAISSE') {
        buffers.push(this.encodeText('*** REÇU — SOUCHE CAISSE / ARCHIVE ***\n'))
      } else {
        buffers.push(this.encodeText('*** REÇU DE PAIEMENT ***\n'))
      }
      buffers.push(Buffer.from([0x1b, 0x45, 0x00]))
    }

    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // 5. Métadonnées du reçu (Alignement à gauche)
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Align Left

    const receiptNum = data.receipt_number || `REC-${Date.now().toString().slice(-6)}`
    const dateFormatted = data.payment_date
      ? new Date(data.payment_date).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : new Date().toLocaleDateString('fr-FR')
    const timeFormatted = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    })

    const cashier = data.cashier_name || 'Administrateur'

    if (data.is_duplicate) {
      buffers.push(this.encodeText(`N° Reçu       : ${receiptNum}\n`))
      if (data.payment_date) {
        buffers.push(this.encodeText(`Date Origine  : ${dateFormatted}\n`))
      }
      const reprintDate = data.reprint_date
        ? new Date(data.reprint_date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : `${new Date().toLocaleDateString('fr-FR')} à ${timeFormatted}`
      buffers.push(this.encodeText(`Date Tirage   : ${reprintDate}\n`))
      buffers.push(this.encodeText(`Caissier      : ${cashier}\n`))
    } else {
      buffers.push(this.encodeText(`N° Reçu  : ${receiptNum}\n`))
      buffers.push(this.encodeText(`Date     : ${dateFormatted} à ${timeFormatted}\n`))
      buffers.push(this.encodeText(`Caissier : ${cashier}\n`))
    }

    // Bloc Élève & Matricule (Toujours présent)
    if (data.student_name && data.student_name !== '—') {
      buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
      buffers.push(this.encodeText(`Élève    : ${data.student_name}\n`))

      const matricule = data.registration_number || data.student_number || data.student_id || '-'
      const className = data.class_name || '-'
      buffers.push(this.encodeText(this.formatLine(`Matr. : ${matricule}`, `Classe: ${className}`, lineWidth)))
    }

    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    // 6. Tableau des paiements (Format harmonisé)
    const items: ReceiptItem[] =
      data.items && data.items.length > 0
        ? data.items
        : [
            {
              label:
                data.payment_type === 'tuition'
                  ? `Écolage (${data.month || '-'})`
                  : data.payment_type === 'enrollment'
                    ? "Droit d'inscription"
                    : data.payment_type === 'reenrollment'
                      ? 'Droit de réinscription'
                      : data.payment_type === 'fram'
                        ? 'Cotisation FRAM'
                        : data.payment_type === 'canteen'
                          ? `Cantine (${data.month || '-'})`
                          : data.payment_type === 'bus'
                            ? `Transport Bus (${data.month || '-'})`
                            : data.description || 'Paiement',
              amount: data.amount || 0,
              detail: data.month
            }
          ]

    // En-tête des colonnes
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('DÉSIGNATION DES PAIEMENTS', 'MONTANT', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    let totalAmount = 0
    for (const item of items) {
      totalAmount += item.amount
      const formattedItemAmount = `${Number(item.amount).toLocaleString('fr-FR')} ${currency}`
      buffers.push(this.encodeText(this.formatLine(item.label, formattedItemAmount, lineWidth)))
      if (item.detail && !item.label.includes(item.detail)) {
        buffers.push(this.encodeText(`  > ${item.detail}\n`))
      }
    }

    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    // Mode de règlement
    const methodLabel =
      data.payment_method === 'mobile_money'
        ? 'Mobile Money'
        : data.payment_method === 'transfer'
          ? 'Virement Bancaire'
          : data.payment_method === 'check'
            ? 'Chèque'
            : data.payment_method === 'discount'
              ? 'Remise'
              : 'Espèces'

    buffers.push(this.encodeText(`Règlement: ${methodLabel}\n`))
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // 7. Total Général Encaissé
    const formattedTotal = `${Number(totalAmount).toLocaleString('fr-FR')} ${currency}`
    buffers.push(Buffer.from([0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01])) // Bold + Double height
    buffers.push(this.encodeText(this.formatLine('TOTAL ENCAISSÉ', formattedTotal, lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00])) // Reset

    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // 8. Pied de page & Signature
    if (data.is_duplicate) {
      buffers.push(this.encodeText('Ce duplicata certifie le paiement enregistré.\n\n'))
    } else {
      buffers.push(this.encodeText('Conservez ce reçu pour tout contrôle.\n\n'))
    }
    buffers.push(this.encodeText('Signature & Cachet Caisse :\n\n'))
    buffers.push(this.encodeText('............................\n'))

    // 9. Avance de papier et découpe massicot (GS V \x41 \x03)
    buffers.push(
      Buffer.from([
        0x0a, 0x0a, 0x0a, 0x0a, // 4 Line feeds
        0x1d, 0x56, 0x41, 0x03 // GS V 65 3 (Partial cut with feed)
      ])
    )

    return Buffer.concat(buffers)
  }

  /**
   * Envoi du buffer d'octets bruts au spooler Windows via winspool
   */
  static async sendBytesToPrinter(
    printerName: string,
    bytes: Buffer,
    docName = 'Ticket de Caisse'
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const b64 = bytes.toString('base64')
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;

public class RawSpooler {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytes(string szPrinterName, byte[] pBytes, string docName) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = docName;
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bool success = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    ClosePrinter(hPrinter);
                    return success;
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return false;
    }
}
'@

try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # Already loaded in session
}

$bytes = [Convert]::FromBase64String("${b64}")
$res = [RawSpooler]::SendBytes("${printerName.replace(/"/g, '')}", $bytes, "${docName.replace(/"/g, '')}")
if ($res) {
    Write-Output "SUCCESS"
} else {
    Write-Output "FAILED"
}
`

      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      let stdout = ''
      let stderr = ''

      ps.stdout.on('data', (d) => {
        stdout += d.toString()
      })
      ps.stderr.on('data', (d) => {
        stderr += d.toString()
      })

      ps.on('close', (code) => {
        if (code === 0 && stdout.includes('SUCCESS')) {
          resolve({ success: true })
        } else {
          resolve({
            success: false,
            error:
              stderr ||
              `Échec d'impression sur '${printerName}'. Vérifiez que l'imprimante est allumée et branchée en USB.`
          })
        }
      })

      ps.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Imprime un reçu complet avec 1 ou 2 exemplaires
   */
  static async printReceipt(
    data: ReceiptData,
    copies = 2,
    customPrinterName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const printerName = customPrinterName || this.getPrinterName()
      const size = this.getPrinterSize()
      const defaultCopies =
        copies !== undefined ? copies : (Number(SettingsRepository.get('printer_copies')) || 2)

      const buffers: Buffer[] = []

      // Exemplaire 1: Parent
      buffers.push(this.buildSingleReceiptBytes(data, defaultCopies >= 2 ? 'PARENT' : 'UNIQUE', size))

      // Exemplaire 2: École / Caisse
      if (defaultCopies >= 2) {
        buffers.push(this.buildSingleReceiptBytes(data, 'CAISSE', size))
      }

      const allBytes = Buffer.concat(buffers)
      return await this.sendBytesToPrinter(
        printerName,
        allBytes,
        `Reçu ${data.receipt_number || data.student_name || ''}`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur impression thermique'
      return { success: false, error: message }
    }
  }

  /**
   * Imprime un ticket de test
   */
  static async printTestReceipt(
    customPrinterName?: string,
    size?: '58mm' | '80mm'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const printerName = customPrinterName || this.getPrinterName()
      const targetSize = size || this.getPrinterSize()
      const lineWidth = targetSize === '58mm' ? 32 : 48
      const schoolName = ((SettingsRepository.get('school_name') as string) || 'STUDY AGENT').toUpperCase()

      const buffers: Buffer[] = []
      buffers.push(
        Buffer.from([
          0x1b, 0x40,
          0x1c, 0x2e,
          0x1b, 0x74, 0x10
        ])
      )

      const logoBuffer = this.generateLogoEscPos(targetSize === '58mm' ? 144 : 192)
      if (logoBuffer) buffers.push(logoBuffer)

      buffers.push(Buffer.from([0x1b, 0x61, 0x01]))
      buffers.push(Buffer.from([0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01]))
      buffers.push(this.encodeText(`${schoolName}\n`))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00, 0x1d, 0x21, 0x00]))

      buffers.push(this.encodeText('*** TEST DE CONNEXION ***\n\n'))
      buffers.push(Buffer.from([0x1b, 0x61, 0x00]))
      buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))
      buffers.push(this.encodeText(this.formatLine('Imprimante', printerName, lineWidth)))
      buffers.push(this.encodeText(this.formatLine('Largeur', targetSize, lineWidth)))
      buffers.push(
        this.encodeText(
          this.formatLine('Date/Heure', new Date().toLocaleString('fr-FR'), lineWidth)
        )
      )
      buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
      buffers.push(this.encodeText('Accents français : é, è, ê, à, ç, ô, ù, €\n'))
      buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

      buffers.push(Buffer.from([0x1b, 0x61, 0x01]))
      buffers.push(this.encodeText('✓ Configuration thermique opérationnelle !\n'))

      buffers.push(
        Buffer.from([
          0x0a, 0x0a, 0x0a, 0x0a,
          0x1d, 0x56, 0x41, 0x03
        ])
      )

      const allBytes = Buffer.concat(buffers)
      return await this.sendBytesToPrinter(printerName, allBytes, 'Test Impression Thermique')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur test impression'
      return { success: false, error: message }
    }
  }

  /**
   * Découverte des imprimantes installées sur le système Windows
   */
  static async getInstalledPrinters(): Promise<Array<{ name: string; isDefault?: boolean; displayName?: string }>> {
    try {
      const win = new BrowserWindow({ show: false, width: 100, height: 100 })
      const printers = await win.webContents.getPrintersAsync()
      win.destroy()
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: p.isDefault
      }))
    } catch {
      return [{ name: 'POS-80', displayName: 'POS-80 (Par défaut)', isDefault: true }]
    }
  }
  /**
   * Génère le buffer ESC/POS pour le Ticket Z officiel de Clôture de Caisse (Avenant N°3)
   */
  static generateTicketZEscPos(data: TicketZData): Buffer {
    const buffers: Buffer[] = []
    const lineWidth = 48

    // 1. Initialize printer: ESC @ (Initialize)
    buffers.push(Buffer.from([0x1b, 0x40]))

    // 2. DISABLE Chinese/Kanji mode: FS . (0x1C, 0x2E) - CRITICAL for Xprinter POS-80
    buffers.push(Buffer.from([0x1c, 0x2e]))

    // 3. Set character code table: ESC t 16 (Windows-1252 / WPC1252)
    buffers.push(Buffer.from([0x1b, 0x74, 0x10]))

    // 4. Print Logo if available (Centered)
    const logoBytes = this.generateLogoEscPos(192)
    if (logoBytes) {
      buffers.push(logoBytes)
    }

    // 5. Header: School Name (Centered, Double Height, Bold)
    const schoolName = (SettingsRepository.get('school_name') as string) || 'STUDY AGENT'
    const schoolAddress = (SettingsRepository.get('school_address') as string) || ''
    const schoolCity = (SettingsRepository.get('school_city') as string) || ''
    const currency = (SettingsRepository.get('currency') as string) || 'Ar'

    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(Buffer.from([0x1d, 0x21, 0x01])) // Double height
    buffers.push(this.encodeText(`${schoolName.toUpperCase()}\n`))

    buffers.push(Buffer.from([0x1d, 0x21, 0x00])) // Normal size
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    if (schoolAddress) buffers.push(this.encodeText(`${schoolAddress}\n`))
    if (schoolCity) buffers.push(this.encodeText(`${schoolCity}\n`))
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Titre Officiel Ticket Z
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(Buffer.from([0x1d, 0x21, 0x01])) // Double height
    buffers.push(this.encodeText('*** TICKET Z — CLÔTURE DE CAISSE ***\n'))
    buffers.push(Buffer.from([0x1d, 0x21, 0x00])) // Normal size
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Métadonnées Clôture
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left align
    const now = new Date()
    const timeFormatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    buffers.push(this.encodeText(this.formatLine(`Date Clôture : ${data.closure_date}`, `Heure: ${timeFormatted}`, lineWidth)))
    buffers.push(this.encodeText(this.formatLine(`Opérateur    : ${data.cashier}`, `Poste: ${data.station_code}`, lineWidth)))
    if (data.first_receipt && data.last_receipt) {
      buffers.push(this.encodeText(this.formatLine(`Reçus émis   : Du ${data.first_receipt}`, '', lineWidth)))
      buffers.push(this.encodeText(this.formatLine(`             : Au ${data.last_receipt}`, '', lineWidth)))
    }
    buffers.push(this.encodeText(this.formatLine(`Total Tickets: ${data.total_tickets}`, '', lineWidth)))
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    // Section 1: Ventilation Théorique Logiciel
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('VENTILATION THÉORIQUE LOGICIEL', 'MONTANT', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    const fmt = (n: number) => `${Number(n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} ${currency}`

    buffers.push(this.encodeText(this.formatLine('  Espèces encaissées', fmt(data.expected_cash), lineWidth)))
    buffers.push(this.encodeText(this.formatLine('  Chèques remis', fmt(data.expected_check), lineWidth)))
    buffers.push(this.encodeText(this.formatLine('  Mobile Money (MVola/...)', fmt(data.expected_mobile), lineWidth)))
    if (data.expected_transfer > 0) {
      buffers.push(this.encodeText(this.formatLine('  Virements bancaires', fmt(data.expected_transfer), lineWidth)))
    }
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('TOTAL THÉORIQUE CAISSE', fmt(data.expected_total), lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Section 2: Billetage Physique Constaté (Tiroir)
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('BILLETAGE PHYSIQUE DU TIROIR', 'TOTAL', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))

    const bd = data.breakdown || { b20000: 0, b10000: 0, b5000: 0, b2000: 0, b1000: 0, b500: 0, b200: 0, b100: 0 }
    if (bd.b20000 && bd.b20000 > 0) buffers.push(this.encodeText(this.formatLine(`  20 000 ${currency} x ${bd.b20000}`, fmt(bd.b20000 * 20000), lineWidth)))
    if (bd.b10000 && bd.b10000 > 0) buffers.push(this.encodeText(this.formatLine(`  10 000 ${currency} x ${bd.b10000}`, fmt(bd.b10000 * 10000), lineWidth)))
    if (bd.b5000 && bd.b5000 > 0)   buffers.push(this.encodeText(this.formatLine(`   5 000 ${currency} x ${bd.b5000}`, fmt(bd.b5000 * 5000), lineWidth)))
    if (bd.b2000 && bd.b2000 > 0)   buffers.push(this.encodeText(this.formatLine(`   2 000 ${currency} x ${bd.b2000}`, fmt(bd.b2000 * 2000), lineWidth)))
    if (bd.b1000 && bd.b1000 > 0)   buffers.push(this.encodeText(this.formatLine(`   1 000 ${currency} x ${bd.b1000}`, fmt(bd.b1000 * 1000), lineWidth)))
    if (bd.b500 && bd.b500 > 0)     buffers.push(this.encodeText(this.formatLine(`     500 ${currency} x ${bd.b500}`, fmt(bd.b500 * 500), lineWidth)))
    if (bd.b200 && bd.b200 > 0)     buffers.push(this.encodeText(this.formatLine(`     200 ${currency} x ${bd.b200}`, fmt(bd.b200 * 200), lineWidth)))
    if (bd.b100 && bd.b100 > 0)     buffers.push(this.encodeText(this.formatLine(`     100 ${currency} x ${bd.b100}`, fmt(bd.b100 * 100), lineWidth)))
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('TOTAL ESPÈCES CONSTATÉ', fmt(data.counted_cash), lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Section 3: Rapprochement & Écart
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    const diff = data.cash_difference || 0
    if (diff === 0) {
      buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
      buffers.push(this.encodeText(`*** RAPPROCHEMENT : EXACT (0 ${currency} d'écart) ***\n`))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    } else if (diff < 0) {
      buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
      buffers.push(this.encodeText(`*** ALERTE : MANQUANT DE ${fmt(Math.abs(diff))} ***\n`))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    } else {
      buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
      buffers.push(this.encodeText(`*** NOTIFICATION : SURPLUS DE ${fmt(diff)} ***\n`))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    }
    buffers.push(this.encodeText(this.separatorLine('=', lineWidth)))

    // Remarque / Notes
    if (data.notes) {
      buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left align
      buffers.push(this.encodeText(`Note / Justificatif : ${data.notes}\n`))
      buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
    }

    // Visa Contradictoire (Double Signature)
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText('VISA CONTRADICTOIRE & ATTESTATION DE CLÔTURE :\n\n'))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText('Signature Caissier :        Visa & Émargement Direction :\n\n\n'))
    buffers.push(this.encodeText('......................      ............................\n'))
    buffers.push(this.encodeText(this.separatorLine('-', lineWidth)))
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    buffers.push(this.encodeText('Document officiel scellé — Ne pas jeter\n'))

    // Auto-cutter: Feed 4 lines past printhead + Safe Partial Cut
    buffers.push(Buffer.from([0x1b, 0x64, 0x04]))
    buffers.push(Buffer.from([0x1d, 0x56, 0x01]))

    return Buffer.concat(buffers)
  }

  static async printTicketZ(
    data: TicketZData,
    copies = 1
  ): Promise<{ success: boolean; error?: string }> {
    const printerName = this.getPrinterName()
    try {
      const zBuffer = this.generateTicketZEscPos(data)
      for (let i = 0; i < copies; i++) {
        const res = await this.sendBytesToPrinter(printerName, zBuffer, 'Ticket Z Cloture')
        if (!res.success) return res
      }
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}
