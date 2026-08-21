import React, { useState, useEffect } from 'react'
import { BellRing, PhoneCall, X } from 'lucide-react'

interface SubscriptionAlertBannerProps {
  schoolName?: string
}

export default function SubscriptionAlertBanner({
  schoolName
}: SubscriptionAlertBannerProps): React.JSX.Element | null {
  const [visible, setVisible] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [endDateFormatted, setEndDateFormatted] = useState<string>('')

  useEffect(() => {
    // Vérifier si la bannière a été masquée pour cette session
    const dismissed = sessionStorage.getItem('subscription_banner_dismissed')
    if (dismissed) return

    window.api.tenant.checkSubscription().then((res) => {
      if (res && res.success && res.isExpiringSoon && res.daysRemaining !== null && res.daysRemaining !== undefined) {
        setDaysRemaining(res.daysRemaining)
        if (res.subscriptionEndDate) {
          try {
            const date = new Date(res.subscriptionEndDate)
            setEndDateFormatted(date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }))
          } catch {
            setEndDateFormatted('')
          }
        }
        setVisible(true)
      }
    })
  }, [])

  const handleDismiss = () => {
    sessionStorage.setItem('subscription_banner_dismissed', 'true')
    setVisible(false)
  }

  if (!visible || daysRemaining === null) return null

  return (
    <div className="mb-5 bg-gradient-to-r from-amber-50 via-amber-50/70 to-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm text-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 border border-amber-300/80 shadow-xs">
          <BellRing className="w-5 h-5 animate-bounce" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-bold text-amber-950 flex items-center gap-2 flex-wrap">
            <span>Rappel de renouvellement de licence</span>
            <span className="text-xs bg-amber-200/80 text-amber-900 font-bold px-2.5 py-0.5 rounded-full border border-amber-300">
              {daysRemaining === 0 ? "Expire aujourd'hui" : `J-${daysRemaining} (${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''})`}
            </span>
          </div>
          <p className="text-xs text-amber-900/80 leading-relaxed max-w-3xl">
            Chère direction {schoolName ? `de ${schoolName}` : ''}, votre abonnement Study Agent arrive à échéance {endDateFormatted ? `le ${endDateFormatted}` : 'prochainement'}. Pensez à renouveler votre licence pour garantir la continuité ininterrompue de vos services scolaires.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
        <div className="text-xs bg-white/90 border border-amber-200/90 text-stone-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs font-medium">
          <PhoneCall className="w-3.5 h-3.5 text-amber-600" />
          <span>Support : +261 34 00 000 00</span>
        </div>
        <button
          onClick={handleDismiss}
          title="Masquer pour cette session"
          className="p-1.5 hover:bg-amber-200/50 text-stone-400 hover:text-stone-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
