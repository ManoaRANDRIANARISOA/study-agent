import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Box, Check, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react'

export default function SuperAdminBuilder() {
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing')
  
  // ============================================
  // EXISTING TENANTS STATE
  // ============================================
  const [tenants, setTenants] = useState<any[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [updateLoading, setUpdateLoading] = useState<string | null>(null)

  const fetchTenants = async () => {
    setTenantsLoading(true)
    try {
      const res = await window.api.superadmin.getTenants()
      if (res.success && res.data) {
        setTenants(res.data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setTenantsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'existing') {
      fetchTenants()
    }
  }, [activeTab])

  const handleUpdateStatus = async (id: string, status: string) => {
    setUpdateLoading(id)
    try {
      const res = await window.api.superadmin.updateTenantSubscription(id, status)
      if (res.success) {
        await fetchTenants() // Refresh
      } else {
        alert("Erreur: " + res.error)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setUpdateLoading(null)
    }
  }

  const handleRenew = async (id: string, months: number) => {
    setUpdateLoading(id)
    try {
      const res = await window.api.superadmin.renewTenantSubscription(id, months)
      if (res.success) {
        await fetchTenants()
      } else {
        alert("Erreur de renouvellement: " + res.error)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setUpdateLoading(null)
    }
  }

  const handleSwitchTenant = async (tenantId: string) => {
    if (window.confirm(`Basculer l'application sur le locataire "${tenantId}" ? L'application va recharger avec sa base locale dédiée.`)) {
      await window.api.tenant.setup(tenantId)
      window.location.hash = '#/'
      window.location.reload()
    }
  }

  // ============================================
  // BUILDER STATE
  // ============================================
  const [subscriptionMonths, setSubscriptionMonths] = useState(12)
  const [step, setStep] = useState(1)
  const [nom, setNom] = useState('')
  const [appName, setAppName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [directorTitle, setDirectorTitle] = useState('Le Directeur')
  const [directorName, setDirectorName] = useState('')
  const [cantine, setCantine] = useState(true)
  const [bus, setBus] = useState(true)
  const [uniforms, setUniforms] = useState(true)
  const [evaluations, setEvaluations] = useState(true)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('24 23% 57%')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  useEffect(() => {
    if (window.api && window.api.builder) {
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

    const subEndDate = new Date()
    subEndDate.setMonth(subEndDate.getMonth() + Number(subscriptionMonths || 12))

    const config = {
      nom,
      appName: appName || nom,
      logoBase64,
      parametrage: {
        school_name: nom,
        school_address: address,
        school_city: city,
        school_phone: phone,
        school_email: email,
        director_title: directorTitle,
        director_name: directorName,
        module_cantine: cantine,
        module_bus: bus,
        module_uniforms: uniforms,
        module_evaluations: evaluations,
        primary_color: primaryColor,
        subscription_status: 'active',
        subscription_duration_months: Number(subscriptionMonths || 12),
        subscription_end_date: subEndDate.toISOString(),
        subscription_updated_at: new Date().toISOString()
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

  // ============================================
  // RENDER HELPERS
  // ============================================
  const renderStepIndicators = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            step === i
              ? 'bg-blue-600 text-white'
              : step > i
              ? 'bg-green-500 text-white cursor-pointer'
              : 'bg-slate-800 text-slate-500'
          }`}
          onClick={() => {
            if (step > i) setStep(i)
          }}
        >
          {step > i ? <Check size={18} /> : i}
        </div>
      ))}
    </div>
  )

  const renderStep1 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-semibold text-white mb-4">Étape 1 : Identité de l'École</h2>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Nom complet de l'établissement</label>
        <input
          type="text"
          required
          value={nom}
          onChange={(e) => {
            setNom(e.target.value)
            if (!appName) setAppName(e.target.value)
          }}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Nom Court (Application)</label>
        <input
          type="text"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Adresse</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Ville, Pays</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Téléphone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <Button onClick={() => setStep(2)} disabled={!nom}>Suivant</Button>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-semibold text-white mb-4">Étape 2 : Direction</h2>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Titre (ex: Le Directeur, La Directrice)</label>
        <input
          type="text"
          value={directorTitle}
          onChange={(e) => setDirectorTitle(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Nom Complet du Directeur</label>
        <input
          type="text"
          value={directorName}
          onChange={(e) => setDirectorName(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-4">
        <Button onClick={() => setStep(1)} variant="outline">Précédent</Button>
        <Button onClick={() => setStep(3)}>Suivant</Button>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-semibold text-white mb-4">Étape 3 : Modules Actifs</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700">
          <input
            type="checkbox"
            checked={cantine}
            onChange={(e) => setCantine(e.target.checked)}
            className="w-5 h-5 rounded"
          />
          <span>Cantine Scolaire</span>
        </label>
        <label className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700">
          <input
            type="checkbox"
            checked={bus}
            onChange={(e) => setBus(e.target.checked)}
            className="w-5 h-5 rounded"
          />
          <span>Transport (Bus)</span>
        </label>
        <label className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700">
          <input
            type="checkbox"
            checked={uniforms}
            onChange={(e) => setUniforms(e.target.checked)}
            className="w-5 h-5 rounded"
          />
          <span>Uniformes / Fournitures</span>
        </label>
        <label className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700">
          <input
            type="checkbox"
            checked={evaluations}
            onChange={(e) => setEvaluations(e.target.checked)}
            className="w-5 h-5 rounded"
          />
          <span>Évaluations & Bulletins</span>
        </label>
      </div>

      {/* Durée initiale d'abonnement */}
      <div className="mt-6 pt-5 border-t border-slate-800 space-y-2.5">
        <label className="text-sm font-medium text-slate-300 block">
          Durée initiale de la licence / abonnement
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '1 Mois (Essai)', value: 1 },
            { label: '3 Mois', value: 3 },
            { label: '6 Mois', value: 6 },
            { label: '1 An (Standard)', value: 12 }
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSubscriptionMonths(opt.value)}
              className={`p-3 rounded-lg border text-xs font-semibold transition-all text-center ${
                subscriptionMonths === opt.value
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                  : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <Button onClick={() => setStep(2)} variant="outline">Précédent</Button>
        <Button onClick={() => setStep(4)}>Suivant</Button>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-semibold text-white mb-4">Étape 4 : Branding (Logo & Couleurs)</h2>
      
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Logo Officiel (PNG uniquement)</label>
        <div className="flex items-center gap-4">
          {logoBase64 ? (
            <img src={logoBase64} alt="Logo" className="w-16 h-16 object-contain bg-white rounded p-1" />
          ) : (
            <div className="w-16 h-16 bg-slate-800 rounded flex items-center justify-center">
              <ImageIcon className="text-slate-500" />
            </div>
          )}
          <input
            type="file"
            accept=".png"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const reader = new FileReader()
                reader.onloadend = () => setLogoBase64(reader.result as string)
                reader.readAsDataURL(file)
              }
            }}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white"
          />
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <label className="text-sm font-medium text-slate-300">Couleur Primaire (Format HSL: "24 23% 57%")</label>
        <input
          type="text"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          placeholder="Ex: 210 100% 50%"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 mt-2">
          <div className="text-xs text-slate-400">Exemples:</div>
          <button onClick={() => setPrimaryColor('220 90% 56%')} className="text-xs text-blue-400">Bleu</button>
          <button onClick={() => setPrimaryColor('142 71% 45%')} className="text-xs text-green-400">Vert</button>
          <button onClick={() => setPrimaryColor('346 87% 43%')} className="text-xs text-red-400">Rouge</button>
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <Button onClick={() => setStep(3)} variant="outline">Précédent</Button>
        <Button onClick={() => setStep(5)}>Suivant (Compilation)</Button>
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-semibold text-white mb-4">Étape 5 : Compilation de l'Application</h2>
      
      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-sm space-y-2 mb-6">
        <p><strong>École :</strong> {nom}</p>
        <p><strong>Modules :</strong> {[cantine && 'Cantine', bus && 'Bus', uniforms && 'Uniformes', evaluations && 'Évaluations'].filter(Boolean).join(', ')}</p>
      </div>

      <form onSubmit={handleBuild}>
        <div className="flex gap-4">
          <Button type="button" onClick={() => setStep(4)} variant="outline" disabled={loading}>Précédent</Button>
          <button
            type="submit"
            disabled={loading || !nom.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="animate-spin" size={20} /> Compilation en cours...</>
            ) : done ? (
              <><Check size={20} /> Compilation Réussie</>
            ) : (
              <><Play size={20} /> Générer le Build (.exe)</>
            )}
          </button>
        </div>
      </form>

      {done && (
        <div className="mt-4 p-3 bg-emerald-950/50 border border-emerald-900/50 rounded-lg text-emerald-400 text-sm">
          Compilation réussie ! L'exécutable se trouve dans le dossier <strong>dist</strong> de votre projet.
        </div>
      )}
    </div>
  )

  const renderExistingTenants = () => {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-white">Établissements Inscrits</h2>
        </div>
        
        {tenantsLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-slate-800 border-dashed">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">Aucun établissement enregistré pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tenants.map(tenant => {
              let param: any = {}
              try {
                param = JSON.parse(tenant.parametrage || '{}')
              } catch(e) {}
              
              const status = param.subscription_status || 'active'
              const isUpdating = updateLoading === tenant.id

              const endDate = param.subscription_end_date ? new Date(param.subscription_end_date) : null
              const daysRemaining = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
              const isExpiringSoon = daysRemaining !== null && daysRemaining <= 10 && daysRemaining >= 0
              const isExpired = daysRemaining !== null && daysRemaining < 0
              const isSuspended = status === 'suspended' || isExpired
              
              return (
                <div key={tenant.id} className={`p-5 rounded-xl border flex flex-col gap-4 transition-all hover:border-slate-600 ${isSuspended ? 'border-red-900/50 bg-red-950/20' : isExpiringSoon ? 'border-amber-900/50 bg-amber-950/20' : 'border-slate-800 bg-slate-900/50'}`}>
                  <div className="flex items-center gap-4">
                    {/* Logo */}
                    <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-700 shrink-0">
                      {param.logoBase64 ? <img src={param.logoBase64} className="w-full h-full object-cover" /> : <Box className="text-slate-500" />}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-bold text-lg text-white truncate" title={tenant.nom}>{tenant.nom}</h3>
                      <p className="text-sm text-slate-400 truncate">/{param.appName || tenant.id}</p>
                    </div>
                  </div>
                  
                  {/* Modules Badges */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {param.module_cantine && <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-full text-slate-300">Cantine</span>}
                    {param.module_bus && <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-full text-slate-300">Transport</span>}
                    {param.module_uniforms && <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-full text-slate-300">Uniformes</span>}
                    {param.module_evaluations && <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-full text-slate-300">Évaluations</span>}
                  </div>
                  
                  {/* Status & Expiration */}
                  <div className="mt-auto pt-4 border-t border-slate-800/50 flex flex-col gap-3">
                    <div className="space-y-1.5 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Licence :</span>
                        {isSuspended ? (
                          <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-md border border-red-400/20">
                            {isExpired ? 'Expiré (Restreint)' : 'Suspendu'}
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20 animate-pulse">
                            J-{daysRemaining} ({daysRemaining}j restants)
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md border border-emerald-400/20">
                            Actif ({daysRemaining !== null ? `${daysRemaining}j restants` : 'Illimité'})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Échéance :</span>
                        <span className="text-slate-200 font-medium">
                          {endDate ? endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Non configurée'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Actions de Renouvellement Rapide */}
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                        <span>Renouveler la licence :</span>
                        {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: '+1M', months: 1 },
                          { label: '+3M', months: 3 },
                          { label: '+6M', months: 6 },
                          { label: '+1An', months: 12 }
                        ].map(plan => (
                          <button
                            key={plan.months}
                            onClick={() => handleRenew(tenant.id, plan.months)}
                            disabled={isUpdating}
                            className="text-xs py-1 rounded bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-600/30 font-semibold transition-all disabled:opacity-50 text-center"
                          >
                            {plan.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Suspension / Réactivation / Accès */}
                    <div className="flex gap-2">
                        <button
                          onClick={() => handleSwitchTenant(tenant.id)}
                          className="flex-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 text-xs font-semibold py-2 rounded-lg transition-colors border border-blue-600/25 flex items-center justify-center gap-1"
                        >
                          ACCÉDER
                        </button>
                        {status === 'suspended' ? (
                          <button onClick={() => handleUpdateStatus(tenant.id, 'active')} disabled={isUpdating} className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 text-xs font-semibold py-2 rounded-lg transition-colors border border-emerald-600/20 flex items-center justify-center gap-1.5">
                            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'RÉACTIVER'}
                          </button>
                        ) : (
                          <button onClick={() => handleUpdateStatus(tenant.id, 'suspended')} disabled={isUpdating} className="flex-1 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-xs font-semibold py-2 rounded-lg transition-colors border border-red-600/20 flex items-center justify-center gap-1.5">
                            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'SUSPENDRE'}
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
        
        {/* En-tête & Onglets */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft size={24} />
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Box className="text-blue-500" /> SuperAdmin SaaS
            </h1>
          </div>
          
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
            <button 
              onClick={() => setActiveTab('existing')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'existing' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Locataires Existants
            </button>
            <button 
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'new' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Nouveau Build
            </button>
          </div>
        </div>

        {activeTab === 'new' ? (
          <div className="flex flex-col md:flex-row gap-8">
            {/* Panneau de Gauche : Formulaire */}
            <div className="flex-1 bg-slate-900 p-8 rounded-xl border border-slate-800 overflow-hidden">
              {renderStepIndicators()}
              <div className="mt-8">
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
                {step === 4 && renderStep4()}
                {step === 5 && renderStep5()}
              </div>
            </div>

            {/* Panneau de Droite : Terminal */}
            <div className="flex-1 bg-black rounded-xl border border-slate-800 flex flex-col h-[700px]">
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
                  logs.map((log, i) => <span key={i}>{log}</span>)
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        ) : (
          renderExistingTenants()
        )}

      </div>
    </div>
  )
}

function Button({ children, onClick, variant = 'default', disabled = false, type = "button" }: any) {
  const base = "px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
  const styles = {
    default: "bg-slate-100 hover:bg-slate-200 text-slate-900",
    outline: "border border-slate-700 hover:bg-slate-800 text-slate-300"
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant as keyof typeof styles]}`}>
      {children}
    </button>
  )
}
