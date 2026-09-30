import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Printer, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function ThermalPrinterSettings() {
  const [enabled, setEnabled] = useState(false)
  const [printers, setPrinters] = useState<any[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm')
  const [copies, setCopies] = useState<number>(2)
  const [stationCode, setStationCode] = useState<string>('C1')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const loadSettings = async () => {
    try {
      const isEnabled = await window.api.settings.get('thermal_printer_enabled')
      const name = await window.api.settings.get('thermal_printer_name')
      const size = await window.api.settings.get('thermal_printer_size')
      const savedCopies = await window.api.settings.get('printer_copies')
      const savedStation = await window.api.settings.get('pos_station_code')

      setEnabled(isEnabled === 'true' || isEnabled === true)
      setSelectedPrinter((name as string) || '')
      setPaperSize((size as '58mm' | '80mm') || '80mm')
      setCopies(savedCopies ? Number(savedCopies) : 2)
      setStationCode((savedStation as string) || 'C1')

      fetchPrinters()
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to load printer settings', e)
    }
  }

  const fetchPrinters = async () => {
    setRefreshing(true)
    try {
      const list = await window.api.printer.getPrinters()
      setPrinters(list || [])
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to get printers', e)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await window.api.settings.set('thermal_printer_enabled', enabled ? 'true' : 'false')
      await window.api.settings.set('thermal_printer_name', selectedPrinter)
      await window.api.settings.set('thermal_printer_size', paperSize)
      await window.api.settings.set('printer_copies', String(copies))
      await window.api.settings.set('pos_station_code', stationCode.trim().toUpperCase() || 'C1')
      setMessage({ text: 'Paramètres imprimante et caisse enregistrés avec succès.', type: 'success' })
    } catch (e: any) {
      setMessage({ text: 'Erreur lors de la sauvegarde : ' + e.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleTestPrint = async (testSize?: '58mm' | '80mm') => {
    setLoading(true)
    setMessage(null)
    try {
      const sizeToUse = testSize || paperSize
      const res = await window.api.printer.testPrint(sizeToUse)
      if (res.success) {
        setMessage({ text: `Ticket test ${sizeToUse} envoyé avec succès à l'imprimante !`, type: 'success' })
      } else {
        setMessage({ text: "Erreur lors du test d'impression : " + (res.error || 'Vérifiez la connexion USB.'), type: 'error' })
      }
    } catch (e: any) {
      setMessage({ text: "Erreur : " + e.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card p-6 rounded-xl shadow-sm max-w-2xl border border-border mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Printer className="w-5 h-5 text-primary" />
          Imprimante Thermique Directe ESC/POS (Reçus de caisse)
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchPrinters}
          disabled={refreshing}
          className="text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-5">
        Impression directe instantanée en ESC/POS natif via spooler Windows pour imprimantes thermiques 80mm et 58mm (Xprinter, POS-80, Epson TM-T20, etc.). Sans boîte de dialogue système et avec découpe massicot automatique.
      </p>

      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border">
          <input
            type="checkbox"
            id="thermal_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 text-primary focus:ring-primary/30 border-border rounded cursor-pointer"
          />
          <Label htmlFor="thermal_enabled" className="text-sm font-medium text-foreground cursor-pointer">
            Activer l'impression thermique directe pour les encaissements
          </Label>
        </div>

        {enabled && (
          <div className="space-y-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="printer-select">Périphérique d'impression</Label>
              <select
                id="printer-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
              >
                <option value="">-- Sélectionner l'imprimante thermique installée --</option>
                {printers.map((p, i) => (
                  <option key={i} value={p.name}>
                    {p.displayName || p.name} {p.isDefault ? '(Par défaut)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="paper-size">Largeur de papier</Label>
                <select
                  id="paper-size"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as '58mm' | '80mm')}
                >
                  <option value="80mm">80 mm (Ticket standard - 48 caractères/ligne)</option>
                  <option value="58mm">58 mm (Petit ticket - 32 caractères/ligne)</option>
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="printer-copies">Nombre d'exemplaires par reçu</Label>
                <select
                  id="printer-copies"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  value={copies}
                  onChange={(e) => setCopies(Number(e.target.value))}
                >
                  <option value={1}>1 exemplaire (Reçu Client)</option>
                  <option value={2}>2 exemplaires (Reçu Client + Souche Caisse / Massicot)</option>
                </select>
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="station-code">Identifiant Caisse / Station de ce poste</Label>
                <input
                  id="station-code"
                  type="text"
                  maxLength={6}
                  placeholder="Ex: C1, C2, SEC1..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                />
                <p className="text-[11px] text-muted-foreground">
                  Code unique de cette machine pour la numérotation anti-collision hors-ligne (ex: <code>REC-ECOLE-<b>{stationCode || 'C1'}</b>-2026-00001</code>).
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enregistrer les paramètres
          </Button>

          {enabled && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleTestPrint('80mm')}
                disabled={loading}
              >
                Test 80mm
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTestPrint('58mm')}
                disabled={loading}
              >
                Test 58mm
              </Button>
            </div>
          )}
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm flex items-center gap-2 mt-3 ${
              message.type === 'error'
                ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {message.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
