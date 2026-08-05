import { useState, useEffect, useCallback, useMemo } from 'react'

export type ClassSections = Record<string, string[]>

const DEFAULT_SECTIONS: ClassSections = {
  Préscolaire: ['PS', 'MS', 'GS'],
  Primaire: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'],
  Collège: ['6ème', '5ème', '4ème', '3ème'],
  Lycée: ['2nde', '1ère', 'TA', 'TD'],
  Autres: []
}

export function useClasses() {
  const [sections, setSections] = useState<ClassSections>(DEFAULT_SECTIONS)
  const [loading, setLoading] = useState(true)

  // Derive flat classes array
  const classes = useMemo(() => {
    const flat: string[] = []
    Object.values(sections).forEach((arr) => flat.push(...arr))
    return flat
  }, [sections])

  const fetchClasses = useCallback(async () => {
    try {
      const stored = (await window.api.settings.get('class_sections')) as ClassSections | null
      if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
        setSections(stored)
      } else {
        // Fallback to legacy 'classes' if sections don't exist yet
        const legacy = (await window.api.settings.get('classes')) as string[] | null
        if (legacy && Array.isArray(legacy) && legacy.length > 0) {
          // Auto-migrate legacy to 'Autres' to not lose them, or group them
          const migrated: ClassSections = {
            ...DEFAULT_SECTIONS,
            Autres: legacy.filter((c) => {
              return !Object.values(DEFAULT_SECTIONS).flat().includes(c)
            })
          }
          setSections(migrated)
          await window.api.settings.set('class_sections', migrated)
        } else {
          setSections(DEFAULT_SECTIONS)
        }
      }
    } catch {
      setSections(DEFAULT_SECTIONS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  const saveSections = useCallback(async (newSections: ClassSections) => {
    await window.api.settings.set('class_sections', newSections)

    // Also save legacy flat list for any backend systems directly reading 'classes'
    const flat: string[] = []
    Object.values(newSections).forEach((arr) => flat.push(...arr))
    await window.api.settings.set('classes', flat)

    setSections(newSections)
  }, [])

  const addSection = useCallback(
    async (sectionName: string) => {
      const trimmed = sectionName.trim()
      if (!trimmed || sections[trimmed]) return false

      const newSections = { ...sections, [trimmed]: [] }
      await saveSections(newSections)
      return true
    },
    [sections, saveSections]
  )

  const renameSection = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName || sections[trimmed]) return false

      const newSections: ClassSections = {}
      Object.keys(sections).forEach((k) => {
        if (k === oldName) {
          newSections[trimmed] = sections[oldName]
        } else {
          newSections[k] = sections[k]
        }
      })

      await saveSections(newSections)
      return true
    },
    [sections, saveSections]
  )

  const deleteSection = useCallback(
    async (sectionName: string) => {
      if (!sections[sectionName]) return false

      const classesToMove = sections[sectionName] || []
      const newSections: ClassSections = {}

      Object.keys(sections).forEach((k) => {
        if (k !== sectionName) {
          newSections[k] = [...sections[k]]
        }
      })

      if (classesToMove.length > 0) {
        let targetKey = Object.keys(newSections)[0]
        if (!targetKey) {
          targetKey = 'Autres'
          newSections[targetKey] = []
        }
        newSections[targetKey] = [...newSections[targetKey], ...classesToMove]
      }

      await saveSections(newSections)
      return true
    },
    [sections, saveSections]
  )

  const addClass = useCallback(
    async (name: string, sectionKey: string = 'Autres') => {
      const trimmed = name.trim()
      if (!trimmed || classes.includes(trimmed)) return false

      const newSections = { ...sections }
      let targetKey = sectionKey
      if (!newSections[targetKey]) {
        const firstKey = Object.keys(newSections)[0]
        targetKey = firstKey || 'Autres'
        if (!newSections[targetKey]) newSections[targetKey] = []
      }
      newSections[targetKey] = [...newSections[targetKey], trimmed]

      await saveSections(newSections)
      return true
    },
    [classes, sections, saveSections]
  )

  const removeClass = useCallback(
    async (name: string) => {
      const newSections = { ...sections }
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].filter((c) => c !== name)
      })
      await saveSections(newSections)
    },
    [sections, saveSections]
  )

  const renameClass = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName || classes.includes(trimmed)) return false

      const newSections = { ...sections }
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].map((c) => (c === oldName ? trimmed : c))
      })
      await saveSections(newSections)
      return true
    },
    [classes, sections, saveSections]
  )

  // New method for Drag and Drop reorganization
  const moveClass = useCallback(
    async (className: string, targetSection: string, targetIndex?: number) => {
      const newSections = { ...sections }
      // Remove from all sections
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].filter((c) => c !== className)
      })

      // Add to target
      if (!newSections[targetSection]) newSections[targetSection] = []

      if (targetIndex !== undefined && targetIndex >= 0) {
        newSections[targetSection].splice(targetIndex, 0, className)
      } else {
        newSections[targetSection].push(className)
      }

      await saveSections(newSections)
    },
    [sections, saveSections]
  )

  return {
    classes,
    sections,
    loading,
    fetchClasses,
    saveSections,
    addSection,
    renameSection,
    deleteSection,
    addClass,
    removeClass,
    renameClass,
    moveClass
  }
}
