import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  CreditCard,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Check,
  ShieldAlert
} from 'lucide-react'

export const DuplicateManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'payments' | 'students'>('payments')

  // Payment Duplicates State
  const [paymentGroups, setPaymentGroups] = useState<any[]>([])
  const [scanningPayments, setScanningPayments] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [resolvingPaymentId, setResolvingPaymentId] = useState<string | null>(null)
  const [autoResolving, setAutoResolving] = useState(false)
  const [autoResolvedList, setAutoResolvedList] = useState<any[]>([])

  // Student Duplicates State
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [scanningStudents, setScanningStudents] = useState(false)
  const [studentMessage, setStudentMessage] = useState<string | null>(null)
  const [mergingStudentId, setMergingStudentId] = useState<string | null>(null)

  // Scan Payments
  const handleScanPayments = async () => {
    setScanningPayments(true)
    setPaymentMessage(null)
    try {
      if (window.api?.duplicates?.scanPayments) {
        const res = await window.api.duplicates.scanPayments()
        if (res.success) {
          setPaymentGroups(res.groups || [])
          if (!res.groups || res.groups.length === 0) {
            setPaymentMessage(
              'Aucun doublon de paiement détecté. Tous les écolages et écritures de caisse sont parfaitement cohérents.'
            )
          }
        } else {
          setPaymentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setPaymentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setScanningPayments(false)
    }
  }

  // Auto Resolve Collisions
  const handleAutoResolveCollisions = async () => {
    if (
      !confirm(
        'Résolution automatique multi-postes :\n\n' +
          'Le système va parcourir tous les paiements en double (ex: écolage payé sur Caisse 1 et Caisse 2).\n' +
          "Il conservera automatiquement le 1er reçu émis (l'original le plus ancien ou le plus imprimé) et annulera le doublon en caisse et sur le cloud.\n\n" +
          'Voulez-vous lancer la résolution automatique ?'
      )
    )
      return

    setAutoResolving(true)
    try {
      if (window.api?.duplicates?.autoResolveCollisions) {
        const res = await window.api.duplicates.autoResolveCollisions()
        if (res.success) {
          setAutoResolvedList(res.resolved || [])
          setPaymentMessage(res.message || 'Collisions résolues avec succès.')
          await handleScanPayments()
        } else {
          setPaymentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setPaymentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setAutoResolving(false)
    }
  }

  // Resolve Payment Duplicate
  const handleResolvePayment = async (group: any, keepRecord: any, removeRecord: any) => {
    const confirmMsg =
      `Confirmation d'annulation de paiement en doublon :\n\n` +
      `Élève : ${group.student.last_name} ${group.student.first_name} (${group.student.class_name || 'Sans classe'})\n` +
      `Motif : ${group.payment_type_label} ${group.month ? `(${group.month})` : ''}\n\n` +
      `🟢 CONSERVER : Reçu ${keepRecord.receipt_number || 'N/A'} — ${keepRecord.amount.toLocaleString('fr-FR')} Ar (${keepRecord.station || 'Caisse'})\n` +
      `🔴 ANNULER & SUPPRIMER : Reçu ${removeRecord.receipt_number || 'N/A'} — ${removeRecord.amount.toLocaleString('fr-FR')} Ar (${removeRecord.station || 'Caisse'})\n\n` +
      `Cette action va passer le reçu ${removeRecord.receipt_number || ''} en annulé, déduire son montant du journal de caisse pour équilibrer la trésorerie et propager l'annulation sur le Cloud Supabase.\n\n` +
      `Voulez-vous continuer ?`

    if (!confirm(confirmMsg)) return

    setResolvingPaymentId(removeRecord.id)
    try {
      if (window.api?.duplicates?.resolvePayment) {
        const res = await window.api.duplicates.resolvePayment(
          keepRecord.id,
          removeRecord.id,
          `Doublon résolu inter-caisses (${keepRecord.station || 'Caisse'} conservée)`
        )
        if (res.success) {
          await handleScanPayments()
        } else {
          alert('Erreur lors de la résolution : ' + res.error)
        }
      }
    } catch (e: any) {
      alert('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setResolvingPaymentId(null)
    }
  }

  // Scan Students
  const handleScanStudents = async () => {
    setScanningStudents(true)
    setStudentMessage(null)
    try {
      if (window.api?.duplicates?.scan) {
        const res = await window.api.duplicates.scan()
        if (res.success) {
          setStudentGroups(res.groups || [])
          if (!res.groups || res.groups.length === 0) {
            setStudentMessage('Aucun dossier élève en doublon détecté. Les profils élèves sont sains.')
          }
        } else {
          setStudentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setStudentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setScanningStudents(false)
    }
  }

  // Merge Students
  const handleMergeStudents = async (keepId: string, removeId: string) => {
    if (
      !confirm(
        'Voulez-vous vraiment fusionner ces dossiers ?\nTous les paiements, notes et présences seront rattachés au profil conservé. Le profil en doublon sera désactivé.'
      )
    ) {
      return
    }

    setMergingStudentId(removeId)
    try {
      if (window.api?.duplicates?.merge) {
        const res = await window.api.duplicates.merge(keepId, removeId)
        if (res.success) {
          await handleScanStudents()
        } else {
          alert('Erreur fusion : ' + res.error)
        }
      }
    } catch (e: any) {
      alert('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setMergingStudentId(null)
    }
  }

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl shadow-xs border border-border mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Centre de Contrôle & Doublons
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Outils de réconciliation de données en cas de double saisie sur plusieurs postes (Caisse 1 / Caisse 2) ou de doublons d'élèves.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-muted p-1 rounded-lg self-start sm:self-auto border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'payments'
                ? 'bg-background text-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Paiements Multi-Postes</span>
            {paymentGroups.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {paymentGroups.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'students'
                ? 'bg-background text-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Dossiers Élèves</span>
            {studentGroups.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {studentGroups.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PAIEMENTS MULTI-POSTES (C1 vs C2) */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-primary/5 p-3.5 rounded-lg border border-primary/20">
            <div className="text-xs text-foreground">
              <span className="font-semibold">Vérification des doubles saisies d'écolage :</span>
              <p className="text-muted-foreground mt-0.5">
                Détecte les cas où un élève a été encaissé à la fois sur le Poste 1 et sur le Poste 2 pour le même mois et la même année scolaire.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleScanPayments}
                disabled={scanningPayments || autoResolving}
                variant="outline"
                className="text-xs h-8 px-3 border-primary/30 text-primary hover:bg-primary/10"
              >
                {scanningPayments ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Scan en cours...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Scanner les paiements
                  </>
                )}
              </Button>

              {paymentGroups.length > 0 && (
                <Button
                  type="button"
                  onClick={handleAutoResolveCollisions}
                  disabled={autoResolving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 text-xs h-8 px-3 font-medium shadow-xs"
                >
                  {autoResolving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Résolution auto...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Résoudre tout (Garder 1er reçu)
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {autoResolvedList.length > 0 && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {autoResolvedList.length} collision(s) résolue(s) avec succès :
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-emerald-500/10 bg-background rounded border border-emerald-500/20">
                {autoResolvedList.map((item, idx) => (
                  <div key={idx} className="p-2 flex justify-between items-center text-[11px]">
                    <div>
                      <span className="font-medium text-foreground">{item.student_name}</span>{' '}
                      <span className="text-muted-foreground">({item.class_name || 'Sans classe'})</span> —{' '}
                      <span className="text-emerald-600 font-semibold">{item.month}</span> ({item.amount.toLocaleString()} Ar)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                        Gardé: {item.kept_receipt}
                      </span>
                      <span className="text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 line-through font-mono">
                        Annulé: {item.removed_receipt}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paymentMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                paymentMessage.includes('Aucun doublon')
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
              }`}
            >
              {paymentMessage.includes('Aucun doublon') ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{paymentMessage}</span>
            </div>
          )}

          {paymentGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {paymentGroups.length} groupe{paymentGroups.length > 1 ? 's' : ''} de paiement{paymentGroups.length > 1 ? 's' : ''} en doublon détecté{paymentGroups.length > 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-muted-foreground italic">
                  Cliquez sur "Conserver ce reçu" pour valider l'exemplaire légitime et annuler le doublon
                </span>
              </div>

              {paymentGroups.map((group) => (
                <div
                  key={group.group_id}
                  className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3"
                >
                  {/* Student Title & Context */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-amber-500/20 pb-2.5">
                    <div>
                      <span className="font-bold text-foreground text-sm">
                        {group.student.last_name} {group.student.first_name}
                      </span>
                      {group.student.class_name && (
                        <span className="ml-2 px-2 py-0.5 bg-muted text-foreground rounded text-xs font-medium">
                          {group.student.class_name}
                        </span>
                      )}
                      {group.student.registration_number && (
                        <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                          (Matr: {group.student.registration_number})
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded self-start sm:self-auto">
                      {group.payment_type_label} {group.month ? `— ${group.month}` : ''} ({group.school_year})
                    </div>
                  </div>

                  {/* Comparative Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.records.map((rec: any) => {
                      const otherRec = group.records.find((r: any) => r.id !== rec.id)
                      const isResolving =
                        resolvingPaymentId === rec.id || resolvingPaymentId === otherRec?.id

                      return (
                        <div
                          key={rec.id}
                          className="bg-card p-3.5 rounded-lg border border-border shadow-xs space-y-2.5 flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  rec.station === 'C1'
                                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                    : rec.station === 'C2'
                                      ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                                      : 'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                {rec.station || 'Caisse'}
                              </span>
                              <span className="font-mono text-xs font-bold text-foreground">
                                {rec.receipt_number || 'N° Reçu Inconnu'}
                              </span>
                            </div>

                            <div className="text-sm font-extrabold text-foreground">
                              {rec.amount.toLocaleString('fr-FR')} Ar
                            </div>

                            <div className="text-[11px] text-muted-foreground space-y-0.5">
                              <div>
                                <span className="font-medium">Date paiement :</span>{' '}
                                {new Date(rec.payment_date).toLocaleDateString('fr-FR')}
                              </div>
                              <div>
                                <span className="font-medium">Opérateur :</span> {rec.created_by}
                              </div>
                              <div>
                                <span className="font-medium">Enregistré le :</span>{' '}
                                {new Date(rec.created_at).toLocaleString('fr-FR')}
                              </div>
                              <div>
                                <span className="font-medium">Impressions ticket :</span>{' '}
                                {rec.print_count > 0 ? (
                                  <span className="font-bold text-emerald-600">
                                    {rec.print_count} fois
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            onClick={() => handleResolvePayment(group, rec, otherRec)}
                            disabled={isResolving}
                            className="w-full text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                          >
                            {isResolving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Conserver ce reçu & Annuler l'autre
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DOSSIERS ÉLÈVES */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-primary/5 p-3.5 rounded-lg border border-primary/20">
            <div className="text-xs text-foreground">
              <span className="font-semibold">Scanner les doublons d'élèves :</span>
              <p className="text-muted-foreground mt-0.5">
                Recherche les dossiers élèves partageant les mêmes nom et prénom. Vous pourrez fusionner les paiements, notes et présences vers le profil principal.
              </p>
            </div>

            <Button
              type="button"
              onClick={handleScanStudents}
              disabled={scanningStudents}
              variant="outline"
              className="text-xs h-8 px-3 border-primary/30 text-primary hover:bg-primary/10 self-start sm:self-auto"
            >
              {scanningStudents ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Scan en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Scanner les élèves
                </>
              )}
            </Button>
          </div>

          {studentMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                studentMessage.includes('Aucun dossier')
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
              }`}
            >
              {studentMessage.includes('Aucun dossier') ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{studentMessage}</span>
            </div>
          )}

          {studentGroups.length > 0 && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {studentGroups.length} groupe{studentGroups.length > 1 ? 's' : ''} d'élèves en doublon détecté{studentGroups.length > 1 ? 's' : ''}
              </div>

              {studentGroups.map((group, gIdx) => (
                <div
                  key={gIdx}
                  className="p-4 rounded-lg border border-border bg-card space-y-3"
                >
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span>{group.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      ({group.records.length} fiches)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.records.map((rec: any, rIdx: number) => {
                      const otherRec = group.records[rIdx === 0 ? 1 : 0]
                      const isMerging = mergingStudentId === rec.id

                      return (
                        <div
                          key={rec.id}
                          className="p-3 bg-muted/40 rounded-lg border border-border text-xs space-y-2 flex flex-col justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-foreground">
                                Classe : {rec.class_name || 'Non renseignée'}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                Matr: {rec.registration_number || 'Aucun'}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Créé le : {new Date(rec.created_at).toLocaleDateString('fr-FR')}
                            </div>
                            <div className="flex gap-2 text-[11px] pt-1">
                              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                                {rec.payments_count} paiements
                              </span>
                              <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                                {rec.grades_count} notes
                              </span>
                            </div>
                          </div>

                          {otherRec && (
                            <Button
                              type="button"
                              onClick={() => handleMergeStudents(rec.id, otherRec.id)}
                              disabled={isMerging}
                              className="w-full text-xs h-7 mt-2 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              {isMerging ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Check className="w-3 h-3 mr-1" />
                              )}
                              Garder ce profil & Fusionner l'autre
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DuplicateManager
