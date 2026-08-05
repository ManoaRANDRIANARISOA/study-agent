import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Box, Check, Loader2, Image as ImageIcon } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

export default function SuperAdminBuilder() {
  const [step, setStep] = useState(1)

  // Identité
  const [nom, setNom] = useState('')
  const [appName, setAppName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Direction
  const [directorTitle, setDirectorTitle] = useState('Le Directeur')
  const [directorName, setDirectorName] = useState('')

  // Modules
  const [cantine, setCantine] = useState(true)
  const [bus, setBus] = useState(true)
  const [uniforms, setUniforms] = useState(true)
  const [evaluations, setEvaluations] = useState(true)

  // Branding
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [primaryColor, setPrimaryColor] = useState('24 23% 57%') // Default HSL

  // Build State
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
        primary_color: primaryColor
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 flex flex-col">
      <div className="max-w-6xl mx-auto w-full flex flex-col md:flex-row gap-8">
        
        {/* Panneau de Gauche : Formulaire */}
        <div className="flex-1 bg-slate-900 p-8 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-4">
            <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Box className="text-blue-500" /> SuperAdmin Builder
              </h1>
            </div>
          </div>

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
