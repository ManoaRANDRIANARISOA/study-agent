import { create } from 'zustand'

export interface SchoolConfig {
  school_name: string
  school_address: string
  school_city: string
  school_phone: string
  school_email: string
  school_type: string
  school_logo: string
  school_year: string
  director_name: string
  director_title: string
  receipt_prefix: string
  primary_color: string
  module_cantine: boolean
  module_bus: boolean
  module_uniforms: boolean
  module_evaluations: boolean
  exonerate_personnel_children: boolean
  thermal_printer_enabled: boolean
  thermal_printer_name: string
  thermal_printer_size: '58mm' | '80mm'
}

interface AppState {
  currentYear: string
  schoolConfig: Partial<SchoolConfig>
  setCurrentYear: (year: string) => void
  fetchSettings: () => Promise<void>
}

const parseBool = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') return val.replace(/['"]/g, '') === 'true'
  return false
}

const cleanString = (val: unknown): string => {
  if (!val) return ''
  return String(val).replace(/['"]/g, '').trim()
}

function applyTheme(primaryHsl: string) {
  const root = document.documentElement
  const parts = primaryHsl.split(' ')
  if (parts.length < 3) return
  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1])
  const l = parseFloat(parts[2])

  root.style.setProperty('--primary', primaryHsl)
  root.style.setProperty('--primary-foreground', `${h} ${Math.min(s + 30, 100)}% 96%`)
  root.style.setProperty('--secondary', `${h} ${Math.min(s + 12, 100)}% ${Math.min(l + 12, 90)}%`)
  root.style.setProperty('--secondary-foreground', `${h} ${s}% 20%`)
  root.style.setProperty('--ring', primaryHsl)
  root.style.setProperty('--border', `${h} ${s}% 85%`)
  root.style.setProperty('--input', `${h} ${s}% 85%`)
}

export const useAppStore = create<AppState>((set) => ({
  currentYear: '',
  schoolConfig: {},
  setCurrentYear: (year: string) => set({ currentYear: year }),
  fetchSettings: async () => {
    try {
      const all = (await window.api.settings.getAll()) as Record<string, unknown>
      
      const year = cleanString(all.school_year)
      if (year) {
        set({ currentYear: year })
      }
      
      const config: Partial<SchoolConfig> = {
        school_name: cleanString(all.school_name),
        school_address: cleanString(all.school_address),
        school_city: cleanString(all.school_city),
        school_phone: cleanString(all.school_phone),
        school_email: cleanString(all.school_email),
        school_type: cleanString(all.school_type),
        school_logo: cleanString(all.school_logo),
        school_year: year,
        director_name: cleanString(all.director_name),
        director_title: cleanString(all.director_title),
        receipt_prefix: cleanString(all.receipt_prefix),
        primary_color: cleanString(all.primary_color),
        module_cantine: parseBool(all.module_cantine),
        module_bus: parseBool(all.module_bus),
        module_uniforms: parseBool(all.module_uniforms),
        module_evaluations: parseBool(all.module_evaluations),
        exonerate_personnel_children: parseBool(all.exonerate_personnel_children),
        thermal_printer_enabled: parseBool(all.thermal_printer_enabled)
      }
      
      set({ schoolConfig: config })
      
      const primaryColor = config.primary_color
      if (primaryColor && primaryColor !== '24 23% 57%') {
        applyTheme(primaryColor)
      }
    } catch (e) {
      console.error('Failed to load global settings', e)
    }
  }
}))
