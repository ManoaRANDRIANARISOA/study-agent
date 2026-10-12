import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  Check,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  ShieldCheck,
  Building2,
  Calendar,
  Sparkles,
  Utensils,
  Bus,
  Shirt,
  GraduationCap,
  Users2,
  ExternalLink,
  Ban,
  RotateCcw,
  PlusCircle,
  Terminal
} from 'lucide-react'

export default function SuperAdminBuilder() {
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing')

  // ============================================
  // EXISTING TENANTS STATE
  // ============================================
  const [tenants, setTenants] = useState<any[]>([])
  const [tenantsLoading, setTenantsLoading] = useState(false)
  const [updateLoading, setUpdateLoading] = useState<string | null>(null)
  const [currentTenantId, setCurrentTenantId] = useState<string>('ecole_dev')

  useEffect(() => {
    if (window.api?.tenant?.check) {
      window.api.tenant.check().then((res) => {
        if (res?.tenantId) setCurrentTenantId(res.tenantId)
      })
    }
  }, [])

  const fetchTenants = async () => {
    setTenantsLoading(true)
    try {
      const res = await window.api.superadmin.getTenants()
      if (res.success && res.data) {
        setTenants(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch tenants:', err)
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
        await fetchTenants()
      } else {
        alert('Erreur: ' + res.error)
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
        alert('Erreur de renouvellement: ' + res.error)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setUpdateLoading(null)
    }
  }

  const handleSwitchTenant = async (tenantId: string) => {
    if (
      window.confirm(
        `Basculer l'application sur le locataire "${tenantId}" ? L'application va recharger avec sa base locale dédiée.`
      )
    ) {
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
        setLogs((prev) => [...prev, log])
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
        setLogs((prev) => [...prev, `\n[ERREUR] ${res.error}\n`])
      }
    } catch (err: any) {
      setLogs((prev) => [...prev, `\n[ERREUR EXCEPTION] ${err.message}\n`])
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // RENDER HELPERS - BUILDER WIZARD
  // ============================================
  const renderStepIndicators = () => (
    <div className="flex items-center justify-center gap-3 mb-8">
      {[
        { num: 1, label: 'Identité' },
        { num: 2, label: 'Direction' },
        { num: 3, label: 'Modules & Licence' },
        { num: 4, label: 'Branding' },
        { num: 5, label: 'Compilation' }
      ].map((s) => (
        <div key={s.num} className="flex items-center gap-2">
          <button
            type="button"
            disabled={step < s.num}
            onClick={() => {
              if (step > s.num) setStep(s.num)
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs transition-all ${
              step === s.num
                ? 'bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30'
                : step > s.num
                ? 'bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700'
                : 'bg-muted/40 text-muted-foreground border border-border/80'
            }`}
          >
            {step > s.num ? <Check size={16} /> : s.num}
          </button>
          <span
            className={`text-xs hidden md:inline font-medium ${
              step === s.num ? 'text-foreground font-semibold' : 'text-muted-foreground'
            }`}
          >
            {s.label}
          </span>
          {s.num < 5 && <span className="text-border mx-1 hidden md:inline">›</span>}
        </div>
      ))}
    </div>
  )

  const renderStep1 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-foreground">Étape 1 : Identité de l'Établissement</h2>
        <p className="text-xs text-muted-foreground">
          Renseignez les coordonnées fondamentales de la nouvelle école.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">
          Nom complet de l'établissement <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          required
          placeholder="ex: Collège & Lycée Saint-Exupéry"
          value={nom}
          onChange={(e) => {
            setNom(e.target.value)
            if (!appName) setAppName(e.target.value)
          }}
          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">
          Identifiant court / Slug application
        </label>
        <input
          type="text"
          placeholder="ex: saint_exupery"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Adresse postale</label>
          <input
            type="text"
            placeholder="ex: Lot IV B 24 Antanimena"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Ville & Pays</label>
          <input
            type="text"
            placeholder="ex: Antananarivo, Madagascar"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Téléphone officiel</label>
          <input
            type="text"
            placeholder="ex: +261 34 00 000 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Email de contact</label>
          <input
            type="email"
            placeholder="ex: contact@ecole.mg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
          />
        </div>
      </div>
      <div className="pt-3 flex justify-end">
        <Button onClick={() => setStep(2)} disabled={!nom.trim()}>
          Continuer vers Direction ›
        </Button>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-foreground">Étape 2 : Responsable & Direction</h2>
        <p className="text-xs text-muted-foreground">
          Ces informations figureront sur les bulletins scolaires et reçus officiels.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">
          Titre du signataire officiel
        </label>
        <input
          type="text"
          placeholder="ex: Le Directeur, La Directrice Générale, Le Proviseur"
          value={directorTitle}
          onChange={(e) => setDirectorTitle(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">
          Nom et Prénom du Directeur / Responsable
        </label>
        <input
          type="text"
          placeholder="ex: M. RANDRIA Michel"
          value={directorName}
          onChange={(e) => setDirectorName(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
        />
      </div>
      <div className="pt-3 flex justify-between">
        <Button onClick={() => setStep(1)} variant="outline">
          ‹ Précédent
        </Button>
        <Button onClick={() => setStep(3)}>Modules & Licence ›</Button>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-foreground">Étape 3 : Fonctionnalités & Licence</h2>
        <p className="text-xs text-muted-foreground">
          Sélectionnez les modules attribués pour cet établissement ainsi que sa durée initiale.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-3 p-3.5 bg-muted/20 rounded-xl border border-border cursor-pointer hover:border-primary/40 transition-all shadow-2xs">
          <input
            type="checkbox"
            checked={cantine}
            onChange={(e) => setCantine(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-amber-700" />
            <span className="text-xs font-semibold text-foreground">Cantine Scolaire</span>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3.5 bg-muted/20 rounded-xl border border-border cursor-pointer hover:border-primary/40 transition-all shadow-2xs">
          <input
            type="checkbox"
            checked={bus}
            onChange={(e) => setBus(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-blue-700" />
            <span className="text-xs font-semibold text-foreground">Transport Scolaire (Bus)</span>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3.5 bg-muted/20 rounded-xl border border-border cursor-pointer hover:border-primary/40 transition-all shadow-2xs">
          <input
            type="checkbox"
            checked={uniforms}
            onChange={(e) => setUniforms(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <Shirt className="w-4 h-4 text-indigo-700" />
            <span className="text-xs font-semibold text-foreground">Uniformes & Fournitures</span>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3.5 bg-muted/20 rounded-xl border border-border cursor-pointer hover:border-primary/40 transition-all shadow-2xs">
          <input
            type="checkbox"
            checked={evaluations}
            onChange={(e) => setEvaluations(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-semibold text-foreground">Évaluations & Bulletins</span>
          </div>
        </label>
      </div>

      {/* Durée initiale d'abonnement */}
      <div className="mt-4 pt-4 border-t border-border space-y-2.5">
        <label className="text-xs font-semibold text-foreground block">
          Durée initiale accordée pour la licence :
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all text-center cursor-pointer ${
                subscriptionMonths === opt.value
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-card border-border text-foreground hover:bg-muted/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3 flex justify-between">
        <Button onClick={() => setStep(2)} variant="outline">
          ‹ Précédent
        </Button>
        <Button onClick={() => setStep(4)}>Branding & Logo ›</Button>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-foreground">Étape 4 : Identité Visuelle & Logo</h2>
        <p className="text-xs text-muted-foreground">
          Personnalisez le logo et la nuance de couleur primaire de l'application.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">
          Logo officiel (.PNG recommandé)
        </label>
        <div className="flex items-center gap-4">
          {logoBase64 ? (
            <img
              src={logoBase64}
              alt="Logo"
              className="w-14 h-14 object-contain bg-white rounded-xl border border-border p-1 shadow-2xs"
            />
          ) : (
            <div className="w-14 h-14 bg-muted/40 rounded-xl border border-border flex items-center justify-center">
              <ImageIcon className="text-muted-foreground w-6 h-6" />
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
            className="flex-1 text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-semibold file:bg-muted/40 file:text-foreground hover:file:bg-muted cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <label className="text-xs font-semibold text-foreground">
          Couleur primaire HSL (ex: "24 23% 57%")
        </label>
        <input
          type="text"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          placeholder="Ex: 24 23% 57%"
          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Préréglages :</span>
          <button
            type="button"
            onClick={() => setPrimaryColor('24 23% 57%')}
            className="text-amber-800 underline font-medium cursor-pointer"
          >
            Terre cuite (Défaut)
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setPrimaryColor('215 50% 45%')}
            className="text-blue-700 underline font-medium cursor-pointer"
          >
            Bleu Marine
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setPrimaryColor('152 45% 40%')}
            className="text-emerald-700 underline font-medium cursor-pointer"
          >
            Vert Émeraude
          </button>
        </div>
      </div>

      <div className="pt-3 flex justify-between">
        <Button onClick={() => setStep(3)} variant="outline">
          ‹ Précédent
        </Button>
        <Button onClick={() => setStep(5)}>Compilation finale ›</Button>
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-foreground">Étape 5 : Récapitulatif & Compilation</h2>
        <p className="text-xs text-muted-foreground">
          Vérifiez les paramètres avant de déclencher la génération de l'application autonome.
        </p>
      </div>

      <div className="bg-muted/30 p-4 rounded-xl border border-border text-xs space-y-2">
        <p>
          <strong className="text-foreground">Établissement :</strong> {nom}
        </p>
        <p>
          <strong className="text-foreground">Modules attribués :</strong>{' '}
          {[cantine && 'Cantine', bus && 'Bus', uniforms && 'Uniformes', evaluations && 'Évaluations']
            .filter(Boolean)
            .join(', ') || 'Aucun'}
        </p>
        <p>
          <strong className="text-foreground">Durée initiale :</strong> {subscriptionMonths} mois
        </p>
      </div>

      <form onSubmit={handleBuild}>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={() => setStep(4)}
            variant="outline"
            disabled={loading}
          >
            ‹ Précédent
          </Button>
          <button
            type="submit"
            disabled={loading || !nom.trim()}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin w-4 h-4" /> Compilation en cours...
              </>
            ) : done ? (
              <>
                <Check className="w-4 h-4" /> Compilation réussie !
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Générer l'exécutable (.exe)
              </>
            )}
          </button>
        </div>
      </form>

      {done && (
        <div className="mt-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Compilation terminée avec succès ! L'exécutable autonome est disponible dans le dossier{' '}
            <strong>dist/</strong>.
          </span>
        </div>
      )}
    </div>
  )

  // ============================================
  // RENDER HELPERS - EXISTING TENANTS LIST
  // ============================================
  const renderExistingTenants = () => {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Établissements & Locataires Configurés</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gérez les licences, échéances, modules attribués et l'accès multi-écoles.
            </p>
          </div>
          <button
            onClick={() => fetchTenants()}
            disabled={tenantsLoading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted border border-border px-3 py-1.5 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${tenantsLoading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>

        {tenantsLoading ? (
          <div className="flex flex-col items-center justify-center p-16 gap-3">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
            <span className="text-xs text-muted-foreground font-medium">Chargement des locataires...</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border flex flex-col items-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-semibold text-foreground">Aucun locataire enregistré</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Utilisez l'onglet « Nouveau Build » pour initialiser un nouvel établissement scolaire.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tenants.map((tenant) => {
              let param: any = {}
              try {
                param = JSON.parse(tenant.parametrage || '{}')
              } catch {}

              const isDemo = tenant.is_demo === true || tenant.id === 'ecole_dev'
              const isActive =
                tenant.is_active === true ||
                tenant.id === currentTenantId ||
                (!currentTenantId && isDemo)

              const status = param.subscription_status || 'active'
              const isUpdating = updateLoading === tenant.id

              const endDate = param.subscription_end_date ? new Date(param.subscription_end_date) : null
              const daysRemaining = endDate
                ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null
              const isExpiringSoon = daysRemaining !== null && daysRemaining <= 10 && daysRemaining >= 0
              const isExpired = daysRemaining !== null && daysRemaining < 0
              const isSuspended = status === 'suspended' || isExpired

              return (
                <div
                  key={tenant.id}
                  className={`bg-card rounded-2xl border flex flex-col gap-4.5 p-5 transition-all shadow-xs hover:shadow-md ${
                    isActive
                      ? 'border-primary/50 ring-2 ring-primary/20 bg-linear-to-b from-amber-50/50 to-card'
                      : isSuspended
                      ? 'border-rose-200 bg-rose-50/20'
                      : isExpiringSoon
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  {/* SECTION 1: IDENTITÉ & BADGES SYSTÈME */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Logo ou Initiale */}
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 text-primary font-bold text-lg flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          {param.logoBase64 ? (
                            <img
                              src={param.logoBase64}
                              alt={tenant.nom}
                              className="w-full h-full object-contain p-0.5"
                            />
                          ) : (
                            <span>{(tenant.nom || 'E')[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3
                            className="font-bold text-base text-foreground leading-tight truncate"
                            title={tenant.nom}
                          >
                            {tenant.nom}
                          </h3>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                            ID: {tenant.id}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Badges Système Distinctifs */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isDemo && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-700" /> École Pilote (Démo)
                        </span>
                      )}
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" /> Post Actuel
                        </span>
                      )}
                      {tenant.is_local && !isDemo && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/50 text-muted-foreground border border-border">
                          Base Locale
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SECTION 2: MODULES & FONCTIONNALITÉS ATTRIBUÉS */}
                  <div className="space-y-2 pt-2 border-t border-border/70">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Fonctionnalités attribuées
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {param.module_cantine !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                          <Utensils className="w-3 h-3 text-amber-700" /> Cantine
                        </span>
                      )}
                      {param.module_bus !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-900 border border-blue-200">
                          <Bus className="w-3 h-3 text-blue-700" /> Transport
                        </span>
                      )}
                      {param.module_uniforms !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-900 border border-indigo-200">
                          <Shirt className="w-3 h-3 text-indigo-700" /> Uniformes
                        </span>
                      )}
                      {param.module_evaluations !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                          <GraduationCap className="w-3 h-3 text-emerald-700" /> Évaluations
                        </span>
                      )}
                      {param.exonerate_personnel_children !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-900 border border-purple-200">
                          <Users2 className="w-3 h-3 text-purple-700" /> Enfants Pers.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: LICENCE & PÉRIODE DE VALIDITÉ */}
                  <div className="mt-auto pt-3 border-t border-border/70 space-y-3">
                    <div className="bg-muted/30 p-3 rounded-xl border border-border/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">État de la licence :</span>
                        {isSuspended ? (
                          <span className="text-xs font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full border border-rose-300">
                            {isExpired ? 'Expiré (Verrouillé)' : 'Suspendu'}
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                            J-{daysRemaining} ({daysRemaining}j restants)
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
                            Actif ({daysRemaining !== null ? `${daysRemaining}j restants` : 'Illimité'})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> Échéance :
                        </span>
                        <span className="text-foreground font-semibold">
                          {endDate
                            ? endDate.toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })
                            : 'Illimitée'}
                        </span>
                      </div>
                    </div>

                    {/* SECTION 4: PROLONGATION RAPIDE DE LICENCE */}
                    <div className="bg-muted/20 p-2.5 rounded-xl border border-border/70 space-y-1.5">
                      <div className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                        <span>Prolonger la licence :</span>
                        {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: '+1M', months: 1 },
                          { label: '+3M', months: 3 },
                          { label: '+6M', months: 6 },
                          { label: '+1An', months: 12 }
                        ].map((plan) => (
                          <button
                            key={plan.months}
                            onClick={() => handleRenew(tenant.id, plan.months)}
                            disabled={isUpdating}
                            className="text-xs py-1.5 rounded-lg bg-card hover:bg-primary hover:text-white border border-border text-foreground font-semibold transition-all disabled:opacity-50 text-center cursor-pointer shadow-2xs hover:shadow-xs"
                          >
                            {plan.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* SECTION 5: ACTIONS & BASCULE */}
                    <div className="flex gap-2 pt-1">
                      {isActive ? (
                        <div className="flex-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold py-2 rounded-xl text-center flex items-center justify-center gap-1.5 cursor-default">
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> ÉCOLE ACTIVE
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSwitchTenant(tenant.id)}
                          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold py-2 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> BASCULER
                        </button>
                      )}

                      {status === 'suspended' ? (
                        <button
                          onClick={() => handleUpdateStatus(tenant.id, 'active')}
                          disabled={isUpdating}
                          className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold py-2 rounded-xl transition-colors border border-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isUpdating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" /> RÉACTIVER
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateStatus(tenant.id, 'suspended')}
                          disabled={isUpdating}
                          className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-2 rounded-xl transition-colors border border-rose-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isUpdating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5" /> SUSPENDRE
                            </>
                          )}
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
    <div className="min-h-screen bg-background text-foreground p-6 sm:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
        {/* En-tête de Navigation SuperAdmin */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-foreground cursor-pointer"
              title="Retour au Tableau de Bord"
            >
              <ArrowLeft size={22} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5 tracking-tight">
                <ShieldCheck className="text-primary w-7 h-7" />
                <span>SuperAdmin & Gestion Multi-Établissements</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Console centrale d'administration des licences, locataires et builds autonomes
              </p>
            </div>
          </div>

          {/* Sélecteur d'Onglets Style Study-Agent */}
          <div className="flex bg-card p-1 rounded-xl border border-border shadow-2xs">
            <button
              onClick={() => setActiveTab('existing')}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'existing'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Locataires & Licences</span>
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'new'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nouveau Build (.exe)</span>
            </button>
          </div>
        </div>

        {/* Contenu Actif */}
        {activeTab === 'new' ? (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Panneau de Gauche : Formulaire Assistant */}
            <div className="flex-1 bg-card p-6 sm:p-8 rounded-2xl border border-border shadow-xs overflow-hidden">
              {renderStepIndicators()}
              <div className="mt-6">
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
                {step === 4 && renderStep4()}
                {step === 5 && renderStep5()}
              </div>
            </div>

            {/* Panneau de Droite : Terminal de Compilation */}
            <div className="flex-1 bg-card rounded-2xl border border-border shadow-xs flex flex-col h-[650px] overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono ml-2 flex items-center gap-1.5 font-semibold">
                    <Terminal className="w-3.5 h-3.5" /> Terminal de Compilation
                  </span>
                </div>
                {loading && (
                  <span className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Traitement en cours...
                  </span>
                )}
              </div>

              <div className="flex-1 p-4 bg-neutral-900 overflow-y-auto font-mono text-xs text-emerald-400 whitespace-pre-wrap leading-relaxed">
                {logs.length === 0 ? (
                  <span className="text-neutral-500">
                    En attente du lancement de la compilation... Les sorties stdout/stderr s'afficheront ici en direct.
                  </span>
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

function Button({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  type = 'button'
}: any) {
  const base =
    'px-4 py-2 rounded-xl text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 cursor-pointer shadow-2xs'
  const styles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
    outline: 'border border-border hover:bg-muted/40 text-foreground'
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant as keyof typeof styles]}`}
    >
      {children}
    </button>
  )
}
