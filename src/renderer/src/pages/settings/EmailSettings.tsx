import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Mail,
  Trash2,
  Server,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/lib/usePermissions'
import { useAppStore } from '@/store/useAppStore'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

interface EmailConfigState {
  enabled: boolean
  provider: 'brevo' | 'gmail'
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_key?: string
  sender_name?: string
  sender_email?: string
  gmail_address?: string
  gmail_app_password?: string
  recipient_email?: string
  auto_send_daily: boolean
}

interface EmailLogEntry {
  sent_at: string
  recipient: string
  subject: string
  success: boolean
  error?: string
}

export default function EmailSettings() {
  const { canWrite } = usePermissions()
  const { schoolConfig } = useAppStore()

  const defaultSchoolName = schoolConfig?.school_name || 'Study Agent'
  const defaultSchoolEmail = schoolConfig?.school_email || ''

  const [config, setConfig] = useState<EmailConfigState>({
    enabled: true,
    provider: 'brevo',
    smtp_host: 'smtp-relay.brevo.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_key: '',
    sender_name: defaultSchoolName,
    sender_email: defaultSchoolEmail,
    gmail_address: '',
    gmail_app_password: '',
    recipient_email: defaultSchoolEmail,
    auto_send_daily: true
  })

  const [showPassword, setShowPassword] = useState(false)
  const [logs, setLogs] = useState<EmailLogEntry[]>([])
  const [status, setStatus] = useState<{
    configured: boolean
    enabled: boolean
    auto_send: boolean
    provider?: string
  }>({
    configured: false,
    enabled: false,
    auto_send: false,
    provider: 'brevo'
  })

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sendingReport, setSendingReport] = useState(false)
  const [targetReportDate, setTargetReportDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    loadConfig()
    loadLogs()
    loadStatus()
  }, [])

  const loadConfig = async () => {
    try {
      const raw = await window.api.settings.get('email_config')
      if (raw) {
        const loaded = raw as EmailConfigState
        setConfig({
          enabled: loaded.enabled !== undefined ? loaded.enabled : true,
          provider: loaded.provider || 'brevo',
          smtp_host: loaded.smtp_host || 'smtp-relay.brevo.com',
          smtp_port: loaded.smtp_port || 587,
          smtp_user: loaded.smtp_user || '',
          smtp_key: loaded.smtp_key || '',
          sender_name: loaded.sender_name || defaultSchoolName,
          sender_email: loaded.sender_email || defaultSchoolEmail,
          gmail_address: loaded.gmail_address || '',
          gmail_app_password: loaded.gmail_app_password || '',
          recipient_email: loaded.recipient_email || defaultSchoolEmail,
          auto_send_daily: loaded.auto_send_daily !== undefined ? loaded.auto_send_daily : true
        })
      }
    } catch {
      // Default config
    }
  }

  const loadLogs = async () => {
    try {
      const result = await window.api.email.getLogs()
      if (result.success) setLogs(result.logs || [])
    } catch {
      // Empty logs
    }
  }

  const loadStatus = async () => {
    try {
      const result = await window.api.email.getStatus()
      if (result.success) {
        setStatus({
          configured: result.configured || false,
          enabled: result.enabled || false,
          auto_send: result.auto_send || false,
          provider: result.provider || 'brevo'
        })
      }
    } catch {
      // Default status
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const result = await window.api.email.configure(config)
      if (result.success) {
        toast.success('Configuration email enregistrée avec succès')
        loadStatus()
        loadLogs()
      } else {
        toast.error(result.error || 'Erreur de sauvegarde')
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    const toastId = toast.loading('Vérification de la connexion SMTP...')
    try {
      const result = await window.api.email.testConnection({
        provider: config.provider,
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        smtp_user: config.smtp_user,
        smtp_key: config.smtp_key,
        gmail_address: config.gmail_address,
        gmail_app_password: config.gmail_app_password
      })

      if (result.success) {
        toast.success('Connexion SMTP réussie ! Le serveur répond parfaitement.', { id: toastId })
        loadLogs()
      } else {
        toast.error(result.error || 'Échec de connexion SMTP', { id: toastId })
        loadLogs()
      }
    } catch (e: unknown) {
      toast.error('Erreur de test: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setTesting(false)
    }
  }

  const handleSendDailyReportNow = async () => {
    if (!config.recipient_email) {
      toast.error('Veuillez renseigner une adresse email destinataire.')
      return
    }

    setSendingReport(true)
    const toastId = toast.loading(`Génération et envoi du bilan pour le ${targetReportDate}...`)
    try {
      const res = await window.api.email.sendDailyReport(targetReportDate)
      if (res.success) {
        toast.success(`Rapport financier du ${targetReportDate} transmis avec succès !`, { id: toastId })
        loadLogs()
      } else {
        toast.error(res.error || "Échec de l'envoi du rapport", { id: toastId })
        loadLogs()
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setSendingReport(false)
    }
  }

  const handleClearLogs = async () => {
    if (!confirm("Voulez-vous effacer l'historique des envois d'emails ?")) return
    try {
      const r = await window.api.email.clearLogs()
      if (r.success) {
        setLogs([])
        toast.success('Historique effacé')
      }
    } catch {
      toast.error("Impossible d'effacer les logs")
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-2">
      <ReadOnlyBanner resource="settings" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            Service d'Automatisation Email
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Relais SMTP, transmission automatique du bilan de caisse quotidien et alertes comptables
          </p>
        </div>

        {/* Quick Status Pill */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'px-2.5 py-1 rounded-full font-semibold border flex items-center gap-1.5',
              status.configured
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-muted text-muted-foreground border-border'
            )}
          >
            {status.configured ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Configuré ({status.provider?.toUpperCase()})</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Non configuré</span>
              </>
            )}
          </span>

          <span
            className={cn(
              'px-2.5 py-1 rounded-full font-semibold border',
              status.enabled
                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                : 'bg-muted text-muted-foreground border-border'
            )}
          >
            {status.enabled ? 'Service Activé' : 'Désactivé'}
          </span>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
        {/* Toggle Enable */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <Label htmlFor="email-enabled" className="text-base font-semibold cursor-pointer text-foreground">
              Activer le service d'envoi d'emails
            </Label>
            <p className="text-xs text-muted-foreground">
              Permet l'envoi de rapports financiers et de notifications automatiques
            </p>
          </div>
          <input
            type="checkbox"
            id="email-enabled"
            checked={config.enabled}
            onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
            className="w-5 h-5 accent-primary rounded cursor-pointer"
          />
        </div>

        {/* Provider Cards */}
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Fournisseur SMTP
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Brevo Card */}
            <div
              onClick={() => setConfig((p) => ({ ...p, provider: 'brevo' }))}
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all relative',
                config.provider === 'brevo'
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-border hover:border-border/80 bg-card'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">Brevo SMTP (Recommandé)</h3>
                    <p className="text-[11px] text-muted-foreground">Relais transactionnel haute fiabilité</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  Gratuit 300/j
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Aucun blocage de sécurité Google, pas d'expiration de mot de passe d'application.
              </p>
            </div>

            {/* Gmail Card */}
            <div
              onClick={() => setConfig((p) => ({ ...p, provider: 'gmail' }))}
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all relative',
                config.provider === 'gmail'
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-border hover:border-border/80 bg-card'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">Gmail SMTP</h3>
                    <p className="text-[11px] text-muted-foreground">Via mot de passe d'application Google</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Nécessite l'authentification 2FA activée sur votre compte Google.
              </p>
            </div>
          </div>
        </div>

        {/* Provider Specific Configuration Fields */}
        {config.provider === 'brevo' ? (
          <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Server className="w-4 h-4 text-primary" />
                Paramètres du Relais Brevo
              </span>
              <a
                href="https://app.brevo.com/settings/keys/smtp"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                <span>Obtenir vos clés SMTP Brevo</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Identifiant de connexion (Login SMTP)</Label>
                <Input
                  value={config.smtp_user || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, smtp_user: e.target.value }))}
                  placeholder="ex: 7a8b9c@smtp-brevo.com ou votre email"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs">Clé SMTP (Mot de passe relais)</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={config.smtp_key || ''}
                    onChange={(e) => setConfig((p) => ({ ...p, smtp_key: e.target.value }))}
                    placeholder="xsmtpsib-..."
                    className="h-9 text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Nom de l'expéditeur (Affiché aux destinataires)</Label>
                <Input
                  value={config.sender_name || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, sender_name: e.target.value }))}
                  placeholder={defaultSchoolName}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs">Email de l'expéditeur validé dans Brevo</Label>
                <Input
                  type="email"
                  value={config.sender_email || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, sender_email: e.target.value }))}
                  placeholder={defaultSchoolEmail || 'contact@votre-ecole.mg'}
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Adresse Gmail expéditrice</Label>
                <Input
                  type="email"
                  value={config.gmail_address || ''}
                  onChange={(e) => setConfig((p) => ({ ...p, gmail_address: e.target.value }))}
                  placeholder="votre-ecole@gmail.com"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs">Mot de passe d'application Google (16 caractères)</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={config.gmail_app_password || ''}
                    onChange={(e) => setConfig((p) => ({ ...p, gmail_app_password: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="h-9 text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Google Compte → Sécurité → Validation en 2 étapes → Mots de passe des applications.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Common Recipient & Schedule Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <Label className="text-xs">Destinataire officiel (Direction / Trésorerie)</Label>
            <Input
              type="email"
              value={config.recipient_email || ''}
              onChange={(e) => setConfig((p) => ({ ...p, recipient_email: e.target.value }))}
              placeholder={defaultSchoolEmail || 'direction@votre-ecole.mg'}
              className="mt-1 h-9 text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reçoit le récapitulatif quotidien de caisse et le fichier PDF officiel annexé.
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-3 mt-2">
              <input
                type="checkbox"
                id="auto-send"
                checked={config.auto_send_daily}
                onChange={(e) => setConfig((p) => ({ ...p, auto_send_daily: e.target.checked }))}
                className="w-4 h-4 accent-primary rounded cursor-pointer"
              />
              <Label htmlFor="auto-send" className="text-xs cursor-pointer text-foreground font-medium">
                Envoi automatique du bilan journalier à 18h00 (du lundi au samedi)
              </Label>
            </div>
          </div>
        </div>

        {/* Buttons */}
        {canWrite('settings') && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={saveConfig} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer la configuration
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tester la connexion SMTP
            </Button>
          </div>
        )}
      </div>

      {/* Manual Report Trigger Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-foreground">Déclenchement Manuel du Bilan Financier</h3>
            <p className="text-xs text-muted-foreground">
              Transmettez immédiatement le rapport financier complet avec PDF pour la date sélectionnée
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <Input
              type="date"
              value={targetReportDate}
              onChange={(e) => setTargetReportDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleSendDailyReportNow}
            disabled={sendingReport || !config.enabled}
            className="flex items-center gap-1.5"
          >
            {sendingReport ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            <span>Envoyer le bilan de cette date</span>
          </Button>
        </div>
      </div>

      {/* Email Transmission Logs */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-foreground">Historique des envois récents</h3>
            <p className="text-xs text-muted-foreground">Derniers emails générés et statuts de livraison</p>
          </div>
          {logs.length > 0 && canWrite('settings') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearLogs}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              <span>Effacer l'historique</span>
            </Button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4">Aucun envoi enregistré pour le moment.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {logs.map((log, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 text-xs p-3 bg-muted/40 rounded-lg border border-border"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {log.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">{log.subject}</div>
                    <div className="text-[11px] text-muted-foreground truncate">À : {log.recipient}</div>
                    {log.error && <div className="text-[11px] text-destructive mt-0.5">{log.error}</div>}
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(log.sent_at).toLocaleDateString('fr-FR')}{' '}
                  {new Date(log.sent_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
