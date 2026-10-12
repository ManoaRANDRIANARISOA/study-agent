import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  DollarSign,
  Wallet,
  Bus,
  Utensils,
  Shirt,
  PartyPopper,
  GraduationCap,
  FileText,
  MoreHorizontal,
  Calendar,
  Users,
  Printer,
  CheckSquare,
  Square,
  Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useFinanceStore } from '@/store/useFinanceStore'
import { usePermissions } from '@/lib/usePermissions'
import { useAppStore } from '@/store/useAppStore'
import type { Payment, FeeRecord, FinancePrices } from '@shared/types'

interface EventWithPayment {
  id: string
  event_name: string
  event_date: string
  amount_per_parent: number
  family_payment_status?: {
    is_paid: boolean
    total_paid: number
  }
}

interface MonthStatus {
  key: string
  month: string
  status: string
  paid: number
  balance: number
  cost: number
  expected?: number
}

interface TuitionStatusResult {
  success: boolean
  feeRecord?: FeeRecord
  status?: MonthStatus[]
}

interface ServiceCard {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  enabled: boolean
  status: string
  isOneTime: boolean
  balance?: number
}

const getTuitionCost = (
  record: FeeRecord | undefined | null,
  prices: FinancePrices | null,
  isPersonnelChild: boolean = false
) => {
  if (isPersonnelChild) return 0
  if (!record) return 0
  if (record.tuition_level && prices?.tuition?.[record.tuition_level]) {
    return prices.tuition[record.tuition_level]
  }
  return record.monthly_tuition || 0
}

const getBusCost = (record: FeeRecord | undefined | null, prices: FinancePrices | null) => {
  if (!record?.bus_subscribed || !record?.bus_route) return 0
  return prices?.bus?.[record.bus_route] || 0
}

const getCanteenCost = (record: FeeRecord | undefined | null, prices: FinancePrices | null) => {
  if (!record?.canteen_subscribed) return 0

  let daysCount = record.canteen_days_per_week || 0
  if (Array.isArray(record.canteen_days) && record.canteen_days.length > 0) {
    daysCount = record.canteen_days.length
  } else if (typeof record.canteen_days === 'string') {
    try {
      const parsed = JSON.parse(record.canteen_days)
      if (Array.isArray(parsed) && parsed.length > 0) daysCount = parsed.length
    } catch {
      // Ignore parse error
    }
  }

  const effectiveDays = daysCount === 0 ? 5 : daysCount
  const monthlyPrice = Number(prices?.canteen?.monthly) || 0
  const dailyPrice = Number(prices?.canteen?.daily) || 0

  if (monthlyPrice > 0 && effectiveDays >= 5) return monthlyPrice
  return dailyPrice * effectiveDays * 4
}

interface FinanceTabProps {
  studentId: string
  schoolYear: string
  feeRecord?: FeeRecord
  events?: EventWithPayment[]
}

export function FinanceTab({ studentId, schoolYear, feeRecord, events = [] }: FinanceTabProps) {
  const [status, setStatus] = useState<TuitionStatusResult | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false)
  const { prices: configPrices, fetchPrices } = useFinanceStore()
  const { canWrite } = usePermissions()
  const { schoolConfig } = useAppStore()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isViewPaymentOpen, setIsViewPaymentOpen] = useState(false)
  const [studentInfo, setStudentInfo] = useState<any>(null)
  const [framFratrieStatus, setFramFratrieStatus] = useState<{ isPaid: boolean; by?: string }>({
    isPaid: false
  })

  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set())
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(() => {
    return localStorage.getItem('auto_print_thermal') !== 'false'
  })
  const [printing, setPrinting] = useState<boolean>(false)

  const getPaymentLabel = (p: Payment) => {
    switch (p.payment_type) {
      case 'tuition':
        return `Écolage ${p.month || ''}`.trim()
      case 'enrollment':
        return "Droits d'inscription"
      case 'reenrollment':
        return 'Droits de réinscription'
      case 'fram':
        return 'Cotisation FRAM'
      case 'bus':
        return `Transport ${p.month || ''}`.trim()
      case 'canteen':
        return `Cantine ${p.month || ''}`.trim()
      case 'uniform':
        return p.description || 'Uniforme'
      case 'event':
        return p.description || 'Événement'
      default:
        return p.description || p.payment_type
    }
  }

  const handlePrintReceipt = async (payment: Payment) => {
    setPrinting(true)
    try {
      const studentName = `${studentInfo?.last_name || ''} ${studentInfo?.first_name || ''}`.trim()
      const itemLabel = getPaymentLabel(payment)
      const res = await window.api.printer.printReceipt({
        student_name: studentName,
        registration_number: studentInfo?.registration_number,
        student_number: studentInfo?.registration_number,
        class_name: studentInfo?.class || '',
        school_year: schoolYear,
        payment_date: payment.payment_date,
        receipt_number: payment.receipt_number || payment.id?.slice(0, 8),
        payment_id: payment.id,
        payment_method: payment.payment_method,
        items: [
          {
            label: itemLabel,
            amount: Number(payment.amount),
            period: payment.month
          }
        ],
        total_amount: Number(payment.amount)
      })

      if (res.success) {
        // Refresh payments to update print_count badge
        loadData()
      } else {
        alert("Erreur d'impression : " + (res.error || "Vérifiez la connexion de l'imprimante"))
      }
    } catch (err: unknown) {
      alert("Erreur d'impression : " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPrinting(false)
    }
  }

  const handlePrintGroupedReceipt = async () => {
    const selectedList = payments.filter((p) => selectedPaymentIds.has(p.id))
    if (selectedList.length === 0) return

    setPrinting(true)
    try {
      const studentName = `${studentInfo?.last_name || ''} ${studentInfo?.first_name || ''}`.trim()
      const items = selectedList.map((p) => ({
        label: `${getPaymentLabel(p)}${p.receipt_number ? ` (Réf: ${p.receipt_number})` : ''}`,
        amount: Number(p.amount),
        period: p.month
      }))
      const total = items.reduce((sum, item) => sum + item.amount, 0)
      const newestDate = selectedList[0].payment_date

      const res = await window.api.printer.printReceipt({
        student_name: studentName,
        registration_number: studentInfo?.registration_number,
        student_number: studentInfo?.registration_number,
        class_name: studentInfo?.class || '',
        school_year: schoolYear,
        payment_date: newestDate,
        receipt_number: `REC-GRP-${schoolYear.split('-')[0]}-${Date.now().toString().slice(-5)}`,
        payment_ids: selectedList.map((p) => p.id),
        payment_method: selectedList[0].payment_method,
        items,
        total_amount: total
      })

      if (res.success) {
        setSelectedPaymentIds(new Set())
        loadData()
      } else {
        alert("Erreur d'impression du reçu groupé : " + (res.error || "Vérifiez l'imprimante"))
      }
    } catch (err: unknown) {
      alert("Erreur d'impression : " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPrinting(false)
    }
  }

  const toggleSelectPayment = (id: string) => {
    setSelectedPaymentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPayments = () => {
    if (selectedPaymentIds.size === payments.length) {
      setSelectedPaymentIds(new Set())
    } else {
      setSelectedPaymentIds(new Set(payments.map((p) => p.id)))
    }
  }

  // Listen for custom event from StudentDetail to open the payment modal (e.g. from Dossier tab)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setFormData((prev) => ({ ...prev, payment_type: e.detail, month: '' }))
      setExpectedAmountOverride('')
      setIsAddPaymentOpen(true)
    }
    window.addEventListener('open-payment-modal', handler as EventListener)
    return () => window.removeEventListener('open-payment-modal', handler as EventListener)
  }, [])

  const [formData, setFormData] = useState({
    amount: '',
    payment_type: 'tuition',
    month: '',
    description: '',
    payment_method: 'cash',
    item: ''
  })
  const [expectedAmountOverride, setExpectedAmountOverride] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const statusRes = await window.api.payment.getTuitionStatus(studentId, schoolYear)
      const paymentsRes = await window.api.payment.getByStudent(studentId, schoolYear)
      fetchPrices()

      const studentRes = await window.api.student.get(studentId)
      if (studentRes.success) setStudentInfo(studentRes.student)

      const framRes = await window.api.payment.checkFramFratrie(studentId, schoolYear)
      if (framRes.success) setFramFratrieStatus({ isPaid: framRes.isPaid, by: framRes.by })

      if (statusRes.success) {
        setStatus(statusRes)
      }
      setPayments(paymentsRes || [])
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load finance data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [studentId, schoolYear])

  // Set suggested amounts based on selection
  useEffect(() => {
    if (!configPrices) return

    let suggestedAmount = ''
    const currentRecord = status?.feeRecord || feeRecord

    if (formData.payment_type === 'tuition') {
      const cost = getTuitionCost(
        currentRecord,
        configPrices,
        Boolean(studentInfo?.is_personnel_child)
      )
      if (cost > 0) suggestedAmount = cost.toString()
    } else if (formData.payment_type === 'canteen') {
      const cost = getCanteenCost(currentRecord, configPrices)
      if (cost > 0) {
        suggestedAmount = cost.toString()
      } else if (configPrices.canteen?.monthly) {
        suggestedAmount = configPrices.canteen.monthly.toString()
      }
    } else if (formData.payment_type === 'bus') {
      const cost = getBusCost(currentRecord, configPrices)
      if (cost > 0) suggestedAmount = cost.toString()
    } else if (formData.payment_type === 'enrollment') {
      if (configPrices.registration) suggestedAmount = configPrices.registration.toString()
    } else if (formData.payment_type === 'reenrollment') {
      if (configPrices.reenrollment) suggestedAmount = configPrices.reenrollment.toString()
    } else if (formData.payment_type === 'fram') {
      if (configPrices.fram) suggestedAmount = configPrices.fram.toString()
    } else if (formData.payment_type === 'uniform') {
      const items = Object.keys(configPrices.uniforms || {})
      if (items.length > 0) {
        let targetItem = formData.item
        if (!targetItem) {
          targetItem = items.includes('Tablier') ? 'Tablier' : items[0]
          setFormData((prev) => ({ ...prev, item: targetItem }))
          return
        }
        if (targetItem && configPrices.uniforms?.[targetItem]) {
          suggestedAmount = configPrices.uniforms[targetItem].toString()
        }
      }
    } else if (formData.payment_type === 'event') {
      if (formData.item) {
        const evt = events.find((e) => e.id === formData.item)
        if (evt && evt.amount_per_parent) {
          suggestedAmount = evt.amount_per_parent.toString()
        }
      }
    }

    if (suggestedAmount) {
      setFormData((prev) => ({ ...prev, amount: suggestedAmount }))
    }
  }, [formData.payment_type, formData.item, configPrices, status, feeRecord])

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const amount = parseFloat(formData.amount) || 0
      let discount = 0

      // Validation: Check if amount exceeds balance for monthly payments
      if (['tuition', 'canteen', 'bus'].includes(formData.payment_type) && formData.month) {
        let monthlyCost = 0
        const currentFeeRecord = status?.feeRecord || feeRecord

        if (formData.payment_type === 'tuition') {
          monthlyCost = getTuitionCost(
            currentFeeRecord,
            configPrices,
            Boolean(studentInfo?.is_personnel_child)
          )
        } else if (formData.payment_type === 'bus') {
          monthlyCost = getBusCost(currentFeeRecord, configPrices)
        } else if (formData.payment_type === 'canteen') {
          monthlyCost = getCanteenCost(currentFeeRecord, configPrices)
        }

        if (monthlyCost > 0) {
          const existingPayments = payments.filter(
            (p) => p.payment_type === formData.payment_type && p.month === formData.month
          )
          const paidAmount = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
          const actualBalance = monthlyCost - paidAmount

          const expectedOverride = parseFloat(expectedAmountOverride)
          if (
            !isNaN(expectedOverride) &&
            expectedOverride < actualBalance &&
            expectedOverride >= 0
          ) {
            discount = actualBalance - expectedOverride
          }

          const targetBalance = actualBalance - discount

          if (amount > targetBalance) {
            alert(
              `Le montant encaissé (${amount.toLocaleString()} Ar) dépasse le reste à payer convenu (${targetBalance.toLocaleString()} Ar) pour ce mois.`
            )
            return
          }
        }
      }

      let result: any
      const paymentDate = new Date().toISOString().split('T')[0]
      const paymentData = {
        student_id: studentId,
        payment_date: paymentDate,
        amount: amount,
        payment_type: formData.payment_type as Payment['payment_type'],
        month: ['tuition', 'canteen', 'bus'].includes(formData.payment_type)
          ? formData.month
          : undefined,
        description:
          formData.payment_type === 'uniform'
            ? `${formData.item}${formData.description ? ' - ' + formData.description : ''}`
            : formData.description,
        payment_method: formData.payment_method as Payment['payment_method'],
        school_year: schoolYear
      }

      if (formData.payment_type === 'event' && formData.item) {
        result = await window.api.event.recordPayment(
          formData.item,
          studentId,
          amount,
          formData.payment_method
        )
      } else {
        result = await window.api.payment.create(paymentData)

        // Handle discount if provided
        if (result.success && discount > 0) {
          const discountData = {
            ...paymentData,
            amount: discount,
            payment_method: 'discount' as any,
            description: `Remise exceptionnelle${formData.description ? ' : ' + formData.description : ''}`
          }
          await window.api.payment.create(discountData)
        }
      }

      if (result.success) {
        // Auto-print receipt if enabled
        if (autoPrintReceipt) {
          handlePrintReceipt({
            ...paymentData,
            id: result.id || `PAY-${Date.now().toString().slice(-6)}`,
            receipt_number: (result as any).receipt_number
          } as Payment)
        }

        setIsAddPaymentOpen(false)
        setFormData({
          amount: '',
          payment_type: 'tuition',
          month: '',
          description: '',
          payment_method: 'cash',
          item: ''
        })
        setExpectedAmountOverride('')
        loadData()
      } else {
        alert('Erreur lors du paiement: ' + result.error)
      }
    } catch (error: unknown) {
      alert('Erreur: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const getPaymentDetails = (type: string) => {
    return payments.find((p) => p.payment_type === type)
  }

  const totalPaid = payments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
  const busFeeRecord = status?.feeRecord || feeRecord

  // Determine if student is new or returning
  const hasReenrollmentPayment = payments.some((p) => p.payment_type === 'reenrollment')
  const hasEnrollmentPayment = payments.some((p) => p.payment_type === 'enrollment')

  let isReturning = false
  if (hasReenrollmentPayment) {
    isReturning = true
  } else if (hasEnrollmentPayment) {
    isReturning = false
  } else {
    isReturning =
      studentInfo?.student_status === 'Ancien' ||
      busFeeRecord?.is_reenrollment === 1 ||
      busFeeRecord?.is_reenrollment === true
  }

  const enrollmentType = isReturning ? 'reenrollment' : 'enrollment'
  const enrollmentLabel = isReturning ? 'Réinscription' : "Frais d'inscription"

  const enrollmentExpected = isReturning ? configPrices?.reenrollment : configPrices?.registration
  const enrollmentPaidAmt = payments
    .filter((p) => p.payment_type === 'enrollment' || p.payment_type === 'reenrollment')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const enrollmentBalance = (enrollmentExpected || 0) - enrollmentPaidAmt

  const getEnrollmentStatus = () => {
    if (enrollmentPaidAmt >= (enrollmentExpected || 0) && enrollmentPaidAmt > 0) return 'paid'
    if (enrollmentPaidAmt > 0) return 'partial'
    return 'pending'
  }

  const framExpected = configPrices?.fram || 0
  const framPaidAmt = payments
    .filter((p) => p.payment_type === 'fram')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const framBalance =
    framFratrieStatus.isPaid || busFeeRecord?.fram_paid_by_parent ? 0 : framExpected - framPaidAmt

  const getFramStatus = () => {
    if (framFratrieStatus.isPaid) return 'paid_fratrie'
    if (busFeeRecord?.fram_paid_by_parent || (framPaidAmt >= framExpected && framPaidAmt > 0))
      return 'paid'
    if (framPaidAmt > 0) return 'partial'
    return 'pending'
  }

  // Service Cards Configuration
  const allServices: ServiceCard[] = [
    {
      id: enrollmentType,
      label: enrollmentLabel,
      icon: FileText,
      color: isReturning ? 'text-indigo-600' : 'text-purple-600',
      bg: isReturning ? 'bg-indigo-50' : 'bg-purple-50',
      enabled: true,
      status: getEnrollmentStatus(),
      balance: Math.max(0, enrollmentBalance),
      isOneTime: true
    },
    {
      id: 'fram',
      label: 'Cotisation FRAM',
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      enabled: true,
      status: getFramStatus(),
      balance: Math.max(0, framBalance),
      isOneTime: true
    },
    {
      id: 'bus',
      label: 'Transport',
      icon: Bus,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      enabled: busFeeRecord?.bus_subscribed || false,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'canteen',
      label: 'Cantine',
      icon: Utensils,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      enabled: busFeeRecord?.canteen_subscribed || false,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'uniform',
      label: 'Uniforme',
      icon: Shirt,
      color: 'text-pink-600',
      bg: 'bg-pink-50',
      enabled: Object.keys(configPrices?.uniforms || {}).length > 0,
      status: payments.some((p) => p.payment_type === 'uniform') ? 'paid' : 'any',
      isOneTime: false
    },
    {
      id: 'event',
      label: 'Événement',
      icon: PartyPopper,
      color: 'text-red-600',
      bg: 'bg-red-50',
      enabled: true,
      status: 'any',
      isOneTime: false
    },
    {
      id: 'other',
      label: 'Autre',
      icon: MoreHorizontal,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      enabled: true,
      status: 'any',
      isOneTime: false
    }
  ]

  const services = allServices.filter((s) => {
    if (s.id === 'bus' && schoolConfig.module_bus === false) return false
    if (s.id === 'canteen' && schoolConfig.module_cantine === false) return false
    if (s.id === 'uniform' && schoolConfig.module_uniforms === false) return false
    return true
  })

  const handleCardClick = (service: ServiceCard) => {
    if (!service.enabled) return

    if (!status?.feeRecord && service.id !== 'other') {
      alert(
        "Cet élève n'est pas encore inscrit dans une classe pour l'année " +
          schoolYear +
          ". Veuillez d'abord l'inscrire via le bouton 'Inscrire' en haut à droite."
      )
      return
    }

    if (service.isOneTime && (service.status === 'paid' || service.status === 'paid_fratrie')) {
      const payment = getPaymentDetails(service.id)
      if (payment) {
        setSelectedPayment(payment)
        setIsViewPaymentOpen(true)
      } else if (service.status === 'paid_fratrie') {
        alert('Cette cotisation a déjà été couverte par un membre de la fratrie.')
      } else {
        alert("Le paiement a été enregistré avec l'inscription.")
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        payment_type: service.id,
        amount: service.balance && service.balance > 0 ? service.balance.toString() : '',
        month: '',
        description: '',
        item: ''
      }))
      setIsAddPaymentOpen(true)
    }
  }

  const handleMonthClick = (type: string, monthData: MonthStatus) => {
    if (!status?.feeRecord) {
      alert(
        "Cet élève n'est pas encore inscrit dans une classe pour l'année " +
          schoolYear +
          ". Veuillez d'abord l'inscrire via le bouton 'Inscrire' en haut à droite."
      )
      return
    }

    if (monthData.status === 'paid') {
      const payment = payments.find((p) => p.payment_type === type && p.month === monthData.key)
      if (payment) {
        setSelectedPayment(payment)
        setIsViewPaymentOpen(true)
      }
    } else if (canWrite('payments')) {
      setFormData((prev) => ({
        ...prev,
        payment_type: type,
        month: monthData.key,
        amount:
          monthData.balance > 0
            ? monthData.balance.toString()
            : (monthData.cost || monthData.expected || 0).toString(),
        description: '',
        item: ''
      }))
      setIsAddPaymentOpen(true)
    }
  }

  const getServiceMonthlyStatus = (type: 'bus' | 'canteen', monthlyCost: number) => {
    if (!status?.status || !monthlyCost) return []

    return status.status.map((month: MonthStatus) => {
      const monthPayments = payments.filter(
        (p) => p.payment_type === type && p.month === month.key
      )
      const paidAmount = monthPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      const balance = monthlyCost - paidAmount

      let statusStr = 'unpaid'
      if (paidAmount >= monthlyCost) statusStr = 'paid'
      else if (paidAmount > 0) statusStr = 'partial'

      return {
        ...month,
        status: statusStr,
        paid: paidAmount,
        balance: balance > 0 ? balance : 0,
        cost: monthlyCost
      }
    })
  }

  const busCost = getBusCost(status?.feeRecord, configPrices)
  const canteenCost = getCanteenCost(feeRecord || status?.feeRecord, configPrices)

  const busStatus = getServiceMonthlyStatus('bus', busCost)
  const canteenStatus = getServiceMonthlyStatus('canteen', canteenCost)

  const getMonthsForPaymentType = () => {
    if (formData.payment_type === 'bus') return busStatus
    if (formData.payment_type === 'canteen') return canteenStatus
    return status?.status || []
  }

  const renderMonthGrid = (title: string, type: string, data: MonthStatus[]) => {
    if (!data || data.length === 0) return null
    return (
      <div className="bg-card p-6 rounded-xl shadow-sm border border-border mt-6">
        <h3 className="text-base font-semibold mb-4 flex items-center text-foreground">
          {type === 'tuition' && <GraduationCap className="w-5 h-5 mr-2 text-primary" />}
          {type === 'bus' && <Bus className="w-5 h-5 mr-2 text-amber-500" />}
          {type === 'canteen' && <Utensils className="w-5 h-5 mr-2 text-orange-500" />}
          {title}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {data.map((month) => (
            <div
              key={month.key}
              onClick={() => handleMonthClick(type, month)}
              className={`
                relative p-4 rounded-xl border-2 flex flex-col items-center justify-center text-center min-h-[110px] cursor-pointer transition-all hover:shadow-md
                ${
                  month.status === 'paid'
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : month.status === 'partial'
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-rose-500/30 bg-rose-500/10 hover:border-rose-500/50'
                }
              `}
            >
              <span className="text-xs font-semibold text-foreground mb-2">{month.month}</span>
              <div className="mb-2">
                {month.status === 'paid' && (
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                )}
                {month.status === 'partial' && (
                  <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                )}
                {month.status === 'unpaid' && (
                  <XCircle className="w-7 h-7 text-rose-500 dark:text-rose-400" />
                )}
              </div>
              <span
                className={`text-xs font-bold ${
                  month.expected === 0 && type === 'tuition'
                    ? 'text-purple-600 dark:text-purple-400'
                    : month.status === 'paid'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : month.status === 'partial'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {month.expected === 0 && type === 'tuition'
                  ? studentInfo?.student_status === 'Non inscrit' || !status?.feeRecord
                    ? 'NON INSCRIT'
                    : 'EXONÉRÉ'
                  : month.status === 'paid'
                    ? 'PAYÉ'
                    : month.status === 'partial'
                      ? `Reste: ${month.balance?.toLocaleString()} Ar`
                      : `${(month.cost || month.expected || 0).toLocaleString()} Ar`}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement des données financières...</div>

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card p-5 rounded-xl shadow-sm border border-border flex flex-col justify-center min-h-[100px]">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Encaissé</p>
              <h3 className="text-2xl font-bold text-foreground">
                {totalPaid.toLocaleString()} Ar
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-card p-5 rounded-xl shadow-sm border border-border flex flex-col justify-center min-h-[100px]">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tarif Mensuel</p>
              <h3 className="text-2xl font-bold text-foreground">
                {Boolean(studentInfo?.is_personnel_child)
                  ? 'Exonéré (Enfant du personnel)'
                  : `${getTuitionCost(status?.feeRecord || feeRecord, configPrices).toLocaleString()} Ar/mois`}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div>
        <h3 className="text-base font-semibold mb-4 text-foreground">Services & Cotisations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {services.map((service) => {
            const Icon = service.icon
            return (
              <div
                key={service.id}
                onClick={() => handleCardClick(service)}
                className={`
                  p-5 rounded-xl border flex flex-col justify-between h-40 transition-all cursor-pointer shadow-sm hover:shadow-md
                  ${
                    !service.enabled
                      ? 'opacity-50 bg-muted/40 border-border cursor-not-allowed'
                      : 'bg-card border-border hover:border-primary/50'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-xl ${service.bg} ${service.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {service.status === 'paid' && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {service.status === 'paid_fratrie' && (
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  )}
                  {service.status === 'partial' && (
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  )}
                  {service.status === 'pending' && <XCircle className="w-5 h-5 text-rose-500" />}
                </div>

                <div>
                  <h4 className="font-semibold text-sm text-foreground mb-1">{service.label}</h4>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {service.isOneTime
                        ? service.status === 'paid_fratrie'
                          ? 'Payé (Fratrie)'
                          : service.status === 'paid'
                            ? 'Réglé'
                            : service.balance && service.balance > 0
                              ? `Reste: ${service.balance.toLocaleString()} Ar`
                              : 'À régler'
                        : 'Suivi mensuel'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Events Section */}
      {events.length > 0 && (
        <div className="mt-8">
          <h3 className="text-base font-semibold mb-4 text-foreground flex items-center">
            <PartyPopper className="w-5 h-5 mr-2 text-rose-500" />
            Événements & Sorties ({events.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {events.map((event) => {
              const isPaid = event.family_payment_status?.is_paid
              const balance = event.amount_per_parent - (event.family_payment_status?.total_paid || 0)
              return (
                <div
                  key={event.id}
                  onClick={() => {
                    if (isPaid) {
                      alert('Cet événement a déjà été réglé.')
                      return
                    }
                    setFormData((prev) => ({
                      ...prev,
                      payment_type: 'event',
                      item: event.id,
                      amount: balance.toString(),
                      description: `Paiement ${event.event_name}`
                    }))
                    setIsAddPaymentOpen(true)
                  }}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all cursor-pointer shadow-sm hover:shadow-md ${
                    isPaid
                      ? 'bg-indigo-500/10 border-indigo-500/30'
                      : balance < event.amount_per_parent
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-card border-border hover:border-rose-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <h4 className="font-semibold text-sm text-foreground">{event.event_name}</h4>
                    {isPaid ? (
                      <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 ml-2" />
                    ) : balance < event.amount_per_parent ? (
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 ml-2" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 shrink-0 ml-2" />
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {format(new Date(event.event_date), 'dd MMM yyyy', { locale: fr })}
                    </span>
                    <span
                      className={`font-bold ${
                        isPaid
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : balance < event.amount_per_parent
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPaid
                        ? 'RÉGLÉ'
                        : balance < event.amount_per_parent
                          ? `Reste: ${balance.toLocaleString()} Ar`
                          : `${event.amount_per_parent.toLocaleString()} Ar`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Dialog
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        title="Enregistrer un encaissement"
        footer={
          <Button
            type="submit"
            form="payment-form"
            disabled={!canWrite('payments')}
            title={!canWrite('payments') ? 'Accès refusé' : undefined}
          >
            Enregistrer le paiement
          </Button>
        }
      >
        <form id="payment-form" onSubmit={handlePaymentSubmit} className="space-y-4 mt-4">
          <div className="grid gap-2">
            <Label htmlFor="type">Type de paiement</Label>
            <select
              id="type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              value={formData.payment_type}
              onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              disabled
            >
              <option value="tuition">Écolage Mensuel</option>
              <option value="enrollment">Droit d'inscription</option>
              <option value="reenrollment">Réinscription</option>
              <option value="fram">Cotisation FRAM</option>
              <option value="bus">Transport (Bus)</option>
              <option value="canteen">Cantine</option>
              <option value="uniform">Uniforme</option>
              {events && events.length > 0 && <option value="event">Événement</option>}
              <option value="other">Autre</option>
            </select>
          </div>

          {['tuition', 'bus', 'canteen'].includes(formData.payment_type) && (
            <div className="grid gap-2">
              <Label htmlFor="month">Mois concerné</Label>
              <select
                id="month"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                value={formData.month}
                onChange={(e) => {
                  setFormData({ ...formData, month: e.target.value })
                  if (e.target.value) {
                    const selectedMonthData = getMonthsForPaymentType().find(
                      (m) => m.key === e.target.value
                    )
                    if (selectedMonthData && selectedMonthData.balance !== undefined) {
                      setExpectedAmountOverride(selectedMonthData.balance.toString())
                    } else {
                      setExpectedAmountOverride('')
                    }
                  } else {
                    setExpectedAmountOverride('')
                  }
                }}
                required
              >
                <option value="">Sélectionner un mois</option>
                {getMonthsForPaymentType()
                  .filter((m: MonthStatus) => m.status !== 'paid')
                  .map((m: MonthStatus) => (
                    <option key={m.key} value={m.key}>
                      {m.month} ({m.status === 'partial' ? `Reste: ${m.balance?.toLocaleString()} Ar` : 'Non payé'})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {formData.payment_type === 'event' && events && events.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="event_item">Sélectionner l'événement</Label>
              <select
                id="event_item"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                value={formData.item}
                onChange={(e) => {
                  const selectedId = e.target.value
                  const evt = events.find((ev) => ev.id === selectedId)
                  setFormData({
                    ...formData,
                    item: selectedId,
                    amount: evt ? String(evt.amount_per_parent) : formData.amount
                  })
                }}
                required
              >
                <option value="">Sélectionner un événement</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.event_name} ({evt.amount_per_parent.toLocaleString()} Ar)
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.payment_type === 'uniform' &&
            configPrices?.uniforms &&
            Object.keys(configPrices.uniforms).length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="item">Article</Label>
                <select
                  id="item"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  value={formData.item}
                  onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                >
                  {Object.keys(configPrices.uniforms).map((item) => (
                    <option key={item} value={item}>
                      {item} ({configPrices.uniforms[item].toLocaleString()} Ar)
                    </option>
                  ))}
                </select>
              </div>
            )}

          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Montant à encaisser (Ar)</Label>
              {(() => {
                let currentBal = 0
                if (formData.payment_type === 'enrollment' || formData.payment_type === 'reenrollment') {
                  currentBal = Math.max(0, enrollmentBalance)
                } else if (formData.payment_type === 'fram') {
                  currentBal = Math.max(0, framBalance)
                } else if (['tuition', 'canteen', 'bus'].includes(formData.payment_type) && formData.month) {
                  const currentFeeRecord = status?.feeRecord || feeRecord
                  let cost = 0
                  if (formData.payment_type === 'tuition') cost = getTuitionCost(currentFeeRecord, configPrices, Boolean(studentInfo?.is_personnel_child))
                  else if (formData.payment_type === 'bus') cost = getBusCost(currentFeeRecord, configPrices)
                  else if (formData.payment_type === 'canteen') cost = getCanteenCost(currentFeeRecord, configPrices)
                  const existing = payments.filter((p) => p.payment_type === formData.payment_type && p.month === formData.month)
                  const paid = existing.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                  currentBal = Math.max(0, cost - paid)
                } else if (formData.payment_type === 'uniform') {
                  currentBal = (formData.item && configPrices?.uniforms?.[formData.item]) || 0
                } else if (formData.payment_type === 'event') {
                  const evt = events.find((e) => e.id === formData.item)
                  currentBal = evt?.amount_per_parent || 0
                }
                if (currentBal > 0) {
                  return (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, amount: currentBal.toString() })}
                      className="text-xs text-primary hover:underline font-medium cursor-pointer"
                    >
                      Payer le solde ({currentBal.toLocaleString()} Ar)
                    </button>
                  )
                }
                return null
              })()}
            </div>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Montant versé par le parent"
              required
            />
            {/* Indicateur de solde en temps réel */}
            {(() => {
              const entered = parseFloat(formData.amount)
              let currentBal = 0
              if (formData.payment_type === 'enrollment' || formData.payment_type === 'reenrollment') {
                currentBal = Math.max(0, enrollmentBalance)
              } else if (formData.payment_type === 'fram') {
                currentBal = Math.max(0, framBalance)
              } else if (['tuition', 'canteen', 'bus'].includes(formData.payment_type) && formData.month) {
                const currentFeeRecord = status?.feeRecord || feeRecord
                let cost = 0
                if (formData.payment_type === 'tuition') cost = getTuitionCost(currentFeeRecord, configPrices, Boolean(studentInfo?.is_personnel_child))
                else if (formData.payment_type === 'bus') cost = getBusCost(currentFeeRecord, configPrices)
                else if (formData.payment_type === 'canteen') cost = getCanteenCost(currentFeeRecord, configPrices)
                const existing = payments.filter((p) => p.payment_type === formData.payment_type && p.month === formData.month)
                const paid = existing.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                currentBal = Math.max(0, cost - paid)
              }
              if (isNaN(entered) || entered <= 0 || currentBal <= 0) return null
              const remainingAfter = currentBal - entered
              if (remainingAfter === 0) {
                return (
                  <p className="text-xs text-emerald-700 font-medium">
                    ✓ Ce versement soldera l&apos;intégralité du reste à payer.
                  </p>
                )
              } else if (remainingAfter > 0) {
                return (
                  <p className="text-xs text-amber-700 font-medium">
                    Nouveau reste à payer après ce versement : {remainingAfter.toLocaleString()} Ar
                  </p>
                )
              } else {
                return (
                  <p className="text-xs text-blue-700 font-medium">
                    Note : Ce versement dépasse le solde attendu de {(-remainingAfter).toLocaleString()} Ar.
                  </p>
                )
              }
            })()}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="method">Mode de règlement</Label>
            <select
              id="method"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
            >
              <option value="cash">Espèces</option>
              <option value="check">Chèque</option>
              <option value="transfer">Virement</option>
              <option value="mobile_money">Mobile Money (Mvola/Orange/Airtel)</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc">Description / Référence</Label>
            <Input
              id="desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Facultatif..."
            />
          </div>

          {/* Auto-print thermal receipt option */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <input
              type="checkbox"
              id="auto-print-receipt"
              checked={autoPrintReceipt}
              onChange={(e) => {
                setAutoPrintReceipt(e.target.checked)
                localStorage.setItem('auto_print_thermal', String(e.target.checked))
              }}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <Label htmlFor="auto-print-receipt" className="text-xs cursor-pointer text-muted-foreground font-normal">
              Imprimer automatiquement le ticket thermique après validation
            </Label>
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={isViewPaymentOpen}
        onClose={() => setIsViewPaymentOpen(false)}
        title="Détails de l'encaissement"
      >
        {selectedPayment && (
          <div className="space-y-4 pt-2">
            {/* Header N° Reçu */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  N° de Reçu Officiel
                </span>
                <span className="text-sm font-mono font-bold text-foreground">
                  {selectedPayment.receipt_number || selectedPayment.id.slice(0, 8)}
                </span>
              </div>
              <div>
                {(selectedPayment.print_count || 0) === 0 ? (
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    ⚪ Original non imprimé
                  </span>
                ) : (selectedPayment.print_count || 0) === 1 ? (
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    🟢 Reçu Original délivré
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    🟠 Duplicata émis ({selectedPayment.print_count} tirages)
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Date d'encaissement</Label>
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(selectedPayment.payment_date), 'dd MMMM yyyy', { locale: fr })}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Montant encaissé</Label>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {Number(selectedPayment.amount).toLocaleString()} Ar
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mode de règlement</Label>
                <p className="text-sm font-medium capitalize text-foreground">
                  {selectedPayment.payment_method === 'discount'
                    ? 'Remise'
                    : selectedPayment.payment_method === 'mobile_money'
                      ? 'Mobile Money'
                      : selectedPayment.payment_method === 'transfer'
                        ? 'Virement'
                        : selectedPayment.payment_method === 'check'
                          ? 'Chèque'
                          : 'Espèces'}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type de paiement</Label>
                <p className="text-sm font-medium capitalize text-foreground">
                  {selectedPayment.payment_type === 'enrollment'
                    ? "Droit d'inscription"
                    : selectedPayment.payment_type === 'reenrollment'
                      ? 'Droit de réinscription'
                      : selectedPayment.payment_type === 'tuition'
                        ? `Écolage ${selectedPayment.month ? `(${selectedPayment.month})` : ''}`
                        : selectedPayment.payment_type === 'bus'
                          ? 'Transport Bus'
                          : selectedPayment.payment_type === 'canteen'
                            ? 'Cantine'
                            : selectedPayment.payment_type}
                </p>
              </div>
            </div>

            {selectedPayment.description && (
              <div>
                <Label className="text-xs text-muted-foreground">Description / Référence</Label>
                <p className="text-sm text-foreground bg-muted/20 p-2 rounded border border-border">
                  {selectedPayment.description}
                </p>
              </div>
            )}

            {/* Audit & Traçabilité des tirages */}
            {(selectedPayment.print_count || 0) > 0 && (
              <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/20 text-xs space-y-1">
                <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center justify-between">
                  <span>Historique des impressions</span>
                  <span>{selectedPayment.print_count} fois au total</span>
                </div>
                {selectedPayment.last_printed_at && (
                  <p className="text-muted-foreground">
                    Dernière impression le {new Date(selectedPayment.last_printed_at).toLocaleDateString('fr-FR')} à {new Date(selectedPayment.last_printed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {selectedPayment.last_printed_by ? ` par ${selectedPayment.last_printed_by}` : ''}
                  </p>
                )}
                <p className="text-[11px] text-amber-600 dark:text-amber-500 italic">
                  Note : Toute nouvelle réimpression portera obligatoirement la mention légale <b>DUPLICATA N° {(selectedPayment.print_count || 0) + 1}</b>.
                </p>
              </div>
            )}

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <Button
                variant={selectedPayment.print_count && selectedPayment.print_count > 0 ? "outline" : "default"}
                size="sm"
                onClick={() => {
                  handlePrintReceipt(selectedPayment)
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                {(selectedPayment.print_count || 0) === 0
                  ? "Imprimer le reçu original"
                  : `Réimprimer Duplicata (N° ${(selectedPayment.print_count || 0) + 1})`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsViewPaymentOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Monthly Grids */}
      {!status?.feeRecord ? (
        <div className="bg-amber-500/10 p-6 rounded-xl border border-amber-500/30 text-center">
          <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400 mb-1">
            Élève non inscrit pour l'année {schoolYear}
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Veuillez l'inscrire via le bouton "Inscrire" pour activer le suivi financier.
          </p>
        </div>
      ) : (
        renderMonthGrid(`Suivi des Écolages (${schoolYear})`, 'tuition', status?.status ?? [])
      )}

      {!!status?.feeRecord?.bus_subscribed &&
        renderMonthGrid(
          `Suivi du Transport (${status.feeRecord.bus_route} - ${busCost.toLocaleString()} Ar/mois)`,
          'bus',
          busStatus
        )}

      {!!status?.feeRecord?.canteen_subscribed &&
        renderMonthGrid(
          `Suivi de la Cantine (${canteenCost.toLocaleString()} Ar/mois)`,
          'canteen',
          canteenStatus
        )}

      {/* Payment History List */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Historique des Paiements</h3>
            <p className="text-xs text-muted-foreground">{payments.length} transaction(s) enregistrée(s)</p>
          </div>

          {selectedPaymentIds.size > 0 && (
            <Button
              size="sm"
              onClick={handlePrintGroupedReceipt}
              disabled={printing}
              className="bg-primary text-primary-foreground shadow-sm animate-in fade-in"
            >
              {printing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Imprimer le ticket groupé ({selectedPaymentIds.size})
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAllPayments}
                    className="text-muted-foreground hover:text-foreground"
                    title={
                      selectedPaymentIds.size === payments.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'
                    }
                  >
                    {selectedPaymentIds.size > 0 && selectedPaymentIds.size === payments.length ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                 <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">N° Reçu</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Mois / Détail</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-center">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length > 0 ? (
                payments.map((payment) => {
                  const isSelected = selectedPaymentIds.has(payment.id)
                  const printCount = payment.print_count || 0
                  return (
                    <tr
                      key={payment.id}
                      className={`hover:bg-muted/40 transition-colors ${
                        isSelected ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectPayment(payment.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">
                            {payment.receipt_number || payment.id.slice(0, 8)}
                          </span>
                          {printCount > 0 && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              title={`Reçu imprimé ${printCount} fois. Toute réimpression générera un duplicata horodaté.`}
                            >
                              Duplicata (x{printCount})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-muted text-foreground text-xs font-medium px-2.5 py-0.5 rounded-full capitalize">
                          {payment.payment_type === 'tuition'
                            ? 'Écolage'
                            : payment.payment_type === 'enrollment'
                              ? 'Inscription'
                              : payment.payment_type === 'reenrollment'
                                ? 'Réinscription'
                                : payment.payment_type === 'bus'
                                  ? 'Transport'
                                  : payment.payment_type === 'canteen'
                                    ? 'Cantine'
                                    : payment.payment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.month ? (
                          <span className="font-medium text-foreground">{payment.month}</span>
                        ) : (
                          payment.description || '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {Number(payment.amount).toLocaleString()} Ar
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {payment.payment_method === 'discount'
                          ? 'Remise'
                          : payment.payment_method === 'mobile_money'
                            ? 'Mobile Money'
                            : payment.payment_method === 'transfer'
                              ? 'Virement'
                              : payment.payment_method === 'check'
                                ? 'Chèque'
                                : 'Espèces'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handlePrintReceipt(payment)}
                          disabled={printing}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title={printCount > 0 ? `Réimprimer Duplicata (déjà imprimé ${printCount} fois)` : "Imprimer reçu original"}
                        >
                          <Printer className={`w-4 h-4 ${printCount > 0 ? 'text-amber-500' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    Aucun paiement enregistré pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
export default FinanceTab
