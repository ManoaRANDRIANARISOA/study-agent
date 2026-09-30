import DataExportModal, { ExportColumn } from '@/components/shared/DataExportModal'
import { useAppStore } from '@/store/useAppStore'

export interface StudentExportModalProps {
  isOpen: boolean
  onClose: () => void
  students: any[]
  currentClass?: string
  schoolYear?: string
}

export default function StudentExportModal({
  isOpen,
  onClose,
  students,
  currentClass,
  schoolYear
}: StudentExportModalProps) {
  const defaultYear = useAppStore((s) => s.currentYear)
  const currentSchoolYear = schoolYear || defaultYear
  const schoolConfig = useAppStore((s) => s.schoolConfig)

  const columns: ExportColumn[] = [
    { key: 'registration_number', label: 'Matricule', width: 14, defaultSelected: true },
    { key: 'last_name', label: 'Nom', width: 22, defaultSelected: true },
    { key: 'first_name', label: 'Prénom', width: 22, defaultSelected: true },
    { key: 'class', label: 'Classe', width: 12, defaultSelected: true },
    { key: 'gender', label: 'Genre (M/F)', width: 10, defaultSelected: true },
    { key: 'date_of_birth', label: 'Date de Naissance', width: 16, defaultSelected: true },
    { key: 'place_of_birth', label: 'Lieu de Naissance', width: 18, defaultSelected: false },
    { key: 'student_status', label: 'Statut (Nouveau/Ancien)', width: 14, defaultSelected: true },
    { key: 'parent_name', label: 'Parent / Tuteur', width: 24, defaultSelected: true },
    { key: 'parent_phone', label: 'Téléphone', width: 16, defaultSelected: true },
    { key: 'parent_email', label: 'Email', width: 22, defaultSelected: false },
    { key: 'address', label: 'Adresse', width: 28, defaultSelected: false },
    { key: 'enrollment_date', label: "Date d'inscription", width: 16, defaultSelected: false },
    { key: 'bus_subscribed', label: 'Transport Bus', width: 12, defaultSelected: false },
    { key: 'canteen_subscribed', label: 'Cantine', width: 12, defaultSelected: false }
  ]

  const classLabel = currentClass ? `_classe_${currentClass.replace(/\s+/g, '_')}` : ''
  const filename = `eleves_${(currentSchoolYear || 'annee').replace(/[^a-zA-Z0-9]/g, '_')}${classLabel}`

  const title = currentClass
    ? `Export des élèves — Classe ${currentClass}`
    : 'Exportation de la liste des élèves'

  const subtitle = `${schoolConfig?.school_name || 'Établissement'} • Année scolaire ${currentSchoolYear}`

  return (
    <DataExportModal
      isOpen={isOpen}
      onClose={onClose}
      data={students as Record<string, unknown>[]}
      columns={columns}
      defaultFilename={filename}
      title={title}
      subtitle={subtitle}
    />
  )
}
