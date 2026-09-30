/**
 * cashjournal.repository.ts — Cash Journal Data Access Layer (Multi-Tenant)
 *
 * Provides CRUD operations, balance queries, cashier tracking,
 * and cash register closure (Billetage & Ticket Z — Avenant N°3).
 *
 * Departments: 'bus' | 'ecole' | 'eleve'
 * Types: 'income' (recette) | 'expense' (dépense)
 *
 * @module CashJournalRepository
 */

import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'
import { SettingsRepository } from './settings.repository'
import type {
  CashJournalEntry,
  CashJournalFilters,
  CashierOption,
  CashierDailySummary,
  CashClosure,
  CashClosureInput
} from '../../../shared/types'

function getTenantId(): string {
  try {
    const val = SettingsRepository.get('ecole_id') as string | undefined
    return val || process.env.VITE_DEFAULT_TENANT_ID || 'ecole_dev'
  } catch {
    return process.env.VITE_DEFAULT_TENANT_ID || 'ecole_dev'
  }
}

/**
 * Resolves all known spelling variants and aliases for a cashier name
 */
export function getCashierAliases(cashierIdentifier: string): string[] {
  if (!cashierIdentifier || cashierIdentifier === 'all') return []
  const rawTrimmed = cashierIdentifier.trim()
  const lower = rawTrimmed.toLowerCase()
  const aliases = new Set<string>([rawTrimmed])

  if (lower === 'admin' || lower === 'administrateur') {
    aliases.add('admin')
    aliases.add('Administrateur')
  }

  // Cross-reference canonical users table
  try {
    const tenantId = getTenantId()
    const user = db
      .prepare(
        `SELECT username, full_name FROM users 
         WHERE (ecole_id = ? OR ecole_id IS NULL)
           AND (LOWER(TRIM(username)) = LOWER(TRIM(?)) OR LOWER(TRIM(full_name)) = LOWER(TRIM(?)))`
      )
      .get(tenantId, rawTrimmed, rawTrimmed) as
      | { username?: string; full_name?: string }
      | undefined

    if (user) {
      if (user.username && user.username.trim()) aliases.add(user.username.trim())
      if (user.full_name && user.full_name.trim()) aliases.add(user.full_name.trim())
    }
  } catch {
    // ignore
  }

  return Array.from(aliases)
}

export class CashJournalRepository {
  static create(entry: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4()
    const tenantId = entry.ecole_id || getTenantId()
    try {
      db.prepare(
        `
        INSERT INTO cash_journal (
          id, ecole_id, transaction_date, type, department, category, subcategory,
          amount, description, payment_method,
          related_student_id, related_personnel_id, related_payment_id,
          receipt_number, print_count, last_printed_at, last_printed_by, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        tenantId,
        entry.transaction_date,
        entry.type,
        entry.department || 'ecole',
        entry.category,
        entry.subcategory || null,
        entry.amount,
        entry.description || null,
        entry.payment_method || 'cash',
        entry.related_student_id || null,
        entry.related_personnel_id || null,
        entry.related_payment_id || null,
        entry.receipt_number || null,
        entry.print_count || 0,
        entry.last_printed_at || null,
        entry.last_printed_by || null,
        entry.created_by || null
      )

      addToSyncQueue('cash_journal', id, 'create', {
        ...entry,
        id,
        ecole_id: tenantId
      })
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static list(filters: CashJournalFilters = {}) {
    const tenantId = getTenantId()
    let query = ''
    if (filters.schoolYear) {
      query = `
        SELECT cj.*, 
          COALESCE(cj.receipt_number, sp.receipt_number) as receipt_number,
          COALESCE(cj.print_count, sp.print_count, 0) as print_count,
          COALESCE(cj.last_printed_at, sp.last_printed_at) as last_printed_at,
          COALESCE(cj.last_printed_by, sp.last_printed_by) as last_printed_by,
          COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, '')) as created_by,
          s.first_name, s.last_name, 
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND (sf.ecole_id = ? OR sf.ecole_id IS NULL) AND sf.school_year = ? AND sf.class_name IS NOT NULL AND sf.class_name != ''),
            (SELECT 
               CASE 
                 WHEN school_year > ? THEN 'Pré-inscrit (' || class_name || ' en ' || school_year || ')'
                 ELSE 'Ancien (' || class_name || ' en ' || school_year || ')'
               END
             FROM student_fees sf
             WHERE sf.student_id = s.id AND (sf.ecole_id = ? OR sf.ecole_id IS NULL) AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY school_year DESC LIMIT 1),
            'Non inscrit'
          ) as student_class
        FROM cash_journal cj
        LEFT JOIN students s ON cj.related_student_id = s.id
        LEFT JOIN student_payments sp ON (
          (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
          OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
        )
        WHERE cj.deleted = 0 AND (cj.ecole_id = ? OR cj.ecole_id IS NULL)
      `
    } else {
      query = `
        SELECT cj.*, 
          COALESCE(cj.receipt_number, sp.receipt_number) as receipt_number,
          COALESCE(cj.print_count, sp.print_count, 0) as print_count,
          COALESCE(cj.last_printed_at, sp.last_printed_at) as last_printed_at,
          COALESCE(cj.last_printed_by, sp.last_printed_by) as last_printed_by,
          COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, '')) as created_by,
          s.first_name, s.last_name, 
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            NULLIF(s.class, 'Classe non spécifiée'),
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND (sf.ecole_id = ? OR sf.ecole_id IS NULL) AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY sf.school_year DESC LIMIT 1),
            'Non inscrit'
          ) as student_class
        FROM cash_journal cj
        LEFT JOIN students s ON cj.related_student_id = s.id
        LEFT JOIN student_payments sp ON (
          (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
          OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
        )
        WHERE cj.deleted = 0 AND (cj.ecole_id = ? OR cj.ecole_id IS NULL)
      `
    }

    const params: (string | number)[] = filters.schoolYear
      ? [tenantId, filters.schoolYear, filters.schoolYear, tenantId, tenantId]
      : [tenantId, tenantId]

    if (filters.startDate) {
      query += ' AND cj.transaction_date >= ?'
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      query += ' AND cj.transaction_date <= ?'
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      query += ' AND cj.type = ?'
      params.push(filters.type)
    }
    if (filters.department && filters.department !== 'all') {
      if (filters.department === 'eleve') {
        query += " AND (cj.department = 'eleve' OR cj.department = 'ecole')"
      } else {
        query += ' AND cj.department = ?'
        params.push(filters.department)
      }
    }
    if (filters.category && filters.category !== 'all') {
      const cats = filters.category
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c)
      if (cats.length > 0) {
        const allVariants: string[] = []
        for (const cat of cats) {
          allVariants.push(cat)
          const unaccented = cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          if (unaccented !== cat) allVariants.push(unaccented)
          if (cat.toLowerCase() === 'ecolage') allVariants.push('écolage')
          if (cat.toLowerCase() === 'reinscription') allVariants.push('réinscription')
          if (cat.toLowerCase() === 'evenement') allVariants.push('événement')
        }
        const placeholders = allVariants.map(() => '?').join(',')
        query += ` AND (cj.category IN (${placeholders}) OR cj.subcategory IN (${placeholders}))`
        params.push(...allVariants, ...allVariants)
      }
    }

    if (filters.createdBy && filters.createdBy !== 'all') {
      const aliases = getCashierAliases(filters.createdBy)
      if (aliases.length > 0) {
        query += ` AND TRIM(LOWER(COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, ''), 'admin'))) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
        params.push(...aliases)
      }
    }

    if (filters.stationCode && filters.stationCode !== 'all') {
      if (filters.stationCode.toUpperCase() === 'C1') {
        query +=
          " AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ? OR (COALESCE(cj.receipt_number, sp.receipt_number) LIKE 'REC-%' AND COALESCE(cj.receipt_number, sp.receipt_number) NOT LIKE 'REC-%-%-%'))"
        params.push(`%-C1-%`)
      } else {
        query += ' AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?)'
        params.push(`%-${filters.stationCode}-%`)
      }
    }

    if (filters.search) {
      query +=
        " AND (LOWER(cj.description) LIKE ? OR LOWER(cj.category) LIKE ? OR LOWER(s.first_name) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(COALESCE(cj.receipt_number, sp.receipt_number, '')) LIKE ?)"
      const s = `%${filters.search.toLowerCase()}%`
      params.push(s, s, s, s, s)
    }

    query += ' ORDER BY cj.transaction_date DESC, cj.created_at DESC'

    return db.prepare(query).all(...params)
  }

  static getById(id: string) {
    const tenantId = getTenantId()
    return db
      .prepare('SELECT * FROM cash_journal WHERE id = ? AND (ecole_id = ? OR ecole_id IS NULL) AND deleted = 0')
      .get(id, tenantId)
  }

  static update(id: string, updates: Partial<CashJournalEntry>) {
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (updates.transaction_date !== undefined) {
      fields.push('transaction_date = ?')
      values.push(updates.transaction_date)
    }
    if (updates.type !== undefined) {
      fields.push('type = ?')
      values.push(updates.type)
    }
    if (updates.department !== undefined) {
      fields.push('department = ?')
      values.push(updates.department)
    }
    if (updates.category !== undefined) {
      fields.push('category = ?')
      values.push(updates.category)
    }
    if (updates.subcategory !== undefined) {
      fields.push('subcategory = ?')
      values.push(updates.subcategory)
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?')
      values.push(updates.amount)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.payment_method !== undefined) {
      fields.push('payment_method = ?')
      values.push(updates.payment_method)
    }
    if (updates.receipt_number !== undefined) {
      fields.push('receipt_number = ?')
      values.push(updates.receipt_number)
    }

    if (fields.length === 0) return { success: false, error: 'Aucun champ à modifier' }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    fields.push("sync_status = 'pending'")
    values.push(id)

    try {
      const result = db
        .prepare(`UPDATE cash_journal SET ${fields.join(', ')} WHERE id = ? AND deleted = 0`)
        .run(...values)
      if (result.changes === 0) return { success: false, error: 'Entrée non trouvée' }
      addToSyncQueue('cash_journal', id, 'update', updates)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static delete(id: string) {
    try {
      const result = db
        .prepare(
          `
        UPDATE cash_journal SET deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted = 0
      `
        )
        .run(id)
      if (result.changes === 0) return { success: false, error: 'Entrée non trouvée' }
      addToSyncQueue('cash_journal', id, 'delete', { id })
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static getDailyBalance(date: string) {
    const tenantId = getTenantId()
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE transaction_date = ? AND (ecole_id = ? OR ecole_id IS NULL) AND deleted = 0
    `
      )
      .get(date, tenantId) as { total_income: number; total_expense: number; balance: number }

    return result
  }

  static getMonthlyBalance(year: number, month: number) {
    const tenantId = getTenantId()
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE transaction_date LIKE ? AND (ecole_id = ? OR ecole_id IS NULL) AND deleted = 0
    `
      )
      .get(`${monthStr}%`, tenantId) as { total_income: number; total_expense: number; balance: number }

    return result
  }

  static getBalanceSummary(startDate: string, endDate: string) {
    const tenantId = getTenantId()
    return db
      .prepare(
        `
      SELECT
        department,
        type,
        category,
        COUNT(*) as entry_count,
        SUM(amount) as total
      FROM cash_journal
      WHERE transaction_date >= ? AND transaction_date <= ? AND (ecole_id = ? OR ecole_id IS NULL) AND deleted = 0
      GROUP BY department, type, category
      ORDER BY department, type, total DESC
    `
      )
      .all(startDate, endDate, tenantId)
  }

  static getTotalBalance() {
    const tenantId = getTenantId()
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE (ecole_id = ? OR ecole_id IS NULL) AND deleted = 0
    `
      )
      .get(tenantId) as { total_income: number; total_expense: number; balance: number }

    return result
  }

  // --------------------------------------------
  // Avenant N°3 — Rapprochement & Z de Caisse (Multi-Tenant)
  // --------------------------------------------

  /**
   * Retrieves list of all distinct operators/cashiers from canonical active users for this tenant
   */
  static getDistinctCashiers(): CashierOption[] {
    try {
      const tenantId = getTenantId()
      const users = db
        .prepare(
          `SELECT username, full_name, role FROM users 
           WHERE active = 1 AND deleted = 0 AND (ecole_id = ? OR ecole_id IS NULL)
           ORDER BY 
            CASE role 
              WHEN 'admin' THEN 1 
              WHEN 'direction' THEN 2 
              WHEN 'accounting' THEN 3 
              WHEN 'secretariat' THEN 4 
              ELSE 5 
            END, username ASC`
        )
        .all(tenantId) as { username: string; full_name?: string; role?: string }[]

      return users.map((u) => {
        const cleanFull = u.full_name ? u.full_name.trim() : ''
        const cleanUser = u.username.trim()
        const displayName =
          cleanFull && cleanFull.toLowerCase() !== cleanUser.toLowerCase()
            ? `${cleanFull} (${cleanUser})`
            : cleanUser
        return {
          username: cleanUser,
          fullName: cleanFull,
          role: u.role || 'user',
          displayName
        }
      })
    } catch {
      return [
        {
          username: 'admin',
          fullName: 'Administrateur',
          role: 'admin',
          displayName: 'Administrateur (admin)'
        }
      ]
    }
  }

  /**
   * Calculates real-time cashier daily statistics & checks breakdown for reconciliation
   */
  static getCashierDailySummary(
    date: string,
    cashier?: string,
    stationCode?: string
  ): CashierDailySummary {
    const tenantId = getTenantId()
    let whereClause = "WHERE cj.deleted = 0 AND (cj.ecole_id = ? OR cj.ecole_id IS NULL) AND date(cj.transaction_date) = ? AND cj.type = 'income'"
    const params: (string | number)[] = [tenantId, date]

    if (cashier && cashier !== 'all') {
      const aliases = getCashierAliases(cashier)
      if (aliases.length > 0) {
        whereClause += ` AND TRIM(LOWER(COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, ''), 'admin'))) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
        params.push(...aliases)
      }
    }

    if (stationCode && stationCode !== 'all') {
      if (stationCode.toUpperCase() === 'C1') {
        whereClause += " AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ? OR (COALESCE(cj.receipt_number, sp.receipt_number) LIKE 'REC-%' AND COALESCE(cj.receipt_number, sp.receipt_number) NOT LIKE 'REC-%-%-%'))"
        params.push(`%-C1-%`)
      } else {
        whereClause += ' AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?)'
        params.push(`%-${stationCode}-%`)
      }
    }

    const rows = db
      .prepare(
        `
      SELECT 
        cj.*,
        COALESCE(cj.receipt_number, sp.receipt_number) as receipt_num,
        COALESCE(cj.payment_method, sp.payment_method, 'cash') as method,
        s.first_name,
        s.last_name
      FROM cash_journal cj
      LEFT JOIN students s ON cj.related_student_id = s.id
      LEFT JOIN student_payments sp ON (
        (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
        OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
      )
      ${whereClause}
      ORDER BY cj.created_at ASC
    `
      )
      .all(...params) as any[]

    let expectedCash = 0
    let expectedCheck = 0
    let expectedMobile = 0
    let expectedTransfer = 0
    let expectedTotal = 0
    const receiptNumbers: string[] = []
    const checks: Array<{
      amount: number
      description?: string
      student_name?: string
      receipt_number?: string
    }> = []

    for (const r of rows) {
      const amt = Number(r.amount) || 0
      expectedTotal += amt
      const m = (r.method || 'cash').toLowerCase()
      if (m === 'check' || m === 'cheque') {
        expectedCheck += amt
        checks.push({
          amount: amt,
          description: r.description,
          student_name: r.first_name ? `${r.last_name} ${r.first_name}` : undefined,
          receipt_number: r.receipt_num
        })
      } else if (
        m === 'mobile_money' ||
        m === 'mvola' ||
        m === 'orange_money' ||
        m === 'airtel_money'
      ) {
        expectedMobile += amt
      } else if (m === 'transfer' || m === 'virement') {
        expectedTransfer += amt
      } else {
        expectedCash += amt
      }

      if (r.receipt_num) {
        receiptNumbers.push(r.receipt_num)
      }
    }

    const totalTickets = rows.length
    const averageBasket = totalTickets > 0 ? Math.round(expectedTotal / totalTickets) : 0
    const sortedReceipts = [...receiptNumbers].sort()

    return {
      date,
      cashier: cashier || 'all',
      station_code: stationCode || 'C1',
      total_tickets: totalTickets,
      expected_cash: expectedCash,
      expected_check: expectedCheck,
      expected_mobile: expectedMobile,
      expected_transfer: expectedTransfer,
      expected_total: expectedTotal,
      average_basket: averageBasket,
      first_receipt: sortedReceipts.length > 0 ? sortedReceipts[0] : undefined,
      last_receipt:
        sortedReceipts.length > 0 ? sortedReceipts[sortedReceipts.length - 1] : undefined,
      checks
    }
  }

  /**
   * Persists a cash closure record with billetage and accounting lock (Multi-Tenant)
   */
  static createClosure(input: CashClosureInput): {
    success: boolean
    id?: string
    error?: string
  } {
    const id = uuidv4()
    const tenantId = input.ecole_id || getTenantId()
    try {
      const breakdownStr = JSON.stringify(input.counted_breakdown)
      const status = input.cash_difference === 0 ? 'closed' : 'discrepancy'

      db.prepare(
        `
        INSERT INTO cash_closures (
          id, ecole_id, closure_date, closure_datetime, cashier_username, station_code,
          total_tickets, expected_cash, expected_check, expected_mobile, expected_transfer, expected_total,
          counted_cash, counted_breakdown, cash_difference, status, notes, is_locked
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `
      ).run(
        id,
        tenantId,
        input.closure_date,
        input.cashier_username,
        input.station_code,
        input.total_tickets,
        input.expected_cash,
        input.expected_check,
        input.expected_mobile,
        input.expected_transfer,
        input.expected_total,
        input.counted_cash,
        breakdownStr,
        input.cash_difference,
        status,
        input.notes || null
      )

      addToSyncQueue('cash_closures', id, 'create', {
        id,
        ecole_id: tenantId,
        closure_date: input.closure_date,
        cashier_username: input.cashier_username,
        station_code: input.station_code,
        total_tickets: input.total_tickets,
        expected_cash: input.expected_cash,
        expected_check: input.expected_check,
        expected_mobile: input.expected_mobile,
        expected_transfer: input.expected_transfer,
        expected_total: input.expected_total,
        counted_cash: input.counted_cash,
        counted_breakdown: breakdownStr,
        cash_difference: input.cash_difference,
        status,
        notes: input.notes || null,
        is_locked: 1
      })

      return { success: true, id }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Retrieves closure record for a specific date and cashier
   */
  static getClosure(date: string, cashier?: string): CashClosure | null {
    try {
      const tenantId = getTenantId()
      let query = 'SELECT * FROM cash_closures WHERE (ecole_id = ? OR ecole_id IS NULL) AND closure_date = ?'
      const params: string[] = [tenantId, date]
      if (cashier && cashier !== 'all') {
        const aliases = getCashierAliases(cashier)
        if (aliases.length > 0) {
          query += ` AND TRIM(LOWER(cashier_username)) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
          params.push(...aliases)
        }
      }
      query += ' ORDER BY closure_datetime DESC LIMIT 1'
      const row = db.prepare(query).get(...params) as CashClosure | undefined
      return row || null
    } catch {
      return null
    }
  }

  /**
   * Lists past cash closures
   */
  static listClosures(schoolYear?: string): CashClosure[] {
    try {
      const tenantId = getTenantId()
      if (schoolYear) {
        const clean = schoolYear.replace(/['"]/g, '').trim()
        const [startYear, endYear] = clean.split('-')
        if (startYear && endYear) {
          return db
            .prepare(
              `SELECT * FROM cash_closures 
               WHERE (ecole_id = ? OR ecole_id IS NULL)
                 AND closure_date >= ? AND closure_date <= ? 
               ORDER BY closure_date DESC, closure_datetime DESC`
            )
            .all(tenantId, `${startYear}-08-01`, `${endYear}-07-31`) as CashClosure[]
        }
      }
      return db
        .prepare('SELECT * FROM cash_closures WHERE (ecole_id = ? OR ecole_id IS NULL) ORDER BY closure_date DESC, closure_datetime DESC')
        .all(tenantId) as CashClosure[]
    } catch {
      return []
    }
  }
}
