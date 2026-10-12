import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useClasses } from '@/lib/useClasses'
import { cn } from '@/lib/utils'
import {
  ExternalLink,
  Search,
  Filter,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Download,
  Sparkles
} from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import DataExportModal, { ExportColumnDef, ExportPresetDef } from '@/components/shared/DataExportModal'
import { useAppStore, getDynamicSchoolYear } from '@/store/useAppStore'

interface UnpaidItem {
  type: string
  description?: string
  label?: string
  amount: number
  month?: string
}

interface UnpaidStudent {
  student_id: string
  first_name: string
  last_name: string
  class_name: string
  unpaid_items: UnpaidItem[]
  total_due: number
}

interface FilteredStudent extends UnpaidStudent {
  display_items: UnpaidItem[]
  display_total: number
}

// Composant pour l'affichage groupé des impayés d'un élève
function UnpaidItemsGrouped({ items }: { items: UnpaidItem[] }) {
  const [expanded, setExpanded] = useState(false)

  // Grouper par type
  const grouped = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const type = item.type
        if (!acc[type]) acc[type] = []
        acc[type].push(item)
        return acc
      },
      {} as Record<string, UnpaidItem[]>
    )
  }, [items])

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      enrollment: "Frais d'inscription",
      reenrollment: 'Réinscription',
      tuition: 'Écolage',
      bus: 'Transport',
      canteen: 'Cantine',
      event: 'Événement'
    }
    return labels[type] || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      enrollment: 'bg-sky-50 text-sky-700 border-sky-200',
      reenrollment: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      tuition: 'bg-rose-50 text-rose-700 border-rose-200',
      bus: 'bg-amber-50 text-amber-700 border-amber-200',
      canteen: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      event: 'bg-purple-50 text-purple-700 border-purple-200'
    }
    return colors[type] || 'bg-gray-50 text-gray-700 border-gray-200'
  }

  // Si moins de 3 types différents, on affiche tout par défaut
  const entries = Object.entries(grouped)
  const isLarge = items.length > 3

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {entries.map(([type, typeItems]) => (
          <div
            key={type}
            className={cn(
              'px-2.5 py-1.5 border rounded-md text-xs flex flex-col gap-1 shadow-sm',
              getTypeColor(type)
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold uppercase tracking-wider text-[10px] opacity-80">
                {getTypeLabel(type)} ({typeItems.length})
              </span>
            </div>

            {expanded || !isLarge ? (
              <div className="flex flex-wrap gap-1 mt-1 max-w-[200px]">
                {typeItems.map((item, idx) => {
                  const rawDesc = item.description || item.label || ''
                  // Nettoyer la description (ex: "Écolage (2026-01)" -> "2026-01")
                  const match = rawDesc.match(/\((.*?)\)/)
                  let displayStr = match ? match[1] : rawDesc

                  // Formater la date si c'est au format YYYY-MM
                  if (/^\d{4}-\d{2}$/.test(displayStr)) {
                    const [year, month] = displayStr.split('-')
                    const date = new Date(parseInt(year), parseInt(month) - 1)
                    displayStr = date.toLocaleDateString('fr-FR', {
                      month: 'long',
                      year: 'numeric'
                    })
                    // Mettre la première lettre en majuscule (ex: "février 2026" -> "Février 2026")
                    displayStr = displayStr.charAt(0).toUpperCase() + displayStr.slice(1)
                  }

                  return (
                    <span
                      key={idx}
                      className="bg-white/60 px-1.5 rounded text-[10px] font-medium whitespace-nowrap"
                    >
                      {displayStr}
                    </span>
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {isLarge && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 w-fit transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Masquer les détails
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Afficher tout ({items.length} mois)
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default function PaymentAlerts() {
  const { classes } = useClasses()
  const [alerts, setAlerts] = useState<UnpaidStudent[]>([])
  const [loading, setLoading] = useState(true)

  // Filtres
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [minMonths, setMinMonths] = useState(1)

  // Export Modal
  const [isExportOpen, setIsExportOpen] = useState(false)

  const { currentYear, schoolConfig } = useAppStore()
  const currency = schoolConfig?.currency || 'Ar'
  const [targetYear, setTargetYear] = useState<string>(currentYear || getDynamicSchoolYear())

  const availableYears = useMemo(() => {
    const baseYear = parseInt((currentYear || getDynamicSchoolYear()).split('-')[0]) || new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const start = baseYear - 2 + i
      return `${start}-${start + 1}`
    })
  }, [currentYear])

  // Génération dynamique des mois de l'année scolaire sélectionnée
  const schoolMonths = useMemo(() => {
    const [startYearStr, endYearStr] = (targetYear || getDynamicSchoolYear()).split('-')
    const startYear = parseInt(startYearStr) || new Date().getFullYear()
    const endYear = parseInt(endYearStr) || startYear + 1
    return [
      { key: `${startYear}-09`, label: `Septembre ${startYear}` },
      { key: `${startYear}-10`, label: `Octobre ${startYear}` },
      { key: `${startYear}-11`, label: `Novembre ${startYear}` },
      { key: `${startYear}-12`, label: `Décembre ${startYear}` },
      { key: `${endYear}-01`, label: `Janvier ${endYear}` },
      { key: `${endYear}-02`, label: `Février ${endYear}` },
      { key: `${endYear}-03`, label: `Mars ${endYear}` },
      { key: `${endYear}-04`, label: `Avril ${endYear}` },
      { key: `${endYear}-05`, label: `Mai ${endYear}` },
      { key: `${endYear}-06`, label: `Juin ${endYear}` },
      { key: `${endYear}-07`, label: `Juillet ${endYear}` }
    ]
  }, [targetYear])

  useEffect(() => {
    setSelectedMonth('all')
    loadAlerts(targetYear)
  }, [targetYear])

  const loadAlerts = async (year: string) => {
    setLoading(true)
    try {
      const result = await window.api.payment.getUnpaidAlerts(year)
      if (result.success && Array.isArray(result.alerts)) {
        setAlerts(result.alerts as UnpaidStudent[])
      } else {
        if (import.meta.env.DEV) console.error('Failed to load payment alerts:', result.error)
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load payment alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  // Application de tous les filtres avec isolation du mois si sélectionné
  const filtered: FilteredStudent[] = useMemo(() => {
    return alerts
      .map((a) => {
        // Filtrer les items correspondant au type et au mois choisi
        const matchingItems = (a.unpaid_items || []).filter((item) => {
          // Filtre par type
          if (selectedType !== 'all' && item.type !== selectedType) return false

          // Filtre par mois spécifique
          if (selectedMonth !== 'all') {
            const rawDesc = item.description || item.label || ''
            const itemMonth = item.month || rawDesc.match(/\((\d{4}-\d{2})\)/)?.[1]
            if (itemMonth !== selectedMonth) return false
          }

          return true
        })

        const displayTotal = matchingItems.reduce((sum, item) => sum + item.amount, 0)

        return {
          ...a,
          display_items: matchingItems,
          display_total: displayTotal
        }
      })
      .filter((a) => {
        // Ne garder que les élèves ayant au moins un impayé dans la sélection
        if (a.display_items.length === 0) return false

        // 1. Filtre par classe
        if (selectedClass !== 'all' && a.class_name !== selectedClass) return false

        // 2. Filtre par mois minimum (actif uniquement quand tous les mois sont sélectionnés)
        if (selectedMonth === 'all' && (a.unpaid_items?.length || 0) < minMonths) return false

        // 3. Filtre de recherche textuelle
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase()
          const fullName = `${a.first_name} ${a.last_name}`.toLowerCase()
          if (!fullName.includes(searchLower)) return false
        }

        return true
      })
      .sort((a, b) => b.display_total - a.display_total) // Trier par le montant le plus élevé d'abord
  }, [alerts, selectedClass, minMonths, searchTerm, selectedType, selectedMonth])

  const totalUnpaid = filtered.reduce((sum, a) => sum + a.display_total, 0)
  const totalItemsCount = filtered.reduce((sum, a) => sum + a.display_items.length, 0)
  const totalStudents = filtered.length

  const selectedMonthLabel =
    schoolMonths.find((m) => m.key === selectedMonth)?.label || selectedMonth

  const typeLabels: Record<string, string> = {
    enrollment: "Frais d'inscription",
    reenrollment: 'Réinscription',
    tuition: 'Écolage',
    bus: 'Transport',
    canteen: 'Cantine',
    event: 'Événement'
  }

  // Configuration de l'export modulaire
  const exportColumns: ExportColumnDef[] = [
    { key: 'nom', label: 'Nom de famille' },
    { key: 'prenom', label: 'Prénom' },
    { key: 'classe', label: 'Classe' },
    { key: 'types', label: "Type(s) d'impayé" },
    { key: 'mois', label: 'Mois / Détails' },
    { key: 'montant_selection', label: `Montant dû sélection (${currency})` },
    { key: 'total_dette', label: `Total dette globale élève (${currency})` }
  ]

  const exportPresets: Record<string, ExportPresetDef> = {
    recouvrement: {
      name: 'Recouvrement ciblé',
      icon: '📋',
      keys: ['nom', 'prenom', 'classe', 'types', 'mois', 'montant_selection']
    },
    complet: {
      name: 'Complet avec dette totale',
      icon: '📑',
      keys: ['nom', 'prenom', 'classe', 'types', 'mois', 'montant_selection', 'total_dette']
    }
  }

  const getExportData = () => {
    return filtered.map((s) => {
      const distinctTypes = Array.from(
        new Set(s.display_items.map((i) => typeLabels[i.type] || i.type))
      ).join(', ')

      const moisDetails = s.display_items
        .map((i) => {
          const rawDesc = i.description || i.label || ''
          const match = rawDesc.match(/\((.*?)\)/)
          const raw = match ? match[1] : rawDesc
          if (/^\d{4}-\d{2}$/.test(raw)) {
            const [y, m] = raw.split('-')
            const d = new Date(parseInt(y), parseInt(m) - 1)
            const monthName = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            return monthName.charAt(0).toUpperCase() + monthName.slice(1)
          }
          return raw
        })
        .join(', ')

      return {
        nom: s.last_name,
        prenom: s.first_name,
        classe: s.class_name,
        types: distinctTypes,
        mois: moisDetails,
        montant_selection: s.display_total,
        total_dette: s.total_due
      }
    })
  }

  const exportTitle =
    selectedMonth !== 'all'
      ? `État des Impayés — ${selectedMonthLabel}`
      : `État Global des Impayés`

  const exportFilename =
    selectedMonth !== 'all'
      ? `impayes_${selectedMonth.replace('-', '_')}`
      : `impayes_global_${targetYear.replace('-', '_')}`

  return (
    <div className="space-y-6">
      <ReadOnlyBanner resource="payments" />

      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Alertes de Paiement & Retards
          </h1>
          <p className="text-sm text-gray-500">
            Détection automatique des impayés (scolarité, transport, cantine, droits)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setIsExportOpen(true)}
            variant="outline"
            disabled={filtered.length === 0}
            className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary shadow-xs"
            title="Exporter la liste filtrée au format Excel, CSV, PDF ou JSON"
          >
            <Download className="w-4 h-4" />
            Exporter ({filtered.length})
          </Button>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-xs">
            <Label className="text-xs text-gray-500 font-medium">Année :</Label>
            <select
              className="text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer text-gray-700"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <a
            href="#/finance"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-xs"
            title="Ouvrir le module d'harmonisation des inscriptions / réinscriptions"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Harmoniser Inscriptions
          </a>

          <Button onClick={() => loadAlerts(targetYear)} variant="outline" className="gap-2">
            Actualiser
          </Button>
        </div>
      </div>

      {/* Cartes statistiques (Kpis) avec un design plus premium */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-xs relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <AlertCircle className="w-16 h-16 text-rose-600" />
          </div>
          <p className="text-sm font-medium text-gray-500">Élèves en retard</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
            <span className="text-sm text-gray-500">élèves</span>
          </div>
        </div>

        <div className="p-5 bg-rose-50 rounded-xl border border-rose-100 shadow-xs relative overflow-hidden">
          <p className="text-sm font-medium text-rose-800">
            {selectedMonth !== 'all' ? `Montant dû (${selectedMonthLabel})` : 'Montant total à recouvrer'}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-rose-600">{totalUnpaid.toLocaleString()}</p>
            <span className="text-sm text-rose-600 font-semibold">{currency}</span>
          </div>
          {selectedMonth !== 'all' && (
            <p className="text-xs text-rose-500 mt-1">
              Filtre actif sur {selectedMonthLabel}
            </p>
          )}
        </div>

        <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-xs relative overflow-hidden">
          <p className="text-sm font-medium text-gray-500">Volume total d'arriérés</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-amber-600">{totalItemsCount}</p>
            <span className="text-sm text-gray-500">
              {selectedMonth !== 'all' ? 'lignes sur le mois' : 'mois/prestations impayés'}
            </span>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Rechercher</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Nom ou prénom..."
              className="pl-9 bg-gray-50/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Classe</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="all">Toutes les classes</option>
            {classes.map((c) => {
              const name = typeof c === 'string' ? c : (c as any).name || c
              return (
                <option key={name} value={name}>
                  {name}
                </option>
              )
            })}
          </select>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Type d'impayé</Label>
          <div className="relative">
            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-ring"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">Tous les types</option>
              <option value="tuition">Écolage</option>
              <option value="bus">Transport</option>
              <option value="canteen">Cantine</option>
              <option value="enrollment">Frais d'inscription</option>
              <option value="reenrollment">Réinscription</option>
              <option value="event">Événements</option>
            </select>
          </div>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-rose-500" /> Mois concerné
          </Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="all">Tous les mois</option>
            {schoolMonths.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">
            Mois minimum {selectedMonth !== 'all' && <span className="text-[10px] text-gray-400 lowercase">(inactif)</span>}
          </Label>
          <select
            disabled={selectedMonth !== 'all'}
            className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            value={minMonths}
            onChange={(e) => setMinMonths(Number(e.target.value))}
          >
            <option value={1}>Dès 1 impayé</option>
            <option value={2}>2 impayés ou plus</option>
            <option value={3}>3 impayés ou plus (Critique)</option>
          </select>
        </div>
      </div>

      {/* Table des résultats */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/80 text-gray-500 uppercase text-xs font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Élève</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4">Détails des impayés</th>
                <th className="px-6 py-4 text-right">
                  {selectedMonth !== 'all' ? `Montant dû (${selectedMonthLabel})` : 'Montant dû'}
                </th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Analyse des paiements en cours...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-base font-medium text-gray-600">
                        Aucun impayé trouvé
                      </span>
                      <span className="text-xs">
                        Tous les élèves sont à jour pour les critères sélectionnés.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr key={student.student_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <a
                          href={`#/students/${student.student_id}`}
                          className="font-bold text-gray-900 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          {student.last_name} {student.first_name}
                        </a>
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {student.class_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center align-top pt-5">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5',
                            student.display_items.length >= 3
                              ? 'bg-rose-100 text-rose-700'
                              : student.display_items.length >= 2
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-orange-50 text-orange-700'
                          )}
                        >
                          <div
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              student.display_items.length >= 3 ? 'bg-rose-500' : 'bg-amber-500'
                            )}
                          />
                          {student.display_items.length} impayé{student.display_items.length > 1 ? 's' : ''}
                        </span>
                        {student.display_items.length < student.unpaid_items.length && (
                          <span className="text-[10px] text-gray-400">
                            sur {student.unpaid_items.length} au global
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <UnpaidItemsGrouped items={student.display_items} />
                      {student.display_items.length < student.unpaid_items.length && (
                        <span className="text-[11px] text-amber-600/90 font-medium mt-1.5 block">
                          + {student.unpaid_items.length - student.display_items.length} autre(s) retard(s) hors sélection
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right align-top pt-5">
                      <span className="font-bold text-rose-600 tabular-nums text-base">
                        {student.display_total.toLocaleString()}
                      </span>
                      <span className="text-rose-500 text-xs ml-1 font-medium">{currency}</span>
                      {student.display_total !== student.total_due && (
                        <span className="block text-[11px] text-gray-400 tabular-nums mt-0.5">
                          Dette totale : {student.total_due.toLocaleString()} {currency}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center align-top pt-5">
                      <a
                        href={`#/students/${student.student_id}?tab=finances`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        Encaisser <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'export modulaire standard */}
      <DataExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={exportTitle}
        defaultFilename={exportFilename}
        subtitle={`Export des retards de paiement (${filtered.length} élève(s) — ${totalUnpaid.toLocaleString()} ${currency})`}
        columns={exportColumns}
        presets={exportPresets}
        data={getExportData()}
        schoolYear={targetYear}
      />
    </div>
  )
}
