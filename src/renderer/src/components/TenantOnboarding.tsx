import React, { useState } from 'react'
import { School, ArrowRight, ShieldCheck, Database } from 'lucide-react'

export default function TenantOnboarding({ onComplete }: { onComplete: () => void }) {
  const [tenantId, setTenantId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId.trim()) {
      setError('Veuillez entrer un identifiant valide')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Nettoyer l'identifiant pour éviter les erreurs (espaces, majuscules)
      const cleanTenantId = tenantId.trim().toLowerCase()
      
      const res = await window.api.tenant.setup(cleanTenantId)
      if (res.success) {
        onComplete()
      } else {
        setError("Erreur lors de la configuration de l'établissement")
      }
    } catch (err: any) {
      setError(err.message || 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 dark:bg-primary/5 rounded-full blur-[100px]" />

      <div
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden relative z-10 border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div className="p-8 pb-6 text-center border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <School size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Bienvenue sur {import.meta.env.VITE_APP_NAME || 'Study Agent'}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Configuration initiale de votre établissement
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400" />
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Identifiant de l'Établissement (Tenant ID)
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="ex: lycee_oio"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              disabled={loading}
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Database size={12} />
              Ceci connectera le logiciel à votre espace Cloud dédié.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !tenantId.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Activer le Logiciel
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        <div className="px-8 py-4 bg-gray-50/80 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 text-xs text-center text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
          <ShieldCheck size={14} className="text-green-500" />
          Synchronisation sécurisée (Option C)
        </div>
      </div>
    </div>
  )
}
