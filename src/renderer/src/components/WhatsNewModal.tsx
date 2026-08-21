import React, { useEffect } from 'react'
import { Sparkles, X, Zap, ShieldCheck, ArrowRight } from 'lucide-react'

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const releaseVersion = 'v1.0.7'
  const releaseDate = 'Février 2026'

  const updates = [
    {
      category: 'Nouveau',
      type: 'feature',
      icon: Sparkles,
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      title: 'Gestion Multi-Tenant & Synchronisation Cloud Sécurisée',
      description: "Chaque établissement dispose désormais d'une base de données locale totalement dédiée et isolée, avec synchronisation continue vers Supabase."
    },
    {
      category: 'Amélioration',
      type: 'improvement',
      icon: Zap,
      iconBg: 'bg-blue-50 text-blue-600 border-blue-200',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
      title: 'Alertes Préventives & Suivi des Licences',
      description: "Affichage automatique d'un rappel bienveillant à l'approche de la fin d'abonnement pour assurer la continuité de service."
    },
    {
      category: 'Performance & Sécurité',
      type: 'security',
      icon: ShieldCheck,
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      title: 'Optimisation de la Synchronisation et Logs Applicatifs',
      description: "Amélioration de la résilience hors-ligne et ajout de journaux système pour un diagnostic rapide en cas d'interruption réseau."
    }
  ]

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl border border-stone-200/90 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Épuré & Lumineux */}
        <div className="bg-gradient-to-b from-stone-50 to-white p-6 border-b border-stone-100 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900 tracking-tight">
                Quoi de neuf dans Study Agent ?
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Version <span className="font-semibold text-primary">{releaseVersion}</span> • {releaseDate}
              </p>
            </div>
          </div>
        </div>

        {/* Liste des nouveautés (Cartes claires) */}
        <div className="p-6 overflow-y-auto space-y-3.5 custom-scrollbar bg-white">
          {updates.map((item, index) => {
            const Icon = item.icon
            return (
              <div
                key={index}
                className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200/80 hover:border-stone-300 rounded-xl p-4 transition-all flex gap-3.5 items-start"
              >
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${item.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-stone-900">
                      {item.title}
                    </span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${item.badgeBg}`}>
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-stone-50/80 border-t border-stone-100 flex items-center justify-between gap-4">
          <span className="text-xs text-stone-500">
            Study Agent est régulièrement mis à jour pour votre établissement.
          </span>
          <button
            onClick={onClose}
            className="shrink-0 bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground text-xs font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-sm"
          >
            <span>Découvrir</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  )
}
