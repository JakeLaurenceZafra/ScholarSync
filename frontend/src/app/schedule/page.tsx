"use client"

import { API_URL } from '@/lib/api'
import { useState, useEffect, useMemo } from "react"
import {
  Calendar,
  Plus,
  Clock,
  Users,
  X,
  Check,
  AlertCircle,
  MoreVertical,
  ChevronDown,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode"
import SidebarLayout from "@/components/SidebarLayout"

interface ConsultationSlot {
  slot_id: number
  course_id: number
  slot_date: string
  slot_date_only?: string
  start_time: string
  end_time: string
  slot_type: string
  max_groups: number
  allowed_group_id?: number
  reserved_group_name?: string
  google_event_id?: string
  current_groups?: number
  current_groups_display?: number
}

const sortGroupsNaturally = (items: any[]) => {
  return [...items].sort((a, b) => {
    const aTeam = typeof a.team_number === 'number' ? a.team_number : Number.MAX_SAFE_INTEGER
    const bTeam = typeof b.team_number === 'number' ? b.team_number : Number.MAX_SAFE_INTEGER
    if (aTeam !== bTeam) return aTeam - bTeam
    return String(a.group_name || '').localeCompare(String(b.group_name || ''), undefined, { numeric: true, sensitivity: 'base' })
  })
}

interface Booking {
  booking_id?: number
  group_name: string
  slot_date: string
  start_time: string
  status: string
  group_id: number | string
  slot_id: number
  course_id?: number
}

interface SlotEditForm {
  slotDate: string
  startTime: string
  endTime: string
  maxGroups: string
  extraGroups: string
}

const formatDayLabel = (dateValue: string) => {
  const [yRaw, mRaw, dRaw] = String(dateValue || '').slice(0, 10).split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const d = Number(dRaw)
  if (!y || !m || !d) return dateValue
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

const toDateKey = (slot: ConsultationSlot) => String(slot.slot_date_only || slot.slot_date || '').slice(0, 10)

interface DeleteConfirmState {
  open: boolean
  mode: 'single' | 'day'
  title: string
  message: string
  slotId?: number
  dayDate?: string
  daySlotCount?: number
}

export default function SchedulePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [slots, setSlots] = useState<ConsultationSlot[]>([])
  const [courses, setCourses] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null)
  const [slotBookings, setSlotBookings] = useState<Record<number, Booking[]>>({})
  const [loadingBookings, setLoadingBookings] = useState<Record<number, boolean>>({})
  const [showEditModal, setShowEditModal] = useState(false)
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<'single' | 'day'>('single')
  const [editingSlot, setEditingSlot] = useState<ConsultationSlot | null>(null)
  const [editingDay, setEditingDay] = useState<{ date: string; slotCount: number } | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    open: false,
    mode: 'single',
    title: '',
    message: '',
  })
  const [editForm, setEditForm] = useState<SlotEditForm>({
    slotDate: '',
    startTime: '',
    endTime: '',
    maxGroups: '1',
    extraGroups: '0',
  })

  // Form state
  const [formData, setFormData] = useState({
    courseId: '',
    slotDate: '',
    startTime: '',
    endTime: '',
    slotType: 'FIRST_COME_FIRST_SERVE',
    maxGroups: '2',
    selectedGroups: [] as number[],
    multipleSlots: [] as string[],
    wholeDay: false,
    wholeWeek: false,
  })
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Consultation form state
  const [showConsultationForm, setShowConsultationForm] = useState(false)
  const [currentBooking, setCurrentBooking] = useState<Booking | null>(null)
  const [consultationForm, setConsultationForm] = useState({
    adviserNotes: '',
    conDate: '',
    conMil: '',
    conSum: '',
    conAction: '',
    conConcerns: '',
    memberAttendance: {} as Record<string, 'Present' | 'Absent'>,
    memberParticipation: {} as Record<string, 'High' | 'Moderate' | 'Low'>,
  })
  const [isSavingConsultation, setIsSavingConsultation] = useState(false)
  const [consultationError, setConsultationError] = useState('')
  const [loadingFormButton, setLoadingFormButton] = useState<number | null>(null)

  // Auth
  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    if (!token) { router.push("/login"); return }

    try {
      const decoded: any = jwtDecode(token)
      if (decoded.role !== 'Adviser' && decoded.role !== 'Advisers' && decoded.role !== 'Admin') {
        router.push("/dashboard")
      }
      setUser(decoded)
    } catch {
      router.push("/login")
    }
  }, [router])

  // Fetch slots and courses
  useEffect(() => {
    if (user?.id) {
      fetchSlots()
      fetchCourses()
    }
  }, [user])

  useEffect(() => {
    if (!user?.id) return

    const refreshSlots = () => {
      fetchSlots()
    }

    window.addEventListener('focus', refreshSlots)

    return () => {
      window.removeEventListener('focus', refreshSlots)
    }
  }, [user?.id])

  // Close menu when clicking outside
  useEffect(() => {
    if (!openActionMenu) return

    const handleClickOutside = () => {
      setOpenActionMenu(null)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openActionMenu])

  const fetchSlots = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/consultation/slots/adviser/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const sortedSlots = [...(data.slots || [])].sort((a: ConsultationSlot, b: ConsultationSlot) => {
        const aDay = toDateKey(a)
        const bDay = toDateKey(b)
        if (aDay !== bDay) return aDay.localeCompare(bDay)
        return String(a.start_time || '').localeCompare(String(b.start_time || ''))
      })
      setSlots(sortedSlots)
    } catch {
      setSlots([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCourses = async () => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setCourses(data || [])
      }
    } catch {
      setCourses([])
    }
  }

  const fetchGroups = async (courseId: string) => {
    if (!courseId) {
      setGroups([])
      return
    }
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/courses/${courseId}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setGroups(sortGroupsNaturally(data.groups || []))
      } else {
        console.error('Failed to fetch groups:', res.status, res.statusText)
        setGroups([])
      }
    } catch (err) {
      console.error('Error fetching groups:', err)
      setGroups([])
    }
  }

  // Fetch groups when course changes
  useEffect(() => {
    if (formData.courseId) {
      fetchGroups(formData.courseId)
      setFormData(prev => ({ ...prev, selectedGroups: [] }))
    }
  }, [formData.courseId])

  const handleCreateSlot = async () => {
    // Validate required fields
    if (!formData.courseId || !formData.slotDate) {
      setFormError("Please fill in all required fields.")
      return
    }

    // Check if selected date is in the past
    const selectedDate = new Date(formData.slotDate)
    selectedDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (selectedDate < today) {
      setFormError("Cannot create consultation slots for past dates.")
      return
    }

    if (formData.wholeDay && formData.wholeWeek) {
      setFormError("Choose either Whole Day or Whole Week, not both.")
      return
    }

    // If not whole day, require start and end times
    if (!formData.wholeDay && (!formData.startTime || !formData.endTime)) {
      setFormError("Please fill in all required fields.")
      return
    }

    setFormError("")
    setIsSaving(true)

    try {
      const token = localStorage.getItem("auth_token")
      let startTime = formData.startTime
      let endTime = formData.endTime
      let multipleSlots = [formData.slotDate]
      let isWholeDay = false
      let isWholeWeek = false

      // Build Monday-Saturday dates for the selected week.
      if (formData.wholeWeek) {
        isWholeWeek = true
        const base = new Date(formData.slotDate)
        const monday = new Date(base)
        const dayOfWeek = monday.getDay() // 0=Sun ... 6=Sat
        const toMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        monday.setDate(monday.getDate() + toMondayOffset)

        const weekDates: string[] = []
        for (let i = 0; i < 6; i++) {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          weekDates.push(`${yyyy}-${mm}-${dd}`)
        }
        multipleSlots = weekDates
      }

      // If whole day, create slots for 8am-12pm, 1pm-5pm
      if (formData.wholeDay) {
        isWholeDay = true
        multipleSlots = [formData.slotDate, formData.slotDate]
        startTime = "08:00" // First slot starts at 8am
        endTime = "17:00"   // Slots cover until 5pm
      }

      const payload = {
        courseId: parseInt(formData.courseId),
        slotDate: formData.slotDate,
        startTime: startTime,
        endTime: endTime,
        slotType: formData.slotType,
        maxGroups: formData.slotType === 'FIRST_COME_FIRST_SERVE' ? parseInt(formData.maxGroups) : 1,
        selectedGroups: formData.slotType === 'SPECIFIC_GROUP' ? formData.selectedGroups : undefined,
        isWholeDay: isWholeDay,
        isWholeWeek: isWholeWeek,
        multipleSlots: multipleSlots.length > 1 ? multipleSlots : undefined,
      }

      const res = await fetch(`${API_URL}/api/consultation/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setShowCreateForm(false)
        setFormData({
          courseId: '',
          slotDate: '',
          startTime: '',
          endTime: '',
          slotType: 'FIRST_COME_FIRST_SERVE',
          maxGroups: '2',
          selectedGroups: [],
          multipleSlots: [],
          wholeDay: false,
          wholeWeek: false,
        })
        fetchSlots()
      } else {
        const err = await res.json()
        setFormError(err.error || "Failed to create slots.")
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const toggleSlotExpand = async (slotId: number) => {
    const isExpanding = expandedSlot !== slotId
    setExpandedSlot(expandedSlot === slotId ? null : slotId)

    if (!slotBookings[slotId] && isExpanding) {
      setLoadingBookings(prev => ({...prev, [slotId]: true}))
      try {
        const token = localStorage.getItem("auth_token")
        const res = await fetch(`${API_URL}/api/consultation/bookings/slot/${slotId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setSlotBookings(prev => ({ ...prev, [slotId]: data.bookings || [] }))
        }
      } catch (err) {
        console.error('Failed to fetch bookings:', err)
      } finally {
        setLoadingBookings(prev => ({...prev, [slotId]: false}))
      }
    }
  }

  const performDeleteSlot = async (slotId: number) => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/consultation/slots/${slotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.error || 'Failed to delete slot.')
        return
      }

      fetchSlots()
    } catch {
      setFormError("Failed to delete slot.")
    }
  }

  const resolveGroupIdForBooking = async (booking: Booking): Promise<string | number | null> => {
    // Keep UUID group IDs as-is. Legacy numeric IDs need to be resolved to team_groups UUID.
    if (typeof booking.group_id === 'string' && booking.group_id.includes('-')) {
      console.log('UUID group ID already available:', booking.group_id)
      return booking.group_id
    }
    if (!booking.course_id || !booking.group_name) {
      console.error('Missing course_id or group_name:', { course_id: booking.course_id, group_name: booking.group_name })
      return null
    }

    try {
      const token = localStorage.getItem("auth_token")
      console.log('Fetching groups for course:', booking.course_id)
      const res = await fetch(`${API_URL}/api/courses/${booking.course_id}/groups?t=${Date.now()}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
      })
      console.log('Response status:', res.status, 'OK:', res.ok)
      
      if (res.status === 304) {
        console.warn('Got 304 Not Modified - retrying with cache bust')
        const retryRes = await fetch(`${API_URL}/api/courses/${booking.course_id}/groups?t=${Date.now() + 1}`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          },
        })
        if (!retryRes.ok) {
          console.error('Retry failed:', retryRes.status)
          return null
        }
        const data = await retryRes.json()
        console.log('Groups fetched (retry):', data.groups)
        
        const normalizedName = booking.group_name.trim().toLowerCase()
        console.log('Looking for group with normalized name:', normalizedName)
        const matched = (data.groups || []).find((g: any) => {
          const gName = String(g.group_name || g.groupName || '').trim().toLowerCase()
          console.log('Comparing:', gName, '===', normalizedName, '?', gName === normalizedName)
          return gName === normalizedName
        })
        if (!matched) {
          console.error('No matching group found')
          return null
        }
        const candidateId = matched?.id ?? matched?.groupID ?? matched?.groupId ?? matched?.smallgroupID
        console.log('Candidate ID:', candidateId)
        return candidateId ? String(candidateId) : null
      }
      
      if (!res.ok) {
        console.error('Failed to fetch groups:', res.status)
        return null
      }
      const data = await res.json()
      console.log('Groups fetched:', data.groups)
      const normalizedName = booking.group_name.trim().toLowerCase()
      console.log('Looking for group with normalized name:', normalizedName)
      const matched = (data.groups || []).find((g: any) => {
        const gName = String(g.group_name || g.groupName || '').trim().toLowerCase()
        console.log('Comparing:', gName, '===', normalizedName, '?', gName === normalizedName)
        return gName === normalizedName
      })
      if (!matched) {
        console.error('No matching group found')
        return null
      }
      console.log('Matched group:', matched)
      const candidateId = matched?.id ?? matched?.groupID ?? matched?.groupId ?? matched?.smallgroupID
      console.log('Candidate ID:', candidateId)
      return candidateId ? String(candidateId) : null
    } catch (err) {
      console.error('Error resolving group ID:', err)
      return null
    }
  }

  const openConsultationForm = async (booking: Booking) => {
    setConsultationError('')

    console.log('Opening consultation form for booking:', booking)
    
    // Try to resolve group ID, but if it fails, still open form with empty members
    let resolvedGroupId: string | number | null = null
    try {
      resolvedGroupId = await resolveGroupIdForBooking(booking)
      console.log('Resolved group ID:', resolvedGroupId)
    } catch (err) {
      console.error('Error during group resolution:', err)
    }

    const normalizedBooking: Booking = {
      ...booking,
      group_id: resolvedGroupId || booking.group_id,
    }

    const groupIdForMembers =
      typeof normalizedBooking.group_id === 'string' && normalizedBooking.group_id.includes('-')
        ? normalizedBooking.group_id
        : null

    console.log('Setting current booking:', normalizedBooking)
    setCurrentBooking(normalizedBooking)

    const defaultConDate = String(normalizedBooking.slot_date || '').slice(0, 10)
    setConsultationForm({
      adviserNotes: '',
      conDate: defaultConDate,
      conMil: '',
      conSum: '',
      conAction: '',
      conConcerns: '',
      memberAttendance: {},
      memberParticipation: {},
    })
    
    // Fetch group members to initialize attendance and participation data
    // If this fails, form still opens with empty member sections
    if (groupIdForMembers) {
      try {
        const token = localStorage.getItem("auth_token")
        console.log('Fetching group members for group_id:', groupIdForMembers)
        const res = await fetch(`${API_URL}/api/groups/${groupIdForMembers}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const groupData = await res.json()
          console.log('Group data fetched:', groupData)
          const members = [
            groupData.member1,
            groupData.member2,
            groupData.member3,
            groupData.member4,
            groupData.member5,
          ].filter(m => m)

          console.log('Members:', members)
          const initialAttendance: Record<string, 'Present' | 'Absent'> = {}
          const initialParticipation: Record<string, 'High' | 'Moderate' | 'Low'> = {}
          members.forEach(member => {
            initialAttendance[member] = 'Present'
            initialParticipation[member] = 'Moderate'
          })

          setConsultationForm(prev => ({
            ...prev,
            memberAttendance: initialAttendance,
            memberParticipation: initialParticipation,
          }))
        } else {
          console.error('Failed to fetch group members:', res.status)
          setConsultationForm(prev => ({
            ...prev,
            memberAttendance: {},
            memberParticipation: {},
          }))
        }
      } catch (err) {
        console.error("Error fetching group members:", err)
        setConsultationForm(prev => ({
          ...prev,
          memberAttendance: {},
          memberParticipation: {},
        }))
      }
    } else {
      console.warn('No group ID available, opening form with empty member sections')
      setConsultationForm(prev => ({
        ...prev,
        memberAttendance: {},
        memberParticipation: {},
      }))
    }

    console.log('Setting showConsultationForm to true')
    setShowConsultationForm(true)
  }

  const handleSaveConsultation = async () => {
    if (isSavingConsultation || !currentBooking) return

    setIsSavingConsultation(true)
    setConsultationError('')

    try {
      const token = localStorage.getItem("auth_token")
      const payload = {
        booking_id: currentBooking.booking_id,
        slot_id: currentBooking.slot_id,
        group_id: currentBooking.group_id,
        group_name: currentBooking.group_name,
        adviser_notes: consultationForm.adviserNotes,
        conDate: consultationForm.conDate,
        conMil: consultationForm.conMil,
        conSum: consultationForm.conSum,
        conAction: consultationForm.conAction,
        conConcerns: consultationForm.conConcerns,
        attendance_data: consultationForm.memberAttendance,
        participation_data: consultationForm.memberParticipation,
      }

      console.log('Sending consultation feedback payload:', payload)
      console.log('Current booking:', currentBooking)

      const res = await fetch(`${API_URL}/api/consultation/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      console.log('Feedback response status:', res.status, 'OK:', res.ok)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Feedback submission error:', err)
        setConsultationError(err.error || 'Failed to save consultation feedback.')
        return
      }

      console.log('Consultation feedback saved successfully!')

      setShowConsultationForm(false)
      setCurrentBooking(null)
      fetchSlots()
      setConsultationForm({
        adviserNotes: '',
        conDate: '',
        conMil: '',
        conSum: '',
        conAction: '',
        conConcerns: '',
        memberAttendance: {},
        memberParticipation: {},
      })
    } catch (err) {
      setConsultationError('Network error. Please try again.')
    } finally {
      setIsSavingConsultation(false)
    }
  }

  const handleDeleteSlot = (slotId: number) => {
    setDeleteConfirm({
      open: true,
      mode: 'single',
      title: 'Delete Consultation Slot',
      message: 'Are you sure you want to delete this slot? This action cannot be undone.',
      slotId,
    })
  }

  const openSingleEditModal = (slot: ConsultationSlot) => {
    setFormError('')
    setEditMode('single')
    setEditingSlot(slot)
    setEditingDay(null)
    setEditForm({
      slotDate: toDateKey(slot),
      startTime: slot.start_time,
      endTime: slot.end_time,
      maxGroups: String(slot.max_groups || 1),
      extraGroups: '0',
    })
    setShowEditModal(true)
  }

  const openDayEditModal = (date: string, slotCount: number) => {
    setFormError('')
    setEditMode('day')
    setEditingSlot(null)
    setEditingDay({ date, slotCount })
    setEditForm({
      slotDate: String(date).slice(0, 10),
      startTime: '',
      endTime: '',
      maxGroups: '1',
      extraGroups: '0',
    })
    setShowEditModal(true)
  }

  const performDeleteDay = async (date: string, slotCount: number) => {
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${API_URL}/api/consultation/slots/day/${encodeURIComponent(date)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        fetchSlots()
        return
      }

      // Fallback: delete each slot individually when bulk day delete fails.
      const daySlotIds = slots
        .filter((slot) => toDateKey(slot) === String(date).slice(0, 10))
        .map((slot) => slot.slot_id)

      if (daySlotIds.length === 0) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.error || 'No slots found to delete for this day.')
        return
      }

      const results = await Promise.all(
        daySlotIds.map(async (slotId) => {
          const deleteRes = await fetch(`${API_URL}/api/consultation/slots/${slotId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
          return { slotId, ok: deleteRes.ok }
        })
      )

      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        setFormError(`Deleted ${results.length - failed.length}/${results.length} slots. Some slots could not be deleted.`)
      }

      fetchSlots()
    } catch {
      setFormError('Failed to delete day slots.')
    }
  }

  const handleDeleteDay = (date: string, slotCount: number) => {
    setDeleteConfirm({
      open: true,
      mode: 'day',
      title: 'Delete Whole Day',
      message: `Delete all ${slotCount} consultation slot(s) on ${date}? This action cannot be undone.`,
      dayDate: date,
      daySlotCount: slotCount,
    })
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    try {
      if (deleteConfirm.mode === 'single' && deleteConfirm.slotId) {
        await performDeleteSlot(deleteConfirm.slotId)
      }

      if (deleteConfirm.mode === 'day' && deleteConfirm.dayDate && deleteConfirm.daySlotCount) {
        await performDeleteDay(deleteConfirm.dayDate, deleteConfirm.daySlotCount)
      }
    } finally {
      setIsDeleting(false)
      setDeleteConfirm({ open: false, mode: 'single', title: '', message: '' })
    }
  }

  const handleSubmitEdit = async () => {
    if (isUpdating) return

    if (!editForm.slotDate) {
      setFormError('Date is required.')
      return
    }

    const nextMax = editMode === 'single' ? (editForm.maxGroups ? Number(editForm.maxGroups) : null) : null
    const extraGroups = editMode === 'day' ? Number(editForm.extraGroups || '0') : 0

    if (nextMax !== null && (!Number.isFinite(nextMax) || nextMax <= 0)) {
      setFormError('Max groups must be a positive number.')
      return
    }

    if (editMode === 'day' && (!Number.isFinite(extraGroups) || extraGroups < 0 || extraGroups > 5)) {
      setFormError('Extra groups must be between 0 and 5.')
      return
    }

    if (editMode === 'single' && (!editForm.startTime || !editForm.endTime)) {
      setFormError('Start and end time are required for individual slot updates.')
      return
    }

    if (editMode === 'single' && editForm.startTime >= editForm.endTime) {
      setFormError('Start time must be earlier than end time.')
      return
    }

    setIsUpdating(true)
    setFormError('')

    try {
      const token = localStorage.getItem('auth_token')
      let res: Response

      if (editMode === 'single' && editingSlot) {
        res = await fetch(`${API_URL}/api/consultation/slots/${editingSlot.slot_id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            slotDate: editForm.slotDate,
            startTime: editForm.startTime,
            endTime: editForm.endTime,
            maxGroups: nextMax,
          }),
        })
      } else if (editMode === 'day' && editingDay) {
        res = await fetch(`${API_URL}/api/consultation/slots/day/${encodeURIComponent(editingDay.date)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            newDate: editForm.slotDate,
            extraGroups,
          }),
        })

        if (!res.ok && extraGroups === 0) {
          // Fallback: update all slots of the selected day one-by-one.
          const daySlots = slots.filter(
            (slot) => toDateKey(slot) === String(editingDay.date).slice(0, 10)
          )

          if (daySlots.length > 0) {
            const updateResults = await Promise.all(
              daySlots.map(async (slot) => {
                const updateRes = await fetch(`${API_URL}/api/consultation/slots/${slot.slot_id}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    slotDate: editForm.slotDate,
                    startTime: slot.start_time,
                    endTime: slot.end_time,
                    maxGroups: null,
                  }),
                })
                return updateRes.ok
              })
            )

            if (updateResults.every(Boolean)) {
              setShowEditModal(false)
              setEditingSlot(null)
              setEditingDay(null)
              fetchSlots()
              return
            }
          }
        }
      } else {
        setIsUpdating(false)
        return
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.error || 'Failed to update slot(s).')
        return
      }

      setShowEditModal(false)
      setEditingSlot(null)
      setEditingDay(null)
      fetchSlots()
    } catch {
      setFormError('Failed to update slot(s).')
    } finally {
      setIsUpdating(false)
    }
  }

  const groupedSlots = useMemo(() => {
    // Get current date and time for filtering past slots
    const now = new Date()
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const byDate = new Map<string, ConsultationSlot[]>()

    for (const slot of slots) {
      const day = toDateKey(slot)
      
      // Check if slot has passed
      const slotHasPassed = day < todayStr || (day === todayStr && slot.end_time <= currentTime)
      const hasBookingContext = Number(slot.current_groups || 0) > 0 || (slot.slot_type === 'SPECIFIC_GROUP' && !!slot.reserved_group_name)
      if (slotHasPassed && !hasBookingContext) {
        continue // Skip past slots only if they have no booking/reserved context
      }

      if (!byDate.has(day)) {
        byDate.set(day, [])
      }
      byDate.get(day)!.push(slot)
    }

    return Array.from(byDate.entries())
      .map(([date, daySlots]) => {
        const sortedSlots = [...daySlots].sort((a, b) => a.start_time.localeCompare(b.start_time))
        const totalBooked = sortedSlots.reduce((sum, slot) => {
          const displayedBooked = Number(slot.current_groups_display ?? slot.current_groups ?? 0)
          return sum + displayedBooked
        }, 0)
        const totalCapacity = sortedSlots.reduce((sum, slot) => sum + Number(slot.max_groups || 0), 0)

        return {
          date,
          slots: sortedSlots,
          firstStart: sortedSlots[0]?.start_time || '',
          lastEnd: sortedSlots[sortedSlots.length - 1]?.end_time || '',
          totalBooked,
          totalCapacity,
        }
      })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [slots])

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>

    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              My Schedule
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Manage consultation time slots and group bookings</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-cyan-600 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Slot
          </button>
        </div>

        {/* Create Slot Form */}
        {showCreateForm && (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create Consultation Slot</h2>

            {formError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg flex gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                {formError}
              </div>
            )}

            <div className="space-y-4">
              {/* Course Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
                <select
                  value={formData.courseId}
                  onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.courseName || `Course ${course.id}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date {formData.wholeWeek ? '(pick any day in target week)' : ''}</label>
                <input
                  type="date"
                  value={formData.slotDate}
                  onChange={(e) => setFormData({ ...formData, slotDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Whole Day Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="wholeDay"
                  checked={formData.wholeDay}
                  onChange={(e) => setFormData({ ...formData, wholeDay: e.target.checked, wholeWeek: e.target.checked ? false : formData.wholeWeek })}
                  className="w-4 h-4"
                />
                <label htmlFor="wholeDay" className="text-sm font-medium text-gray-700">
                  Whole Day (specific groups are auto-planned with max 1 hour each + 10-minute breaks)
                </label>
              </div>

              {/* Whole Week Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="wholeWeek"
                  checked={formData.wholeWeek}
                  onChange={(e) => setFormData({ ...formData, wholeWeek: e.target.checked, wholeDay: e.target.checked ? false : formData.wholeDay })}
                  className="w-4 h-4"
                />
                <label htmlFor="wholeWeek" className="text-sm font-medium text-gray-700">
                  Whole Week (Mon-Sat uses the same time range for each day)
                </label>
              </div>

              {!formData.wholeDay && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Slot Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slot Type</label>
                <select
                  value={formData.slotType}
                  onChange={(e) => setFormData({ ...formData, slotType: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FIRST_COME_FIRST_SERVE">First Come First Serve</option>
                  <option value="SPECIFIC_GROUP">Specific Group</option>
                </select>
              </div>

              {/* Select Groups (for SPECIFIC_GROUP) */}
              {formData.slotType === 'SPECIFIC_GROUP' && formData.courseId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Groups</label>
                  {groups.length === 0 ? (
                    <p className="text-sm text-gray-500">No groups available for this course</p>
                  ) : (
                    <div className="space-y-2 border border-gray-300 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
                      {groups.map((group) => (
                        <div key={group.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`group-${group.id}`}
                            checked={formData.selectedGroups.includes(group.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({
                                  ...prev,
                                  selectedGroups: [...prev.selectedGroups, group.id]
                                }))
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  selectedGroups: prev.selectedGroups.filter(id => id !== group.id)
                                }))
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <label htmlFor={`group-${group.id}`} className="text-sm text-gray-700 cursor-pointer">
                            {group.group_name || `Group ${group.id}`}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Max Groups Dropdown (for FCFS) */}
              {formData.slotType === 'FIRST_COME_FIRST_SERVE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Groups</label>
                  <select
                    value={formData.maxGroups}
                    onChange={(e) => setFormData({ ...formData, maxGroups: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreateSlot}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? "Creating..." : "Create Slot"}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Slots List */}
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : groupedSlots.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No consultation slots yet</p>
          </div>
        ) : (
          <div>
            {/* Section Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">THIS WEEK'S AGENDA</h2>
              <p className="text-sm text-gray-500 mt-1">Your consultation schedule and availability</p>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {groupedSlots.map((dayGroup) => (
              <div key={dayGroup.date} className="relative h-full bg-white border border-gray-300 rounded-xl overflow-visible hover:shadow-lg transition-all">
                {/* Day Card - Two Column Layout */}
                <div className="bg-white h-full">
                  <div className="grid grid-cols-[200px_1fr] h-full items-stretch">
                    {/* Left: Day and Date */}
                    <div className="h-full border-r border-gray-300 p-6 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                      <div className="text-center">
                          {(() => {
                            const [yRaw, mRaw, dRaw] = String(dayGroup.date || '').slice(0, 10).split('-')
                            const dayName = new Date(Number(yRaw), Number(mRaw) - 1, Number(dRaw)).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
                            const monthName = new Date(Number(yRaw), Number(mRaw) - 1, Number(dRaw)).toLocaleDateString("en-US", { month: "short" }).toUpperCase()
                            const dayNum = String(dRaw).replace(/^0/, '')
                            return (
                              <>
                                <p className="text-sm font-medium text-gray-600 tracking-wider">{dayName} • {monthName}</p>
                                <p className="text-4xl font-bold text-gray-900 mt-1">{dayNum}</p>
                              </>
                            )
                          })()}
                      </div>
                    </div>

                    {/* Right: Available Slots */}
                    <div className="p-6 h-full flex flex-col">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AVAILABLE:</p>
                      <div className="space-y-2">
                        {dayGroup.slots.map((slot) => {
                          const booked = Number(slot.current_groups_display ?? slot.current_groups ?? 0)
                          const capacity = Number(slot.max_groups || 0)
                          const isFullyBooked = booked >= capacity
                          const hasBookings = booked > 0
                          return (
                            <div 
                              key={slot.slot_id}
                              className={`text-sm font-medium px-3 py-2 rounded transition-all cursor-pointer ${
                                isFullyBooked
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : hasBookings
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-green-50 text-green-700 border border-green-200 hover:shadow-md'
                              }`}
                              onClick={() => toggleSlotExpand(slot.slot_id)}
                              title={`${slot.start_time} - ${slot.end_time}: ${booked}/${capacity} groups booked`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{slot.start_time} - {slot.end_time}</span>
                                <span className="text-xs font-semibold opacity-70">({booked}/{capacity})</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Summary Stats */}
                      <div className="mt-auto pt-3 border-t border-gray-200 flex justify-between">
                        <div>
                          <p className="text-xs text-gray-500">Booked</p>
                          <p className="text-lg font-bold text-gray-900">{dayGroup.totalBooked}/{dayGroup.totalCapacity}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Slots</p>
                          <p className="text-lg font-bold text-gray-900">{dayGroup.slots.length}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenActionMenu(openActionMenu === `day-${dayGroup.date}` ? null : `day-${dayGroup.date}`)
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 relative"
                          aria-label="Open day actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {openActionMenu === `day-${dayGroup.date}` && (
                  <div className="absolute top-full right-6 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-[200]" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenActionMenu(null)
                        openDayEditModal(dayGroup.date, dayGroup.slots.length)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100"
                    >
                      Edit Day
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenActionMenu(null)
                        handleDeleteDay(dayGroup.date, dayGroup.slots.length)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete Day
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
        )}

        {showEditModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editMode === 'single' ? 'Edit Consultation Slot' : 'Edit Whole Day Slots'}
                </h3>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingSlot(null)
                    setEditingDay(null)
                  }}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {editMode === 'day' && editingDay && (
                <p className="text-sm text-gray-600 mb-3">
                  Updating {editingDay.slotCount} slot(s) from {editingDay.date}.
                </p>
              )}

              {formError && (
                <div className="mb-3 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editForm.slotDate}
                    onChange={(e) => setEditForm(prev => ({ ...prev, slotDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {editMode === 'single' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={editForm.startTime}
                        onChange={(e) => setEditForm(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <input
                        type="time"
                        value={editForm.endTime}
                        onChange={(e) => setEditForm(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editMode === 'day' ? 'Extra Groups' : 'Max Groups'}
                  </label>
                  {editMode === 'day' ? (
                    <select
                      value={editForm.extraGroups}
                      onChange={(e) => setEditForm(prev => ({ ...prev, extraGroups: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  ) : (
                    <select
                      value={editForm.maxGroups}
                      onChange={(e) => setEditForm(prev => ({ ...prev, maxGroups: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  )}
                  {editMode === 'day' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Adds extra FCFS slots for this day (1 hour each, 10-minute break between slots).
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitEdit}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showConsultationForm && currentBooking && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Consultation Record - {currentBooking.group_name}
                </h3>
                <button
                  onClick={() => {
                    setShowConsultationForm(false)
                    setCurrentBooking(null)
                  }}
                  className="p-1 rounded hover:bg-gray-100"
                  disabled={isSavingConsultation}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {consultationError && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center justify-between">
                  <span>{consultationError}</span>
                  <button onClick={() => setConsultationError('')} className="text-red-600 hover:text-red-800">✕</button>
                </div>
              )}

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {/* Adviser Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adviser Notes</label>
                  <textarea
                    value={consultationForm.adviserNotes}
                    onChange={(e) => setConsultationForm({...consultationForm, adviserNotes: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                    placeholder="Summary of discussion and observations..."
                  />
                </div>

                {/* Consultation Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Date</label>
                  <input
                    type="date"
                    value={consultationForm.conDate}
                    onChange={(e) => setConsultationForm({...consultationForm, conDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                {/* Milestone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Milestone/Topic</label>
                  <textarea
                    value={consultationForm.conMil}
                    onChange={(e) => setConsultationForm({...consultationForm, conMil: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={2}
                    placeholder="What milestone or topic was discussed?"
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                  <textarea
                    value={consultationForm.conSum}
                    onChange={(e) => setConsultationForm({...consultationForm, conSum: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                    placeholder="Summary of the consultation discussion..."
                  />
                </div>

                {/* Action */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action Items</label>
                  <textarea
                    value={consultationForm.conAction}
                    onChange={(e) => setConsultationForm({...consultationForm, conAction: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={2}
                    placeholder="Agreed next steps and deliverables..."
                  />
                </div>

                {/* Concerns */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concerns</label>
                  <textarea
                    value={consultationForm.conConcerns}
                    onChange={(e) => setConsultationForm({...consultationForm, conConcerns: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={2}
                    placeholder="Adviser/admin concerns for follow-up..."
                  />
                </div>

                {/* Member Attendance & Participation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Member Attendance & Participation</label>
                  <div className="space-y-2">
                    {Object.keys(consultationForm.memberAttendance).map((member) => (
                      <div key={member} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700">{member}</p>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={consultationForm.memberAttendance[member]}
                            onChange={(e) => setConsultationForm({
                              ...consultationForm,
                              memberAttendance: {...consultationForm.memberAttendance, [member]: e.target.value as any}
                            })}
                            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                          </select>
                          <select
                            value={consultationForm.memberParticipation[member]}
                            onChange={(e) => setConsultationForm({
                              ...consultationForm,
                              memberParticipation: {...consultationForm.memberParticipation, [member]: e.target.value as any}
                            })}
                            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="High">High</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => {
                    setShowConsultationForm(false)
                    setCurrentBooking(null)
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  disabled={isSavingConsultation}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConsultation}
                  disabled={isSavingConsultation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingConsultation ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Slot Details Modal */}
        {expandedSlot && slots.find(s => s.slot_id === expandedSlot) && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[70vh] overflow-y-auto">
              {(() => {
                const slot = slots.find(s => s.slot_id === expandedSlot)
                if (!slot) return null

                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Slot Details
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatDayLabel(slot.slot_date)} • {slot.start_time} - {slot.end_time}
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedSlot(null)}
                        className="p-1 rounded hover:bg-gray-100"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Type:</span>
                        <span className="font-medium">
                          {slot.slot_type === 'FIRST_COME_FIRST_SERVE' ? 'FCFS' : 'Specific Group'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Capacity:</span>
                        <span className="font-medium">
                          {Number(slot.current_groups_display ?? slot.current_groups ?? 0)} / {slot.max_groups}
                        </span>
                      </div>
                    </div>

                    <h4 className="font-semibold text-gray-800 mb-3">Bookings</h4>
                    <div className="space-y-2 mb-4">
                      {loadingBookings[slot.slot_id] ? (
                        <div className="flex items-center justify-center py-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                      ) : slotBookings[slot.slot_id]?.length ? (
                        slotBookings[slot.slot_id].map((booking) => (
                          <div key={booking.booking_id} className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{booking.group_name}</p>
                                <p className="text-xs text-gray-600">{booking.status}</p>
                              </div>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                setExpandedSlot(null)
                                setLoadingFormButton(booking.booking_id || slot.slot_id)
                                try {
                                  await openConsultationForm(booking)
                                } finally {
                                  setLoadingFormButton(null)
                                }
                              }}
                              disabled={loadingFormButton === (booking.booking_id || slot.slot_id)}
                              className="w-full px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {loadingFormButton === (booking.booking_id || slot.slot_id) ? 'Loading...' : 'Consultation Record'}
                            </button>
                          </div>
                        ))
                      ) : slot.slot_type === 'SPECIFIC_GROUP' && slot.reserved_group_name ? (
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                          <p className="text-sm font-medium text-blue-900 mb-2">Reserved: {slot.reserved_group_name}</p>
                          <p className="text-xs text-blue-700 mb-3">Ready for consultation record.</p>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              setExpandedSlot(null)
                              setLoadingFormButton(slot.slot_id)
                              try {
                                await openConsultationForm({
                                  booking_id: undefined,
                                  group_name: slot.reserved_group_name || 'Reserved Group',
                                  slot_date: slot.slot_date,
                                  start_time: slot.start_time,
                                  status: 'CONFIRMED',
                                  group_id: slot.allowed_group_id || 0,
                                  slot_id: slot.slot_id,
                                  course_id: slot.course_id,
                                })
                              } finally {
                                setLoadingFormButton(null)
                              }
                            }}
                            disabled={loadingFormButton === slot.slot_id}
                            className="w-full px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {loadingFormButton === slot.slot_id ? 'Loading...' : 'Consultation Record'}
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 text-center py-3">No bookings for this slot yet</p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-200 flex gap-2">
                      <button
                        onClick={() => {
                          setExpandedSlot(null)
                          openSingleEditModal(slot)
                        }}
                        className="flex-1 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setExpandedSlot(null)
                          handleDeleteSlot(slot.slot_id)
                        }}
                        className="flex-1 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {deleteConfirm.open && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{deleteConfirm.title}</h3>
                <button
                  onClick={() => setDeleteConfirm({ open: false, mode: 'single', title: '', message: '' })}
                  className="p-1 rounded hover:bg-gray-100"
                  disabled={isDeleting}
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-5">{deleteConfirm.message}</p>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirm({ open: false, mode: 'single', title: '', message: '' })}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
