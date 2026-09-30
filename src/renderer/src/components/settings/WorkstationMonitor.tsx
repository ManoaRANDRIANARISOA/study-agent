import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Server,
  RefreshCw,
  CheckCircle2,
  Laptop,
  Radio,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'

export interface TelemetryReportItem {
  id: number
  station: string
  hostname: string
  context: string
  message: string
  table_name?: string
  record_id?: string
  pending_count?: number
  error_details?: any
  timestamp: string
}

export const WorkstationMonitor: React.FC = () => {
  const [reports, setReports] = useState<TelemetryReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedStation, setSelectedStation] = useState<string>('ALL')
  const [limit, setLimit] = useState<number>(250)
  const [totalCloudCount, setTotalCloudCount] = useState<number>(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [isClearingCloud, setIsClearingCloud] = useState(false)

  const fetchTelemetry = async (customLimit?: number) => {
    if (!window.api?.telemetry?.fetchStationErrors) return
    const fetchLimit = customLimit ?? limit
    setLoading(true)
    try {
      const res = await window.api.telemetry.fetchStationErrors(fetchLimit)
      if (res.success && res.reports) {
        setReports(res.reports)
        setTotalCloudCount(res.totalCount ?? res.reports.length)
      } else if (res.error) {
        toast.error(`Erreur télémétrie : ${res.error}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to fetch telemetry:', err)
      toast.error(`Échec de récupération télémétrie : ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClearCloudTelemetry = async () => {
    if (
      !confirm(
        'Purger la télémétrie Cloud Supabase :\n\n' +
          "Cette action va effacer définitivement toutes les alertes et journaux d'incidents synchronisés sur Supabase pour tous les postes.\n\n" +
          'Voulez-vous continuer ?'
      )
    ) {
      return
    }

    setIsClearingCloud(true)
    try {
      if (window.api?.telemetry?.clearStationErrors) {
        const res = await window.api.telemetry.clearStationErrors()
        if (res.success) {
          toast.success('Télémétrie Cloud purgée avec succès.')
          await fetchTelemetry()
        } else {
          toast.error(`Échec de purge cloud : ${res.error || 'Erreur inconnue'}`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setIsClearingCloud(false)
    }
  }

  useEffect(() => {
    fetchTelemetry()
  }, [])

  const handleSendTestSignal = async () => {
    if (!window.api?.telemetry?.reportError) return
    setIsSendingTest(true)
    try {
      const success = await window.api.telemetry.reportError(
        'admin_probe',
        'Sonde de test télémétrique émise depuis la console Paramètres',
        { test: true, triggered_at: new Date().toISOString() }
      )
      if (success) {
        toast.success('Signal de télémétrie transmis avec succès à Supabase !')
        await fetchTelemetry()
      } else {
        toast.error("Impossible d'expédier le signal de test (vérifiez la connexion)")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleExportTelemetry = () => {
    const lines = [
      `======================================================================`,
      `       JOURNAL DE TÉLÉMÉTRIE MULTI-POSTES (INCIDENTS ET BLOCAGES)     `,
      `======================================================================`,
      `Exporté le : ${new Date().toLocaleString('fr-FR')}`,
      `Filtre     : ${selectedStation === 'ALL' ? 'Tous les postes' : `Poste ${selectedStation}`}`,
      `Total logs : ${filteredReports.length}`,
      ``
    ]

    filteredReports.forEach((r, idx) => {
      lines.push(
        `#${idx + 1} [POSTE: ${r.station}] [HÔTE: ${r.hostname || 'N/A'}] [TYPE: ${r.context}]`,
        `    Date        : ${new Date(r.timestamp).toLocaleString('fr-FR')}`,
        `    Table       : ${r.table_name || 'N/A'} (ID: ${r.record_id || 'N/A'})`,
        `    En attente  : ${r.pending_count ?? 'N/A'}`,
        `    Message     : ${r.message}`,
        `    Détails     : ${
          r.error_details
            ? typeof r.error_details === 'string'
              ? r.error_details
              : JSON.stringify(r.error_details, null, 2)
            : 'Aucun détail technique'
        }`,
        `----------------------------------------------------------------------`
      )
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `telemetrie_postes_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Group stations
  const stationsList = Array.from(new Set(reports.map((r) => r.station))).filter(Boolean)

  const filteredReports =
    selectedStation === 'ALL'
      ? reports
      : reports.filter((r) => r.station === selectedStation)

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl shadow-xs w-full border border-border space-y-5 mb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg text-primary">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Moniteur des Postes & Télémétrie Cloud
                <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                  Mouchard Supabase
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Surveillance centralisée des blocages de synchronisation et anomalies rencontrées sur chaque machine (PC1, PC2...)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm('Voulez-vous vider le journal des erreurs locales sur cette machine ?'))
                return
              if (window.api?.logs?.clear) {
                await window.api.logs.clear()
                toast.success('Journal local vidé avec succès.')
              }
            }}
            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
            title="Vider l'historique d'erreurs stocké localement sur ce PC"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-500" />
            Vider logs locaux
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearCloudTelemetry}
            disabled={isClearingCloud || reports.length === 0}
            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
            title="Purger définitivement toutes les alertes d'erreurs stockées sur Supabase"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
            {isClearingCloud ? 'Purge...' : 'Purger alertes cloud'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTelemetry}
            disabled={filteredReports.length === 0}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <FileText className="w-3.5 h-3.5 mr-1" />
            Exporter journal (.txt)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestSignal}
            disabled={isSendingTest}
            className="text-xs text-primary border-primary/30 hover:bg-primary/10"
          >
            <Radio
              className={`w-3.5 h-3.5 mr-1 ${isSendingTest ? 'animate-pulse text-primary' : ''}`}
            />
            {isSendingTest ? 'Envoi...' : 'Tester alerte poste'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => fetchTelemetry()}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Chargement...' : 'Actualiser'}
          </Button>
        </div>
      </div>

      {/* Filters & Station Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5 text-primary" />
            Filtrer par poste :
          </span>
          <button
            type="button"
            onClick={() => setSelectedStation('ALL')}
            className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
              selectedStation === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-background text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Tous ({reports.length})
          </button>
          {stationsList.map((st) => {
            const count = reports.filter((r) => r.station === st).length
            return (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStation(st)}
                className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                  selectedStation === st
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-background text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                <span>{st}</span>
                <span className="text-[10px] px-1 bg-black/10 dark:bg-white/10 rounded-full font-bold">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground self-end sm:self-auto">
          <span>Limite :</span>
          <select
            value={limit}
            onChange={(e) => {
              const val = Number(e.target.value)
              setLimit(val)
              fetchTelemetry(val)
            }}
            className="h-7 text-xs bg-background border border-border rounded px-2"
          >
            <option value={50}>50 derniers</option>
            <option value={100}>100 derniers</option>
            <option value={250}>250 derniers</option>
            <option value={500}>500 derniers</option>
          </select>
          <span className="text-[11px]">({totalCloudCount} sur Supabase)</span>
        </div>
      </div>

      {/* Reports List */}
      {filteredReports.length === 0 ? (
        <div className="p-8 text-center bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">
            Aucun incident ni blocage de poste signalé
          </h3>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-500">
            Toutes les machines synchronisent correctement et aucune anomalie persistante n'a été transmise à Supabase.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredReports.map((report) => {
            const isExpanded = expandedId === report.id
            const detailsStr = report.error_details
              ? typeof report.error_details === 'object'
                ? JSON.stringify(report.error_details, null, 2)
                : String(report.error_details)
              : null

            return (
              <div
                key={report.id}
                className="bg-background rounded-lg border border-border p-3.5 hover:border-border/80 transition-all text-xs space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded border text-[11px] ${
                        report.station === 'C1'
                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          : report.station === 'C2'
                            ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {report.station}
                    </span>
                    {report.hostname && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        ({report.hostname})
                      </span>
                    )}
                    <span className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 rounded font-medium text-[10px]">
                      {report.context}
                    </span>
                    {report.table_name && (
                      <span className="bg-muted text-foreground border border-border px-1.5 py-0.2 rounded font-mono text-[10px] flex items-center gap-1">
                        <Database className="w-2.5 h-2.5" />
                        {report.table_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(report.timestamp).toLocaleString('fr-FR')}</span>
                  </div>
                </div>

                <div className="text-foreground font-medium text-[12px] break-words">
                  {report.message}
                </div>

                {report.pending_count !== undefined && report.pending_count > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-semibold">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    File en attente sur ce poste lors de l'incident : {report.pending_count} éléments
                  </div>
                )}

                {detailsStr && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : report.id)}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Masquer les détails techniques
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Afficher les détails techniques
                        </>
                      )}
                    </button>

                    {isExpanded && (
                      <pre className="mt-2 p-2.5 bg-muted/60 rounded border border-border text-[10px] font-mono overflow-x-auto text-foreground max-h-48">
                        {detailsStr}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default WorkstationMonitor
