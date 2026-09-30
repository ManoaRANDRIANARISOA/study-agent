import { useState } from 'react'
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Code,
  CheckSquare,
  Square,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

export interface ExportColumn {
  key: string
  label: string
  width?: number
  defaultSelected?: boolean
}

export interface DataExportModalProps {
  isOpen: boolean
  onClose: () => void
  data: Record<string, unknown>[]
  columns?: ExportColumn[]
  availableColumns?: ExportColumn[]
  defaultFilename?: string
  title?: string
  subtitle?: string
}

type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'json'

export default function DataExportModal({
  isOpen,
  onClose,
  data,
  columns,
  availableColumns,
  defaultFilename = 'export',
  title = 'Exportation de données',
  subtitle = ''
}: DataExportModalProps) {
  const effectiveColumns = columns || availableColumns || []
  const schoolConfig = useAppStore((s) => s.schoolConfig)
  const currentYear = useAppStore((s) => s.currentYear)

  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [filename, setFilename] = useState<string>(defaultFilename)
  const [csvDelimiter, setCsvDelimiter] = useState<';' | ','>(';')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    effectiveColumns.forEach((c) => {
      if (c.defaultSelected !== false) {
        initial.add(c.key)
      }
    })
    return initial
  })

  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  if (!isOpen) return null

  const toggleColumn = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key) // Keep at least one
      } else {
        next.add(key)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedKeys(new Set(effectiveColumns.map((c) => c.key)))
  }

  const deselectAll = () => {
    if (effectiveColumns.length > 0) {
      setSelectedKeys(new Set([effectiveColumns[0].key]))
    }
  }

  const handleExport = async () => {
    if (selectedKeys.size === 0) {
      setFeedback({ type: 'error', message: 'Veuillez sélectionner au moins une colonne.' })
      return
    }

    setExporting(true)
    setFeedback(null)

    try {
      const activeColumns = effectiveColumns
        .filter((c) => selectedKeys.has(c.key))
        .map((c) => ({
          key: c.key,
          label: c.label,
          width: c.width
        }))

      const result = await window.api.export.file({
        format,
        data,
        columns: activeColumns,
        defaultFilename: filename.trim() || defaultFilename,
        title: title || schoolConfig?.school_name || 'Exportation',
        subtitle: subtitle || `Année scolaire ${currentYear}`,
        schoolName: schoolConfig?.school_name || 'Établissement Scolaire',
        schoolYear: currentYear,
        csvDelimiter
      })

      if (result.success) {
        setFeedback({
          type: 'success',
          message: `Fichier exporté avec succès !`
        })
        setTimeout(() => {
          onClose()
          setFeedback(null)
        }, 1500)
      } else {
        setFeedback({
          type: 'error',
          message: result.error || "Erreur lors de l'exportation."
        })
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "Erreur inattendue lors de l'exportation."
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {data.length} enregistrement(s) prêt(s) à être exporté(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Format de fichier
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                  format === 'xlsx'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20'
                    : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6" />
                <span className="text-xs font-semibold">Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                  format === 'csv'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                    : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <FileText className="w-6 h-6" />
                <span className="text-xs font-semibold">CSV (.csv)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                  format === 'pdf'
                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500/20'
                    : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <FileText className="w-6 h-6" />
                <span className="text-xs font-semibold">PDF (.pdf)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                  format === 'json'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20'
                    : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <Code className="w-6 h-6" />
                <span className="text-xs font-semibold">JSON (.json)</span>
              </button>
            </div>
          </div>

          {/* CSV Delimiter Option */}
          {format === 'csv' && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <span className="text-xs font-medium text-foreground">Séparateur CSV</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCsvDelimiter(';')}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-all ${
                    csvDelimiter === ';'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  Point-virgule (;)
                </button>
                <button
                  type="button"
                  onClick={() => setCsvDelimiter(',')}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-all ${
                    csvDelimiter === ','
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  Virgule (,)
                </button>
              </div>
            </div>
          )}

          {/* Filename input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Nom du fichier
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={defaultFilename}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs font-mono text-muted-foreground px-2 py-2 rounded bg-muted">
                .{format}
              </span>
            </div>
          </div>

          {/* Columns selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Colonnes à inclure ({selectedKeys.size}/{effectiveColumns.length})
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Tout cocher
                </button>
                <span className="text-muted-foreground text-xs">•</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Décocher
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-border bg-background/50">
              {effectiveColumns.map((col) => {
                const isSelected = selectedKeys.has(col.key)
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleColumn(col.key)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{col.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Feedback alert */}
          {feedback && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium animate-in fade-in ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 border border-destructive/30 text-destructive'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/40">
          <Button variant="outline" size="sm" onClick={onClose} disabled={exporting}>
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting || selectedKeys.size === 0}
            className="min-w-[120px]"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exportation...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exporter
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
