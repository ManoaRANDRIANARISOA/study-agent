import React, { useState } from 'react'
import { ShieldAlert, RefreshCw, PhoneCall, Mail, School, Lock } from 'lucide-react'

interface SubscriptionBlockerProps {
  schoolName: string
  onRefresh: () => Promise<void>
}

export default function SubscriptionBlocker({
  schoolName,
  onRefresh
}: SubscriptionBlockerProps): React.JSX.Element {
  const [checking, setChecking] = useState(false)

  const handleRefresh = async () => {
    setChecking(true)
    try {
      await onRefresh()
    } finally {
      setTimeout(() => setChecking(false), 600)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-stone-900/60 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="max-w-lg w-full bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header décoratif épuré */}
        <div className="bg-gradient-to-b from-amber-50/80 to-white p-6 border-b border-stone-100 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center mb-3 text-amber-700 shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">
            Accès Temporairement Suspendu
          </h2>
          <div className="flex items-center gap-2 mt-1 text-sm font-semibold text-amber-800">
            <School className="w-4 h-4" />
            <span>{schoolName || 'Établissement'}</span>
          </div>
        </div>

        {/* Corps du message */}
        <div className="p-6 space-y-3.5 text-stone-700 text-sm leading-relaxed">
          <p className="font-semibold text-stone-900">
            Chère direction,
          </p>
          <p>
            L&apos;abonnement aux services de votre plateforme <strong className="text-stone-900 font-semibold">Study Agent</strong> est actuellement arrivé à échéance ou fait l&apos;objet d&apos;une régularisation administrative.
          </p>
          <p className="text-stone-500 text-xs leading-relaxed">
            Pour continuer à bénéficier de l&apos;ensemble de vos fonctionnalités de gestion scolaire (élèves, paiements, relevés, présence), nous vous invitons aimablement à vous rapprocher de notre service commercial.
          </p>

          {/* Encadré d'assistance */}
          <div className="bg-stone-50/90 rounded-xl p-4 border border-stone-200/90 space-y-2.5 mt-4 text-xs">
            <div className="font-bold text-stone-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>Service Client & Régularisation :</span>
            </div>
            <div className="flex items-center gap-2 text-stone-700">
              <PhoneCall className="w-3.5 h-3.5 text-primary" />
              <span>Contact : +261 34 00 000 00 / Support Dédié</span>
            </div>
            <div className="flex items-center gap-2 text-stone-700">
              <Mail className="w-3.5 h-3.5 text-emerald-600" />
              <span>Email : contact@studyagent.mg</span>
            </div>
          </div>
        </div>

        {/* Footer avec bouton rafraîchir */}
        <div className="p-4 px-6 bg-stone-50/80 border-t border-stone-100 flex items-center justify-between gap-4">
          <span className="text-xs text-stone-500">
            Dès validation de votre paiement, l&apos;accès est débloqué immédiatement.
          </span>
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="shrink-0 bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Vérification...' : 'Vérifier à nouveau'}</span>
          </button>
        </div>

      </div>
    </div>
  )
}
