import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Box, Check, Loader2 } from 'lucide-react'

export default function SuperAdminBuilder() {
  const [nom, setNom] = useState('')
  const [appName, setAppName] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [cantine, setCantine] = useState(true)
  const [bus, setBus] = useState(true)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [done, setDone] = useState(false)
  
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  useEffect(() => {
    // Ecouter les logs
    if (window.api.builder) {
      window.api.builder.onLog((log) => {
        setLogs(prev => [...prev, log])
      })
    }
  }, [])

  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nom.trim()) return

    setLoading(true)
    setDone(false)
    setLogs(['--- DÉMARRAGE DU PROCESSUS ---', 'Veuillez patienter...\n'])

    const config = {
      nom,
      appName: appName || nom,
      logoBase64,
      parametrage: {
        cantine,
        bus
      }
    }

    try {
      const res = await window.api.builder.createAndBuild(config)
      if (res.success) {
        setDone(true)
      } else {
        setLogs(prev => [...prev, `\n[ERREUR] ${res.error}\n`])
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `\n[ERREUR EXCEPTION] ${err.message}\n`])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Box className="text-blue-500" /> SuperAdmin Builder
            </h1>
            <p className="text-slate-400">Création d'établissement et génération d'exécutable personnalisé</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Formulaire */}
          <div className="md:col-span-1 space-y-6 bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">Configuration</h2>
            
            <form onSubmit={handleBuild} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Nom de l'établissement</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  value={nom}
                  onChange={(e) => {
                    setNom(e.target.value)
                    if (!appName) setAppName(e.target.value) // Auto-fill
                  }}
                  placeholder="Ex: Lycée Jean Moulin"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Nom Officiel (Application)</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Ex: Jean Moulin"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Logo Officiel (PNG uniquement)</label>
                <input
                  type="file"
                  accept=".png"
                  disabled={loading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setLogoBase64(reader.result as string)
                      }
                      reader.readAsDataURL(file)
                    } else {
                      setLogoBase64(null)
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-sm font-medium text-slate-300">Modules activés</label>
                <label className="flex items-center gap-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    disabled={loading}
                    checked={cantine}
                    onChange={(e) => setCantine(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 bg-slate-900"
                  />
                  <span>Cantine Scolaire</span>
                </label>
                
                <label className="flex items-center gap-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    disabled={loading}
                    checked={bus}
                    onChange={(e) => setBus(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 bg-slate-900"
                  />
                  <span>Transport (Bus)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !nom.trim()}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="animate-spin" size={20} /> Compilation...</>
                ) : done ? (
                  <><Check size={20} /> Terminé</>
                ) : (
                  <><Play size={20} /> Générer le Build (.exe)</>
                )}
              </button>
              
              {done && (
                <div className="mt-4 p-3 bg-emerald-950/50 border border-emerald-900/50 rounded-lg text-emerald-400 text-sm">
                  Compilation réussie ! L'exécutable se trouve dans le dossier <strong>dist</strong> de votre projet.
                </div>
              )}
            </form>
          </div>

          {/* Terminal */}
          <div className="md:col-span-2 bg-black rounded-xl border border-slate-800 overflow-hidden flex flex-col h-[600px]">
            <div className="bg-slate-900 px-4 py-2 flex items-center gap-2 border-b border-slate-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-xs text-slate-400 ml-2 font-mono">Terminal de Compilation</span>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm text-green-400 whitespace-pre-wrap">
              {logs.length === 0 ? (
                <span className="text-slate-600">En attente de démarrage...</span>
              ) : (
                logs.map((log, i) => (
                  <span key={i}>{log}</span>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
