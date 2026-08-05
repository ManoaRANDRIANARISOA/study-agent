import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function ThermalPrinterSettings() {
  const [enabled, setEnabled] = useState(false)
  const [printers, setPrinters] = useState<any[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      const isEnabled = await window.api.settings.get('thermal_printer_enabled')
      const name = await window.api.settings.get('thermal_printer_name')
      const size = await window.api.settings.get('thermal_printer_size')
      
      setEnabled(isEnabled === 'true' || isEnabled === true)
      setSelectedPrinter((name as string) || '')
      setPaperSize((size as '58mm' | '80mm') || '80mm')

      try {
        const list = await window.api.printer.getPrinters()
        setPrinters(list || [])
      } catch (e) {
        console.error('Failed to get printers', e)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setMessage('')
    try {
      await window.api.settings.set('thermal_printer_enabled', enabled ? 'true' : 'false')
      await window.api.settings.set('thermal_printer_name', selectedPrinter)
      await window.api.settings.set('thermal_printer_size', paperSize)
      setMessage('Paramètres imprimante sauvegardés.')
    } catch (e: any) {
      setMessage('Erreur: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTestPrint = async () => {
    setMessage('Impression en cours...')
    try {
      const res = await window.api.printer.testPrint(paperSize)
      if (res.success) {
        setMessage('Impression réussie.')
      } else {
        setMessage('Erreur impression: ' + res.error)
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message)
    }
  }

  return (
    <div className="bg-white p-6 rounded shadow max-w-xl border border-gray-100 mb-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
        🖨️ Imprimante Thermique (Caisse)
      </h2>
      
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="thermal_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
          />
          <Label htmlFor="thermal_enabled" className="text-sm font-medium text-gray-700">
            Activer l'impression thermique
          </Label>
        </div>

        {enabled && (
          <>
            <div className="grid gap-2">
              <Label>Sélectionner l'imprimante</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
              >
                <option value="">-- Choisir une imprimante --</option>
                {printers.map((p, i) => (
                  <option key={i} value={p.name}>{p.displayName || p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Taille du papier (Largeur)</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as '58mm' | '80mm')}
              >
                <option value="58mm">58 mm (Petit ticket)</option>
                <option value="80mm">80 mm (Ticket standard)</option>
              </select>
            </div>
          </>
        )}

        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
          {enabled && selectedPrinter && (
            <Button variant="outline" onClick={handleTestPrint}>
              Tester l'impression
            </Button>
          )}
        </div>

        {message && (
          <p className={`text-sm font-medium mt-2 ${message.includes('Erreur') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
