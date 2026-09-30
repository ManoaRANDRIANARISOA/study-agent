import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'
import { StudentRepository } from './student.repository'
import { SettingsRepository } from './settings.repository'

export interface Payment {
  id: string
  student_id: string
  payment_date: string
  amount: number
  payment_type: 'tuition' | 'bus' | 'canteen' | 'enrollment' | 'uniform' | 'event' | 'other'
  month?: string // "2025-09"
  description?: string
  payment_method?: 'cash' | 'check' | 'transfer' | 'mobile_money' | 'discount'
  receipt_number?: string
  school_year?: string
  print_count?: number
  last_printed_at?: string
  last_printed_by?: string
  created_by?: string
  ecole_id?: string
  created_at?: string
  updated_at?: string
}

export class PaymentRepository {
  static getSchoolCode(): string {
    try {
      const explicitCode = SettingsRepository.get('school_code') as string | null
      if (explicitCode && explicitCode.trim()) {
        return explicitCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
      }

      const schoolName = (SettingsRepository.get('school_name') as string | null) || ''
      if (schoolName.trim()) {
        const words = schoolName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0)

        if (words.length > 1) {
          const initials = words.map((w) => w[0].toUpperCase()).join('').slice(0, 6)
          if (initials.length >= 2) return initials
        } else if (words.length === 1 && words[0].length >= 2) {
          return words[0].slice(0, 4).toUpperCase()
        }
      }
    } catch {
      // Fallback
    }
    return 'SA'
  }

  static getStationCode(): string {
    try {
      const explicitStation =
        (SettingsRepository.get('pos_station_code') as string | null) ||
        (SettingsRepository.get('station_id') as string | null)
      if (explicitStation && explicitStation.trim()) {
        return explicitStation.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
      }
    } catch {
      // Fallback
    }
    return 'C1'
  }

  static generateReceiptNumber(schoolYear?: string, prefix: string = 'REC'): string {
    const tenantId =
      (SettingsRepository.get('ecole_id') as string) ||
      process.env.VITE_DEFAULT_TENANT_ID ||
      'ecole_dev'

    const cleanYear =
      (schoolYear || '')
        .replace(/['"]/g, '')
        .trim() ||
      (new Date().getMonth() >= 7
        ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
        : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`)

    const startYear = cleanYear.split('-')[0] || String(new Date().getFullYear())
    const schoolCode = this.getSchoolCode()
    const stationCode = this.getStationCode()
    const sequenceId = `${tenantId}_${stationCode}_${cleanYear}_${prefix}`

    let seqNumber = 1
    try {
      const row = db
        .prepare(
          `
        INSERT INTO receipt_sequences (id, ecole_id, school_year, prefix, last_sequence, updated_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET last_sequence = last_sequence + 1, updated_at = CURRENT_TIMESTAMP
        RETURNING last_sequence
      `
        )
        .get(sequenceId, tenantId, cleanYear, prefix) as { last_sequence: number } | undefined

      seqNumber = row?.last_sequence || 1
    } catch (e) {
      console.error('Error incrementing receipt sequence:', e)
      const countRow = db
        .prepare('SELECT count(*) as count FROM student_payments WHERE school_year = ?')
        .get(cleanYear) as { count: number } | undefined
      seqNumber = (countRow?.count || 0) + 1
    }

    const paddedSeq = String(seqNumber).padStart(5, '0')
    return `${prefix}-${schoolCode}-${stationCode}-${startYear}-${paddedSeq}`
  }

  static incrementPrintCount(paymentIdOrReceipt: string, userId?: string) {
    try {
      const payment = db
        .prepare(
          `
        SELECT * FROM student_payments 
        WHERE id = ? OR receipt_number = ?
      `
        )
        .get(paymentIdOrReceipt, paymentIdOrReceipt) as Payment | undefined

      if (payment) {
        const newCount = (payment.print_count || 0) + 1
        db.prepare(
          `
          UPDATE student_payments 
          SET print_count = ?, last_printed_at = CURRENT_TIMESTAMP, last_printed_by = ?
          WHERE id = ?
        `
        ).run(newCount, userId || 'Caisse', payment.id)

        return {
          success: true,
          print_count: newCount,
          receipt_number: payment.receipt_number,
          id: payment.id
        }
      }
      return { success: false, error: 'Paiement non trouvé' }
    } catch (e: any) {
      console.error('Error incrementing print count:', e)
      return { success: false, error: e.message }
    }
  }

  static backfillMissingReceiptNumbers() {
    try {
      const missing = db
        .prepare(
          `
        SELECT id, school_year, payment_date, created_at, student_id, payment_type
        FROM student_payments
        WHERE receipt_number IS NULL OR receipt_number = ''
        ORDER BY payment_date ASC, created_at ASC
      `
        )
        .all() as Array<{
        id: string
        school_year: string
        payment_date: string
        created_at: string
        student_id: string
        payment_type: string
      }>

      if (missing.length === 0) return

      const updatePaymentStmt = db.prepare(
        'UPDATE student_payments SET receipt_number = ? WHERE id = ?'
      )
      const updateJournalStmt = db.prepare(
        'UPDATE cash_journal SET receipt_number = ? WHERE related_student_id = ? AND transaction_date = ?'
      )

      const trans = db.transaction(() => {
        for (const item of missing) {
          const generated = this.generateReceiptNumber(item.school_year, 'REC')
          updatePaymentStmt.run(generated, item.id)
          try {
            updateJournalStmt.run(generated, item.student_id, item.payment_date)
          } catch {
            // non-fatal
          }
        }
      })
      trans()
      console.log(`[ReceiptNormalization] Normalisé ${missing.length} anciens reçus.`)
    } catch (e) {
      console.error('Error backfilling receipt numbers:', e)
    }
  }

  static create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4()
    const cleanYear = (payment.school_year || '').replace(/['"]/g, '').trim() || null

    // SAFEGUARD: Prevent accidental duplicate payment of an already fully paid tuition month
    if (payment.payment_type === 'tuition' && payment.month) {
      const existing = db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total_paid 
           FROM student_payments 
           WHERE student_id = ? 
             AND payment_type = 'tuition' 
             AND month = ? 
             AND (school_year = ? OR (? IS NULL AND school_year IS NULL))
             AND deleted = 0`
        )
        .get(payment.student_id, payment.month, cleanYear, cleanYear) as { total_paid: number } | undefined

      const totalPaid = Number(existing?.total_paid || 0)

      // Fetch student's tuition fee
      const feeRow = db
        .prepare(
          `SELECT monthly_tuition FROM student_fees WHERE student_id = ? AND (school_year = ? OR ? IS NULL) AND deleted = 0`
        )
        .get(payment.student_id, cleanYear, cleanYear) as { monthly_tuition: number | null } | undefined

      let expectedMonthlyFee = Number(feeRow?.monthly_tuition || 0)
      if (expectedMonthlyFee <= 0) {
        const studentRow = db
          .prepare(`SELECT class FROM students WHERE id = ?`)
          .get(payment.student_id) as { class: string } | undefined
        if (studentRow?.class) {
          try {
            const pricesSetting = db
              .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
              .get() as { value: string } | undefined
            if (pricesSetting?.value) {
              const prices = JSON.parse(pricesSetting.value)
              expectedMonthlyFee = Number(prices.tuition?.[studentRow.class] || 0)
            }
          } catch {}
        }
      }

      if (expectedMonthlyFee > 0 && totalPaid >= expectedMonthlyFee) {
        return {
          success: false,
          error: `Le mois d'écolage ${payment.month} est déjà intégralement réglé (${totalPaid.toLocaleString()} Ar / ${expectedMonthlyFee.toLocaleString()} Ar) pour cet élève.`
        }
      }
    }

    const receiptNumber =
      payment.receipt_number ||
      PaymentRepository.generateReceiptNumber(cleanYear || undefined, 'REC')

    const operatorName = payment.created_by || null
    const ecoleId =
      payment.ecole_id ||
      (SettingsRepository.get('ecole_id') as string) ||
      process.env.VITE_DEFAULT_TENANT_ID ||
      'ecole_dev'

    const stmt = db.prepare(`
      INSERT INTO student_payments (
        id, student_id, payment_date, amount, payment_type, month, 
        description, payment_method, receipt_number, school_year, print_count, created_by, ecole_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `)

    const transaction = db.transaction(() => {
      stmt.run(
        id,
        payment.student_id,
        payment.payment_date,
        payment.amount,
        payment.payment_type,
        payment.month || null,
        payment.description || null,
        payment.payment_method || 'cash',
        receiptNumber,
        cleanYear,
        operatorName,
        ecoleId
      )

      addToSyncQueue('student_payments', id, 'create', {
        ...payment,
        id,
        receipt_number: receiptNumber,
        school_year: cleanYear,
        created_by: operatorName,
        ecole_id: ecoleId
      })

      // SYNC: Create a corresponding cash_journal entry so the school's cash register
      // reflects all student payments. Same pattern as personnel:createSalaryExpense.
      if (payment.payment_method !== 'discount') {
        const cashCategories: Record<string, string> = {
          tuition: 'écolage',
          enrollment: 'inscription',
          reenrollment: 'réinscription',
          bus: 'transport',
          canteen: 'cantine',
          uniform: 'uniforme',
          event: 'événement',
          other: 'divers'
        }
        const cashCategory = cashCategories[payment.payment_type] || 'divers'
        const studentName = db
          .prepare('SELECT first_name, last_name FROM students WHERE id = ?')
          .get(payment.student_id) as { first_name: string; last_name: string } | undefined
        const cashDescription = studentName
          ? `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''}${
              (payment.payment_type === 'uniform' || payment.payment_type === 'other') && payment.description
                ? ` (${payment.description})`
                : ''
            } — ${studentName.last_name} ${studentName.first_name}`
          : `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''}${
              (payment.payment_type === 'uniform' || payment.payment_type === 'other') && payment.description
                ? ` (${payment.description})`
                : ''
            }`

        const cashDepartment = payment.payment_type === 'bus' ? 'bus' : 'eleve'

        const cashId = uuidv4()
        db.prepare(
          `
          INSERT INTO cash_journal (id, transaction_date, type, department, category, amount, description, payment_method, related_student_id, receipt_number, related_payment_id, created_by, ecole_id)
          VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          cashId,
          payment.payment_date,
          cashDepartment,
          cashCategory,
          payment.amount,
          cashDescription,
          payment.payment_method || 'cash',
          payment.student_id,
          receiptNumber,
          id,
          operatorName,
          ecoleId
        )
        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: payment.payment_date,
          type: 'income',
          department: cashDepartment,
          category: cashCategory,
          amount: payment.amount,
          description: cashDescription,
          payment_method: payment.payment_method || 'cash',
          related_student_id: payment.student_id,
          related_payment_id: id,
          created_by: operatorName,
          ecole_id: ecoleId
        })
      }

      // SYNC: When a bus or canteen payment is recorded, ensure the subscription flag
      // in student_fees is activated. This keeps the two sources of truth coherent.
      if (payment.payment_type === 'bus' || payment.payment_type === 'canteen') {
        const schoolYear = StudentRepository.getSetting('school_year') || '2025-2026'
        const targetYear = schoolYear.replace(/['"]/g, '').trim()

        // Find the fee record for current year
        const feeRecord = db
          .prepare(
            'SELECT id, bus_subscribed, canteen_subscribed FROM student_fees WHERE student_id = ? AND school_year = ?'
          )
          .get(payment.student_id, targetYear) as
          | { id: string; bus_subscribed: number; canteen_subscribed: number }
          | undefined

        if (feeRecord) {
          const updates: Record<string, unknown> = {}
          if (payment.payment_type === 'bus' && !feeRecord.bus_subscribed) {
            updates.bus_subscribed = 1
          }
          if (payment.payment_type === 'canteen' && !feeRecord.canteen_subscribed) {
            updates.canteen_subscribed = 1
          }

          if (Object.keys(updates).length > 0) {
            const fields = Object.keys(updates)
              .map((k) => `${k} = ?`)
              .join(', ')
            db.prepare(
              `UPDATE student_fees SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?`
            ).run(...Object.values(updates), feeRecord.id)

            addToSyncQueue('student_fees', feeRecord.id, 'update', {
              ...updates,
              student_id: payment.student_id
            })
          }
        }
      }

      // SYNC: When a uniform payment is recorded, mark the item as purchased
      if (payment.payment_type === 'uniform' && payment.description) {
        const schoolYear = StudentRepository.getSetting('school_year') || '2025-2026'
        const targetYear = schoolYear.replace(/['"]/g, '').trim()
        const itemName = (payment.description as string).split(' - ')[0].trim()

        if (itemName) {
          const feeRecord = db
            .prepare(
              `SELECT id, uniform_items_purchased FROM student_fees WHERE student_id = ? AND school_year = ?`
            )
            .get(payment.student_id, targetYear) as
            | { id: string; uniform_items_purchased: string | null }
            | undefined

          if (feeRecord) {
            let purchased: string[] = []
            try {
              if (feeRecord.uniform_items_purchased) {
                purchased = JSON.parse(feeRecord.uniform_items_purchased)
              }
            } catch (e) {}

            if (!purchased.includes(itemName)) {
              purchased.push(itemName)
              const newPurchasedStr = JSON.stringify(purchased)
              db.prepare(
                `UPDATE student_fees SET uniform_items_purchased = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?`
              ).run(newPurchasedStr, feeRecord.id)

              addToSyncQueue('student_fees', feeRecord.id, 'update', {
                uniform_items_purchased: newPurchasedStr,
                student_id: payment.student_id
              })
            }
          }
        }
      }
    })

    try {
      transaction()
      return { success: true, id, receipt_number: receiptNumber }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create payment error:', error)
      return { success: false, error: message }
    }
  }

  static getByStudent(studentId: string, schoolYear?: string) {
    if (schoolYear) {
      return db
        .prepare(
          `
        SELECT * FROM student_payments 
        WHERE student_id = ? AND school_year = ?
        ORDER BY payment_date DESC
      `
        )
        .all(studentId, schoolYear)
    }

    return db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? 
      ORDER BY payment_date DESC
    `
      )
      .all(studentId)
  }

  static getAll(
    filters: { startDate?: string; endDate?: string; type?: string; search?: string } = {}
  ) {
    let query = `
      SELECT sp.*, s.first_name, s.last_name, s.class as class_name 
      FROM student_payments sp 
      LEFT JOIN students s ON sp.student_id = s.id
    `
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters.startDate) {
      conditions.push('sp.payment_date >= ?')
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      conditions.push('sp.payment_date <= ?')
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      conditions.push('sp.payment_type = ?')
      params.push(filters.type)
    }
    if (filters.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`
      conditions.push(
        '(lower(s.first_name) LIKE ? OR lower(s.last_name) LIKE ? OR lower(sp.description) LIKE ? OR lower(sp.payment_type) LIKE ? OR sp.payment_date LIKE ? OR CAST(sp.amount AS TEXT) LIKE ?)'
      )
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm)
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY sp.payment_date DESC, sp.created_at DESC'

    return db.prepare(query).all(...params)
  }

  static getBySchoolYear(schoolYear: string) {
    const cleanYear = schoolYear.replace(/"/g, '').replace(/'/g, '').trim()
    return db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
      ORDER BY payment_date DESC
    `
      )
      .all(cleanYear) as Payment[]
  }

  static getTuitionStatus(studentId: string, schoolYear: string) {
    const cleanYear = schoolYear.replace(/['"]/g, '').trim()

    // 1. Get Fee Structure
    let feeRecord = db
      .prepare(
        `
      SELECT * FROM student_fees 
      WHERE student_id = ? AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
    `
      )
      .get(studentId, cleanYear) as Record<string, unknown> | undefined

    if (!feeRecord) {
      // Auto-provision if student has active class
      const studentObj = db
        .prepare(
          'SELECT ecole_id, class, is_personnel_child, departure_date FROM students WHERE id = ? AND deleted = 0'
        )
        .get(studentId) as
        | { ecole_id?: string; class?: string; is_personnel_child?: unknown; departure_date?: string | null }
        | undefined

      if (
        studentObj &&
        studentObj.class &&
        studentObj.class !== 'Non inscrit' &&
        studentObj.class !== 'Classe non spécifiée' &&
        !studentObj.departure_date
      ) {
        const rawPC = studentObj.is_personnel_child
        const isPC =
          rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
        const tuitionLevel = StudentRepository.determineTuitionLevel(studentObj.class)
        const monthlyTuition = StudentRepository.getTuitionPrice(studentObj.class, isPC)
        const newFeeId = uuidv4()

        try {
          db.prepare(
            `
            INSERT INTO student_fees (
              id, student_id, ecole_id, school_year, tuition_level, monthly_tuition, class_name,
              bus_subscribed, canteen_subscribed, fram_paid_by_parent, is_reenrollment,
              deleted, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'pending')
          `
          ).run(newFeeId, studentId, studentObj.ecole_id || null, cleanYear, tuitionLevel, monthlyTuition, studentObj.class)

          feeRecord = db
            .prepare('SELECT * FROM student_fees WHERE id = ?')
            .get(newFeeId) as Record<string, unknown> | undefined
        } catch (e) {
          console.error('Error auto-creating student fee record in getTuitionStatus:', e)
        }
      }

      if (!feeRecord) {
        return { success: false, error: 'No fee record found for this year' }
      }
    }

    const [startYearStr, endYearStr] = cleanYear.split('-')
    const startYear = parseInt(startYearStr) || 2026
    const endYear = parseInt(endYearStr) || 2027

    // 2. Get Tuition Payments
    const payments = db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? 
        AND payment_type = 'tuition'
        AND (
          REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
          OR month LIKE ?
          OR month LIKE ?
        )
    `
      )
      .all(studentId, cleanYear, `${startYear}-%`, `${endYear}-%`) as { month: string; amount: number }[]

    // Track whether student is personnel child & check establishment setting
    let isPersonnelChild = false
    const shouldExonerate = SettingsRepository.get('exonerate_personnel_children') !== false
    try {
      const studentObj = db
        .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
        .get(studentId) as { is_personnel_child: any } | undefined
      const rawPC = studentObj?.is_personnel_child
      const isPC = rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
      if (isPC && shouldExonerate) {
        isPersonnelChild = true
      }
    } catch {
      // Ignore
    }

    // Fetch global settings for dynamic pricing
    let globalMonthlyTuition: number | null = null
    try {
      if (feeRecord && feeRecord.tuition_level) {
        if (isPersonnelChild) {
          globalMonthlyTuition = 0
        } else {
          const config = StudentRepository.resolveTuitionConfig(feeRecord.tuition_level as string)
          if (config && config.price > 0) {
            globalMonthlyTuition = config.price
          }
        }
      }
    } catch (e) {
      console.error('Error fetching dynamic tuition prices:', e)
    }

    // 3. Calculate Status for each month
    // Terminale (TA/TD) goes until July, others stop in June
    const className = (feeRecord.class_name as string) || ''
    const isTerminale = className === 'TA' || className === 'TD' || className === 'Terminale'

    const months = [
      { name: 'Septembre', key: `${startYear}-09` },
      { name: 'Octobre', key: `${startYear}-10` },
      { name: 'Novembre', key: `${startYear}-11` },
      { name: 'Décembre', key: `${startYear}-12` },
      { name: 'Janvier', key: `${endYear}-01` },
      { name: 'Février', key: `${endYear}-02` },
      { name: 'Mars', key: `${endYear}-03` },
      { name: 'Avril', key: `${endYear}-04` },
      { name: 'Mai', key: `${endYear}-05` },
      { name: 'Juin', key: `${endYear}-06` },
      ...(isTerminale ? [{ name: 'Juillet', key: `${endYear}-07` }] : [])
    ]

    // Use global price if available, otherwise fallback to stored record
    const monthlyTuition =
      globalMonthlyTuition !== null
        ? globalMonthlyTuition
        : (feeRecord.monthly_tuition as number) || 0

    const status = months.map((m) => {
      const paidForMonth = payments
        .filter((p) => p.month === m.key)
        .reduce((sum, p) => sum + p.amount, 0)

      let status = 'unpaid'
      if (isPersonnelChild) {
        status = 'exempt'
      } else if (monthlyTuition > 0) {
        if (paidForMonth >= monthlyTuition) status = 'paid'
        else if (paidForMonth > 0) status = 'partial'
      } else {
        status = paidForMonth > 0 ? 'paid' : 'unassigned_class'
      }

      return {
        month: m.name,
        key: m.key,
        expected: isPersonnelChild ? 0 : monthlyTuition,
        paid: paidForMonth,
        status,
        balance: isPersonnelChild ? 0 : Math.max(0, monthlyTuition - paidForMonth)
      }
    })

    return {
      success: true,
      feeRecord,
      status
    }
  }

  static getUnpaidAlerts(schoolYear: string) {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const [startYearStr, endYearStr] = targetYear.split('-')
      const startYear = parseInt(startYearStr)
      const endYear = parseInt(endYearStr)

      const months = [
        `${startYear}-09`,
        `${startYear}-10`,
        `${startYear}-11`,
        `${startYear}-12`,
        `${endYear}-01`,
        `${endYear}-02`,
        `${endYear}-03`,
        `${endYear}-04`,
        `${endYear}-05`,
        `${endYear}-06`
      ]
      const terminaleMonths = [...months, `${endYear}-07`]

      // 1. Fetch Finance Config (prices)
      let prices: any = {}
      try {
        const settingsRecord = db
          .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
          .get() as { value: string } | undefined
        if (settingsRecord?.value) {
          prices = JSON.parse(settingsRecord.value)
        }
      } catch (e) {}

      const tenantId = (SettingsRepository.get('ecole_id') as string) || null

      // 2. Fetch Active Students & Fees with past_years_count
      const studentSql = `
        SELECT s.id, s.first_name, s.last_name, s.class, s.departure_date, s.is_personnel_child,
               sf.monthly_tuition, sf.tuition_level, sf.bus_subscribed, sf.bus_route, sf.bus_monthly_fee,
               sf.canteen_subscribed, sf.canteen_days_per_week, sf.canteen_days,
               sf.is_reenrollment, sf.enrollment_fee, sf.reenrollment_fee, sf.class_name,
               (SELECT COUNT(*) FROM student_fees sf_past 
                WHERE sf_past.student_id = s.id 
                  AND REPLACE(REPLACE(sf_past.school_year, '"', ''), '''', '') < ?
                  AND sf_past.deleted = 0
                  ${tenantId ? 'AND (sf_past.ecole_id = ? OR sf_past.ecole_id IS NULL)' : ''}
               ) as past_years_count
        FROM students s
        JOIN student_fees sf ON sf.student_id = s.id
        WHERE REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? 
          AND s.deleted = 0 
          AND sf.deleted = 0
          ${tenantId ? 'AND (s.ecole_id = ? OR s.ecole_id IS NULL) AND (sf.ecole_id = ? OR sf.ecole_id IS NULL)' : ''}
      `
      const studentParams: any[] = [targetYear]
      if (tenantId) studentParams.push(tenantId)
      studentParams.push(targetYear)
      if (tenantId) studentParams.push(tenantId, tenantId)

      const students = db.prepare(studentSql).all(...studentParams) as Array<any>

      if (students.length === 0) {
        return { success: true, alerts: [] }
      }

      // 3. Fetch Monthly Payments (tuition, bus, canteen)
      const paymentSql = `
        SELECT student_id, payment_type, month, SUM(amount) as total_paid
        FROM student_payments
        WHERE deleted = 0 
          AND payment_type IN ('tuition', 'bus', 'canteen')
          AND (
            REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
            OR (
              school_year IS NULL 
              AND (
                month LIKE ? OR month LIKE ?
                OR payment_date BETWEEN ? AND ?
              )
            )
          )
          ${tenantId ? 'AND (ecole_id = ? OR ecole_id IS NULL)' : ''}
        GROUP BY student_id, payment_type, month
      `
      const paymentParams: any[] = [
        targetYear,
        `${startYear}-%`,
        `${endYear}-%`,
        `${startYear}-06-01`,
        `${endYear}-08-31`
      ]
      if (tenantId) paymentParams.push(tenantId)

      const payments = db.prepare(paymentSql).all(...paymentParams) as Array<{
        student_id: string
        payment_type: string
        month: string
        total_paid: number
      }>

      const paymentMap = new Map<string, number>()
      payments.forEach((p) => {
        paymentMap.set(`${p.student_id}_${p.payment_type}_${p.month}`, p.total_paid)
      })

      // 4. Fetch Registration / Reenrollment Payments (droits)
      const droitSql = `
        SELECT student_id, payment_type, SUM(amount) as total_paid
        FROM student_payments
        WHERE deleted = 0 
          AND payment_type IN ('enrollment', 'reenrollment')
          AND (
            REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
            OR (
              school_year IS NULL 
              AND payment_date BETWEEN ? AND ?
            )
          )
          ${tenantId ? 'AND (ecole_id = ? OR ecole_id IS NULL)' : ''}
        GROUP BY student_id, payment_type
      `
      const droitParams: any[] = [targetYear, `${startYear}-06-01`, `${endYear}-08-31`]
      if (tenantId) droitParams.push(tenantId)

      const droitPayments = db.prepare(droitSql).all(...droitParams) as Array<{
        student_id: string
        payment_type: string
        total_paid: number
      }>

      const droitPaymentMap = new Map<string, { enrollment: number; reenrollment: number }>()
      droitPayments.forEach((p) => {
        const current = droitPaymentMap.get(p.student_id) || { enrollment: 0, reenrollment: 0 }
        if (p.payment_type === 'enrollment') {
          current.enrollment += p.total_paid
        } else if (p.payment_type === 'reenrollment') {
          current.reenrollment += p.total_paid
        }
        droitPaymentMap.set(p.student_id, current)
      })

      // 5. Fetch Unpaid Events (scoped to target school year)
      const eventSql = `
        SELECT ep.student_id, e.name as event_name, ep.amount_due, ep.amount_paid
        FROM event_payments ep
        JOIN parent_events e ON ep.event_id = e.id
        WHERE ep.paid = 0 AND e.deleted = 0
          AND (e.school_year = ? OR e.school_year IS NULL)
          ${tenantId ? 'AND (e.ecole_id = ? OR e.ecole_id IS NULL)' : ''}
      `
      const eventParams: any[] = [targetYear]
      if (tenantId) eventParams.push(tenantId)

      const unpaidEvents = db.prepare(eventSql).all(...eventParams) as Array<{
        student_id: string
        event_name: string
        amount_due: number
        amount_paid: number
      }>

      // 6. Aggregate Alerts
      const alerts: any[] = []
      const shouldExonerate = SettingsRepository.get('exonerate_personnel_children') !== false

      students.forEach((student) => {
        const resolvedClass = student.class_name || student.class || ''
        const isTerminale =
          resolvedClass === 'TA' ||
          resolvedClass === 'TD' ||
          resolvedClass.toLowerCase().includes('terminale')
        const relevantMonths = isTerminale ? terminaleMonths : months

        let totalDue = 0
        const unpaidItems: Array<{ type: string; label: string; amount: number; month?: string }> = []

        // Helper to check monthly subscriptions (threshold at 100 Ar to prevent fractional/1 Ar residue)
        const checkMonthlyService = (
          type: string,
          monthlyCost: number,
          labelPrefix: string
        ) => {
          if (monthlyCost <= 0) return
          relevantMonths.forEach((m) => {
            if (student.departure_date && student.departure_date < `${m}-01`) return

            const paidAmount = paymentMap.get(`${student.id}_${type}_${m}`) || 0
            const balance = monthlyCost - paidAmount
            if (balance >= 100) {
              unpaidItems.push({
                type,
                label: `${labelPrefix} (${m})`,
                amount: balance,
                month: m
              })
              totalDue += balance
            }
          })
        }

        // --- Droits d'inscription / réinscription ---
        const isDepartedBeforeSchoolYear =
          student.departure_date && student.departure_date < `${startYear}-09-01`
        if (!isDepartedBeforeSchoolYear) {
          const studentDroits = droitPaymentMap.get(student.id) || {
            enrollment: 0,
            reenrollment: 0
          }
          const hasReenPay = studentDroits.reenrollment > 0
          const hasEnrPay = studentDroits.enrollment > 0

          let isReturning = false
          if (hasReenPay) {
            isReturning = true
          } else if (hasEnrPay) {
            isReturning = false
          } else {
            isReturning =
              student.is_reenrollment === 1 ||
              student.is_reenrollment === true ||
              student.is_reenrollment === '1' ||
              Number(student.past_years_count) > 0
          }

          const defaultRegPrice = Number(prices.registration) || 140000
          const defaultReenPrice = Number(prices.reenrollment) || 115000
          const customFee = Number(isReturning ? student.reenrollment_fee : student.enrollment_fee) || 0
          const expectedDroit = customFee > 0 ? customFee : (isReturning ? defaultReenPrice : defaultRegPrice)

          const totalPaidDroit = studentDroits.enrollment + studentDroits.reenrollment
          const balanceDroit = expectedDroit - totalPaidDroit

          if (balanceDroit >= 100) {
            const droitType = isReturning ? 'reenrollment' : 'enrollment'
            const label = isReturning ? 'Réinscription' : "Frais d'inscription"
            unpaidItems.push({
              type: droitType,
              label,
              amount: balanceDroit
            })
            totalDue += balanceDroit
          }
        }

        // --- Tuition (Scolarité) ---
        const rawPC = student.is_personnel_child
        const isPC = rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
        const isExonerated = isPC && shouldExonerate

        if (!isExonerated) {
          const level = student.tuition_level || resolvedClass
          const configTuition = level ? Number(prices?.tuition?.[level]) : undefined
          let effectiveTuition = Number(student.monthly_tuition) || 0
          if (configTuition !== undefined && configTuition > 0) {
            if (effectiveTuition === 0 || Math.abs(effectiveTuition - configTuition) < 10) {
              effectiveTuition = configTuition
            }
          }
          checkMonthlyService('tuition', effectiveTuition, 'Écolage')
        }

        // --- Bus (Transport) ---
        if (student.bus_subscribed) {
          const customBusFee = Number(student.bus_monthly_fee) || 0
          const standardBusFee =
            student.bus_route && prices.bus && prices.bus[student.bus_route]
              ? Number(prices.bus[student.bus_route]) || 0
              : 0
          const busCost = customBusFee > 0 ? customBusFee : standardBusFee
          checkMonthlyService('bus', busCost, `Transport (${student.bus_route || 'Standard'})`)
        }

        // --- Canteen (Cantine) ---
        if (student.canteen_subscribed && prices.canteen) {
          let daysCount = 0
          try {
            const days =
              typeof student.canteen_days === 'string'
                ? JSON.parse(student.canteen_days)
                : student.canteen_days
            if (Array.isArray(days)) daysCount = days.length
          } catch (e) {}
          if (!daysCount && student.canteen_days_per_week) {
            daysCount = student.canteen_days_per_week
          }
          const effectiveDays = daysCount === 0 ? 5 : daysCount
          const monthlyPrice = Number(prices?.canteen?.monthly) || 0
          const dailyPrice = Number(prices?.canteen?.daily) || 0
          let canteenCost = 0
          if (monthlyPrice > 0 && effectiveDays >= 5) {
            canteenCost = monthlyPrice
          } else {
            canteenCost = dailyPrice * effectiveDays * 4
          }
          checkMonthlyService('canteen', canteenCost, 'Cantine')
        }

        // --- Events ---
        const studentEvents = unpaidEvents.filter((e) => e.student_id === student.id)
        studentEvents.forEach((e) => {
          const due = e.amount_due - e.amount_paid
          if (due >= 100) {
            totalDue += due
            unpaidItems.push({
              type: 'event',
              label: `Événement: ${e.event_name}`,
              amount: due
            })
          }
        })

        if (unpaidItems.length > 0) {
          alerts.push({
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            class_name: resolvedClass || '-',
            unpaid_items: unpaidItems,
            total_due: totalDue
          })
        }
      })

      return { success: true, alerts }
    } catch (error: unknown) {
      console.error('Error fetching unpaid alerts:', error)
      const message = error instanceof Error ? error.message : 'Erreur de base de données'
      return { success: false, error: message }
    }
  }

  static getExpectedRevenue(schoolYear: string): {
    success: boolean
    expected?: number
    error?: string
  } {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const result = db
        .prepare(
          `
        SELECT COALESCE(SUM(sf.monthly_tuition), 0) as expected
        FROM student_fees sf
        JOIN students s ON s.id = sf.student_id
        WHERE REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? AND s.deleted = 0 AND sf.deleted = 0
      `
        )
        .get(targetYear) as { expected: number } | undefined

      return { success: true, expected: result?.expected || 0 }
    } catch (error: unknown) {
      console.error('Error fetching expected revenue:', error)
      const message = error instanceof Error ? error.message : 'Erreur de base de données'
      return { success: false, error: message }
    }
  }

  static checkFramFratrie(studentId: string, schoolYear: string) {
    try {
      const cleanYear = schoolYear.replace(/['"]/g, '').trim()
      const student = db.prepare('SELECT siblings FROM students WHERE id = ?').get(studentId) as
        | { siblings: string | null }
        | undefined
      if (!student || !student.siblings) return { success: true, isPaid: false }

      let siblings: string[] = []
      try {
        siblings = JSON.parse(student.siblings)
      } catch (e) {}

      if (siblings.length === 0) return { success: true, isPaid: false }

      // Check if any sibling has a payment for 'fram'
      const placeholders = siblings.map(() => '?').join(',')

      // First check if any sibling has fram_paid_by_parent in student_fees
      const siblingsWithFramParent = db
        .prepare(
          `
        SELECT id FROM student_fees 
        WHERE student_id IN (${placeholders}) 
        AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = ? 
        AND fram_paid_by_parent = 1
      `
        )
        .all(...siblings, cleanYear)

      if (siblingsWithFramParent.length > 0) {
        return { success: true, isPaid: true, by: 'parent' }
      }

      // Next, check actual payments
      const [startYearStr, endYearStr] = cleanYear.split('-')
      const startYear = parseInt(startYearStr) || 2026
      const endYear = parseInt(endYearStr) || 2027

      const payments = db
        .prepare(
          `
        SELECT p.student_id, s.first_name, s.last_name
        FROM student_payments p
        JOIN students s ON p.student_id = s.id
        WHERE p.payment_type = 'fram' 
        AND p.student_id IN (${placeholders})
        AND (
          REPLACE(REPLACE(p.school_year, '"', ''), '''', '') = ?
          OR p.payment_date BETWEEN ? AND ?
        )
      `
        )
        .all(
          ...siblings,
          cleanYear,
          `${startYear}-06-01`,
          `${endYear}-08-31`
        ) as any[]

      if (payments.length > 0) {
        const siblingNames = payments.map((p) => `${p.first_name} ${p.last_name}`).join(', ')
        return { success: true, isPaid: true, by: siblingNames }
      }

      return { success: true, isPaid: false }
    } catch (err) {
      console.error('Error checking fram fratrie:', err)
      return { success: false, error: 'Error checking fratrie' }
    }
  }
}
