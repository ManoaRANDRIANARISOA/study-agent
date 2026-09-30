/**
 * export.service.ts — Service d'Export Multi-Formats Modulaire
 *
 * Supporte les exports vers Excel (.xlsx/.xls SpreadsheetML), CSV (UTF-8 BOM),
 * PDF (Tableau paysage A4 avec en-têtes dynamiques), et JSON.
 *
 * @module ExportService
 */

import { dialog } from 'electron'
import fs from 'fs'
import { jsPDF } from 'jspdf'
import { SettingsRepository } from '../database/repositories/settings.repository'

export interface ExportColumn {
  key: string
  label: string
  width?: number
}

export interface ExportOptions {
  format: 'xlsx' | 'xls' | 'csv' | 'json' | 'pdf'
  data: Record<string, unknown>[]
  columns: ExportColumn[]
  defaultFilename?: string
  title?: string
  subtitle?: string
  schoolName?: string
  schoolYear?: string
  csvDelimiter?: ';' | ','
}

export class ExportService {
  /**
   * Point d'entrée principal pour exporter des données vers le format spécifié.
   */
  static async exportData(
    options: ExportOptions
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const dynamicSchoolName =
        (SettingsRepository.get('school_name') as string) || 'Study Agent'
      const dynamicSchoolYear =
        (SettingsRepository.get('school_year') as string) || ''

      const {
        format = 'xlsx',
        data,
        columns,
        defaultFilename,
        title = 'Export des données',
        subtitle = '',
        schoolName = dynamicSchoolName,
        schoolYear = dynamicSchoolYear,
        csvDelimiter = ';'
      } = options

      if (!data || data.length === 0) {
        return { success: false, error: 'Aucune donnée à exporter' }
      }

      if (!columns || columns.length === 0) {
        return { success: false, error: 'Aucune colonne sélectionnée' }
      }

      const timestamp = new Date().toISOString().split('T')[0]
      let ext = 'xlsx'
      let filterName = 'Excel'
      let baseFilename = defaultFilename || `export_${timestamp}`

      if (format === 'csv') {
        ext = 'csv'
        filterName = 'CSV (Séparateur point-virgule/virgule)'
      } else if (format === 'pdf') {
        ext = 'pdf'
        filterName = 'Document PDF'
      } else if (format === 'json') {
        ext = 'json'
        filterName = 'Fichier JSON'
      } else if (format === 'xls' || format === 'xlsx') {
        ext = 'xls'
        filterName = 'Feuille de calcul Excel'
      }

      if (!baseFilename.toLowerCase().endsWith(`.${ext}`)) {
        baseFilename = `${baseFilename}.${ext}`
      }

      const result = await dialog.showSaveDialog({
        title: `Exporter (${filterName})`,
        defaultPath: baseFilename,
        filters: [{ name: filterName, extensions: [ext] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: "Export annulé par l'utilisateur" }
      }

      const targetPath = result.filePath

      switch (format) {
        case 'csv': {
          const csvContent = this.generateCSV(data, columns, csvDelimiter)
          fs.writeFileSync(targetPath, '\uFEFF' + csvContent, 'utf-8')
          break
        }
        case 'json': {
          const jsonContent = JSON.stringify(data, null, 2)
          fs.writeFileSync(targetPath, jsonContent, 'utf-8')
          break
        }
        case 'xls':
        case 'xlsx': {
          const excelXml = this.generateExcelXML({
            data,
            columns,
            title,
            subtitle,
            schoolName,
            schoolYear
          })
          fs.writeFileSync(targetPath, excelXml, 'utf-8')
          break
        }
        case 'pdf': {
          await this.generatePDF({
            data,
            columns,
            targetPath,
            title,
            subtitle,
            schoolName,
            schoolYear
          })
          break
        }
        default:
          return { success: false, error: `Format non supporté: ${format}` }
      }

      return { success: true, filePath: targetPath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'export"
      console.error('[ExportService] Export error:', error)
      return { success: false, error: message }
    }
  }

  /**
   * Helper rétrocompatible pour l'export CSV simple.
   */
  static async exportToCSV(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    defaultFilename: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return this.exportData({
      format: 'csv',
      data,
      columns,
      defaultFilename
    })
  }

  /**
   * Génère le contenu CSV avec en-têtes et délimiteur.
   */
  private static generateCSV(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    delimiter: string = ';'
  ): string {
    const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(delimiter)
    const rows = data.map((row) =>
      columns
        .map((c) => {
          let val = row[c.key]
          if (val === null || val === undefined) return '""'
          if (typeof val === 'boolean') val = val ? 'Oui' : 'Non'
          if (Array.isArray(val)) val = val.join(', ')
          const str = String(val).replace(/"/g, '""')
          return `"${str}"`
        })
        .join(delimiter)
    )

    return [header, ...rows].join('\r\n')
  }

  /**
   * Génère un classeur XML SpreadsheetML Excel natif.
   */
  private static generateExcelXML(opts: {
    data: Record<string, unknown>[]
    columns: ExportColumn[]
    title: string
    subtitle: string
    schoolName: string
    schoolYear: string
  }): string {
    const { data, columns, title, subtitle, schoolName, schoolYear } = opts

    const escapeXml = (str: unknown): string => {
      if (str === null || str === undefined) return ''
      if (typeof str === 'boolean') return str ? 'Oui' : 'Non'
      if (Array.isArray(str)) return str.join(', ')
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }

    const columnDefs = columns
      .map((c) => {
        const width = Math.max((c.label.length || 10) * 10, 110)
        return `<Column ss:Width="${width}"/>`
      })
      .join('\n      ')

    const headerCells = columns
      .map(
        (c) =>
          `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`
      )
      .join('\n        ')

    const dataRows = data
      .map((row, idx) => {
        const styleId = idx % 2 === 0 ? 'DataStyleEven' : 'DataStyleOdd'
        const cells = columns
          .map((c) => {
            const rawVal = row[c.key]
            let val = escapeXml(rawVal)
            let type = 'String'

            if (
              typeof rawVal === 'number' &&
              !isNaN(rawVal) &&
              !c.key.includes('contact') &&
              !c.key.includes('phone') &&
              !c.key.includes('matricule') &&
              !c.key.includes('registration_number')
            ) {
              type = 'Number'
              val = String(rawVal)
            }

            return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${val}</Data></Cell>`
          })
          .join('\n        ')

        return `      <Row ss:Height="20">\n        ${cells}\n      </Row>`
      })
      .join('\n')

    const nowFormatted = new Date().toLocaleString('fr-FR')
    const colSpan = Math.max(columns.length - 1, 1)

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXml(title)}</Title>
  <Author>${escapeXml(schoolName)}</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1F2937"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#1E3A8A"/>
  </Style>
  <Style ss:ID="SchoolStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#4B5563"/>
  </Style>
  <Style ss:ID="SubtitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Italic="1" ss:Color="#6B7280"/>
  </Style>
  <Style ss:ID="MetaStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#9CA3AF"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyleEven">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyleOdd">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Export">
  <Table ss:ExpandedColumnCount="${columns.length + 2}" ss:ExpandedRowCount="${data.length + 10}" x:FullColumns="1" x:FullRows="1">
      ${columnDefs}
      <Row ss:Height="24">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="SchoolStyle"><Data ss:Type="String">${escapeXml(schoolName)}</Data></Cell>
      </Row>
      <Row ss:Height="28">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="TitleStyle"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>
      </Row>
      ${
        subtitle || schoolYear
          ? `<Row ss:Height="18">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="SubtitleStyle"><Data ss:Type="String">${escapeXml([schoolYear ? `Année scolaire : ${schoolYear}` : '', subtitle].filter(Boolean).join('  |  '))}</Data></Cell>
      </Row>`
          : ''
      }
      <Row ss:Height="16">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="MetaStyle"><Data ss:Type="String">Généré le : ${nowFormatted}  |  Total enregistrements : ${data.length}</Data></Cell>
      </Row>
      <Row ss:Height="8"/>
      <Row ss:Height="26">
        ${headerCells}
      </Row>
${dataRows}
  </Table>
 </Worksheet>
</Workbook>`
  }

  /**
   * Génère un tableau PDF A4 Paysage élégant et paginé avec jsPDF.
   */
  private static async generatePDF(opts: {
    data: Record<string, unknown>[]
    columns: ExportColumn[]
    targetPath: string
    title: string
    subtitle: string
    schoolName: string
    schoolYear: string
  }): Promise<void> {
    const { data, columns, targetPath, title, subtitle, schoolName, schoolYear } = opts

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const pageWidth = 297
    const pageHeight = 210
    const margin = 12
    const contentWidth = pageWidth - margin * 2

    const colWidths = this.computeColWidths(columns, contentWidth)

    const rowHeight = 7
    const headerHeight = 8
    const topMargin = 38
    const bottomMargin = 15
    const maxY = pageHeight - bottomMargin

    let currentY = topMargin
    let currentPage = 1

    const drawPageHeader = () => {
      // Background Top Banner
      doc.setFillColor(30, 58, 138) // Deep Blue
      doc.rect(margin, margin - 2, contentWidth, 20, 'F')

      // School Name & Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(255, 255, 255)
      doc.text(schoolName.toUpperCase(), margin + 4, margin + 5)

      doc.setFontSize(13)
      doc.text(title, margin + 4, margin + 12)

      // Subtitle & School Year
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(203, 213, 225)
      const sub = [schoolYear ? `Année : ${schoolYear}` : '', subtitle].filter(Boolean).join('  •  ')
      if (sub) {
        doc.text(sub, margin + 4, margin + 16)
      }

      // Generation info right aligned
      const nowStr = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      doc.setFontSize(7.5)
      doc.text(`Date : ${nowStr}`, pageWidth - margin - 4, margin + 6, { align: 'right' })
      doc.text(`Total : ${data.length} entrées`, pageWidth - margin - 4, margin + 12, { align: 'right' })

      // Table Header Row
      let x = margin
      doc.setFillColor(241, 245, 249)
      doc.setDrawColor(203, 213, 225)
      doc.rect(margin, topMargin - headerHeight, contentWidth, headerHeight, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(30, 41, 59)

      columns.forEach((col, i) => {
        const w = colWidths[i]
        const label = col.label.length > 22 ? col.label.slice(0, 20) + '..' : col.label
        doc.text(label, x + 2, topMargin - headerHeight + 5)
        x += w
      })

      currentY = topMargin
    }

    const drawPageFooter = (pageNum: number) => {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(148, 163, 184)
      doc.text(`Document généré par Study Agent`, margin, pageHeight - 6)
      doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 6, { align: 'right' })
    }

    drawPageHeader()

    data.forEach((row, rowIdx) => {
      if (currentY + rowHeight > maxY) {
        drawPageFooter(currentPage)
        doc.addPage('a4', 'landscape')
        currentPage++
        drawPageHeader()
      }

      // Zebra striping
      const isEven = rowIdx % 2 === 0
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252)
      doc.setDrawColor(226, 232, 240)
      doc.rect(margin, currentY, contentWidth, rowHeight, 'FD')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(51, 65, 85)

      let x = margin
      columns.forEach((col, i) => {
        const w = colWidths[i]
        let val = row[col.key]
        if (val === null || val === undefined) val = '-'
        else if (typeof val === 'boolean') val = val ? 'Oui' : 'Non'
        else if (Array.isArray(val)) val = val.join(', ')

        let strVal = String(val)
        // Tronquer le texte si trop long
        const maxLen = Math.floor(w / 1.8)
        if (strVal.length > maxLen) {
          strVal = strVal.slice(0, Math.max(maxLen - 2, 1)) + '..'
        }

        doc.text(strVal, x + 2, currentY + 4.8)
        x += w
      })

      currentY += rowHeight
    })

    drawPageFooter(currentPage)

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    fs.writeFileSync(targetPath, pdfBuffer)
  }

  /**
   * Calcule les largeurs relatives des colonnes pour s'adapter à la largeur disponible.
   */
  private static computeColWidths(columns: ExportColumn[], totalWidth: number): number[] {
    const defaultWeights = columns.map((c) => {
      if (c.width) return c.width
      const len = c.label.length
      if (c.key.includes('name') || c.key.includes('nom')) return 28
      if (c.key.includes('email') || c.key.includes('address')) return 32
      if (c.key.includes('date') || c.key.includes('phone') || c.key.includes('contact')) return 22
      if (c.key.includes('id') || c.key.includes('matricule') || c.key.includes('class')) return 18
      if (c.key.includes('amount') || c.key.includes('montant') || c.key.includes('salary')) return 22
      return Math.max(len * 2, 16)
    })

    const totalWeight = defaultWeights.reduce((a, b) => a + b, 0)
    return defaultWeights.map((w) => (w / totalWeight) * totalWidth)
  }
}
