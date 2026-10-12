import React, { useEffect } from 'react'
import { Sparkles, X, Banknote, RefreshCw, AlertTriangle, Lock, ArrowRight } from 'lucide-react'

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

  const releaseVersion = 'v2.3.8'
  const releaseDate = 'Octobre 2026'

  const updates = [
    {
      category: 'Nouveau',
      type: 'feature',
      icon: Sparkles,
      iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
      title: 'Filtrage Mensuel des Impayés & Export Modulaire Standard',
      description: 'Ciblage précis des retards par mois (écolage, bus, cantine) avec recalcul automatique des montants et export multi-formats (Excel, CSV, PDF, JSON) avec préréglages de recouvrement.'
    },
    {
      category: 'Majeur',
      type: 'feature',
      icon: RefreshCw,
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      title: 'Sécurisation Industrielle LWW & Auto-Guérison Outbox',
      description: 'Protection anti-régression Last-Write-Wins, respect strict des suppressions cloud, déduplication active de la file d’attente et assainissement automatique.'
    },
    {
      category: 'Nouveau',
      type: 'feature',
      icon: Sparkles,
      iconBg: 'bg-blue-50 text-blue-600 border-blue-200',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
      title: 'Passerelle Brevo REST v3 (Port 443 HTTPS) & Verrou Cloud',
      description: 'Envoi garanti des bilans de caisse journaliers contournant les blocages SMTP des FAI/4G avec synchronisation préalable et verrouillage distribué multi-tenant.'
    },
    {
      category: 'Harmonisation',
      type: 'feature',
      icon: Banknote,
      iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
      title: 'Harmonisation Inscriptions & Grille Écolages',
      description: 'Module de requalification en lot des réinscriptions, bouton d’encaissement "Payer le solde" et alignement dynamique de la grille tarifaire sans manipulation manuelle.'
    },
    {
      category: 'Fiabilité',
      type: 'improvement',
      icon: AlertTriangle,
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
      badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
      title: 'Safeguards Anti-Collision & Journal Recalibré',
      description: 'Protection stricte des acomptes échelonnés et ventes d’articles multiples, avec axe zéro continu et isolé sur le graphique des flux financiers.'
    },
    {
      category: 'Système',
      type: 'feature',
      icon: Lock,
      iconBg: 'bg-purple-50 text-purple-600 border-purple-200',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200/80',
      title: 'Mises à Jour Automatiques Officielles',
      description: 'Auto-Updater intégré et sécurisé pointant vers les publications officielles GitHub Releases de ManoaRANDRIANARISOA/study-agent.'
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
