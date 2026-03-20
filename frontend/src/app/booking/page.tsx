"use client"

import { API_URL } from '@/lib/api'
import { useState, useEffect, useMemo } from "react"
import {
  Calendar,
  Clock,
  Users,
  AlertCircle,
  Check,
  X,
  ChevronRight,
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
  current_groups: number
  current_groups_display?: number
  adviser_name: string
  reserved_group_name?: string | null
}

interface UserGroup {
  smallgroupID: number | null
  bookingGroupId?: number | null
  teamGroupID?: string
  groupName: string
  roleOne: string
  member1?: string
  member2?: string
  canBookConsultation?: boolean
  memberNumber?: number | null
}

export default function BookingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userGroup, setUserGroup] = useState<UserGroup | null>(null)
  const [slots, setSlots] = useState<ConsultationSlot[]>([])
  const [bookedSlots, setBookedSlots] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [courses, setCourses] = useState<any[]>([])
  const [bookingError, setBookingError] = useState('')
  const [bookingSuccess, setBookingSuccess] = useState('')
  const [isBooking, setIsBooking] = useState(false)
  const [canBookConsultation, setCanBookConsultation] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  // Auth & Load User Group
  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    if (!token) { router.push("/login"); return }

    try {
      const decoded: any = jwtDecode(token)
      setUser(decoded)
      const userEmail = decoded?.email || decoded?.accountEmail || decoded?.account_email || ''
      if (!userEmail) {
        setBookingError('Unable to determine your account email for booking permissions.')
      }
      
      // Fetch user's group info
      fetchUserGroup(userEmail)
    } catch {
      router.push("/login")
    }
  }, [router])

  const fetchUserGroup = async (email: string) => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/group/by-member/${email}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (res.ok) {
        const data = await res.json()
        setUserGroup(data.group)
        const normalizedEmail = String(email || '').trim().toLowerCase()
        const backendMemberNumber = Number(data.group?.memberNumber)
        const isLeader = String(data.group?.roleOne || '').trim().toLowerCase() === normalizedEmail
        const isMemberOne = String(data.group?.member1 || '').trim().toLowerCase() === normalizedEmail
        const isMemberTwo = String(data.group?.member2 || '').trim().toLowerCase() === normalizedEmail
        const computedCanBook =
          Boolean(data.group?.canBookConsultation) ||
          backendMemberNumber === 1 ||
          backendMemberNumber === 2 ||
          isLeader ||
          isMemberOne ||
          isMemberTwo

        setCanBookConsultation(computedCanBook)

        // Load slots across all eligible courses so stale group course mappings don't hide valid slots.
        const groupCourseId = data.group?.courseID || data.group?.course_id || data.group?.courseId
        const normalizedGroupCourseId = groupCourseId ? String(groupCourseId) : ''

        const enrolledCourseIds = await fetchStudentCourseIds()
        const candidateCourseIds = Array.from(
          new Set([normalizedGroupCourseId, ...enrolledCourseIds].filter(Boolean))
        )

        await fetchSlotsForCourses(candidateCourseIds, data.group?.bookingGroupId || data.group?.smallgroupID)
      }
    } catch (err) {
      console.error('Failed to fetch user group:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStudentCourseIds = async (): Promise<string[]> => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) return []
      const data = await res.json()
      const courseList = Array.isArray(data) ? data : []
      setCourses(courseList)
      return courseList.map((course: any) => String(course.id)).filter(Boolean)
    } catch (err) {
      console.error('Failed to fetch student courses:', err)
      return []
    }
  }

  const fetchSlotsForCourses = async (courseIds: string[], groupId?: number | null) => {
    if (!courseIds.length) {
      setSlots([])
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem("auth_token")
      const responses = await Promise.all(
        courseIds.map(async (courseId) => {
          const groupFilter = userGroup?.groupName ? `&groupName=${encodeURIComponent(userGroup.groupName)}` : ''
          const res = await fetch(`${API_URL}/api/consultation/slots/${courseId}?futureOnly=true${groupFilter}`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (!res.ok) return [] as ConsultationSlot[]
          const data = await res.json()
          return (data.slots || []) as ConsultationSlot[]
        })
      )

      const merged = responses.flat()
      const dedupedMap = new Map<number, ConsultationSlot>()
      merged.forEach((slot) => dedupedMap.set(slot.slot_id, slot))
      const allSlots = Array.from(dedupedMap.values()).sort((a, b) => {
        const aTime = new Date(`${a.slot_date}T${a.start_time}`).getTime()
        const bTime = new Date(`${b.slot_date}T${b.start_time}`).getTime()
        return aTime - bTime
      })

      setSlots(allSlots)
      setSelectedCourse(courseIds[0] || '')

      const effectiveGroupId = groupId ?? userGroup?.bookingGroupId ?? userGroup?.smallgroupID
      if (Number.isFinite(Number(effectiveGroupId))) {
        await fetchGroupBookings(Number(effectiveGroupId))
      }
    } catch (err) {
      console.error('Failed to fetch slots:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchGroupBookings = async (groupId: number) => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/consultation/bookings/group/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (res.ok) {
        const data = await res.json()
        const bookedSlotIds = data.bookings
          .filter((b: any) => b.status === 'BOOKED')
          .map((b: any) => b.slot_id)
        setBookedSlots(bookedSlotIds)
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err)
    }
  }

  const handleBookSlot = async (slot: ConsultationSlot) => {
    if (!canBookConsultation) {
      setBookingError("Only the group leader, member #1, or member #2 can book consultations.")
      return
    }

    if (!userGroup) {
      setBookingError("Unable to determine your group.")
      return
    }

    setBookingError('')
    setIsBooking(true)

    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/consultation/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          slotId: slot.slot_id,
          groupId: userGroup.teamGroupID || userGroup.bookingGroupId || userGroup.smallgroupID,
          groupName: userGroup.groupName,
          courseId: slot.course_id,
        }),
      })

      if (res.ok) {
        setBookingSuccess(`Successfully booked consultation with ${slot.adviser_name} on ${new Date(slot.slot_date).toLocaleDateString()}`)
        setBookedSlots((prev) => [...prev, slot.slot_id])
        setSlots((prev) =>
          prev.map((s) =>
            s.slot_id === slot.slot_id
              ? { ...s, current_groups: Math.min(Number(s.max_groups || 1), Number(s.current_groups || 0) + 1) }
              : s
          )
        )
        setTimeout(() => setBookingSuccess(''), 3000)
      } else {
        const err = await res.json()
        setBookingError(err.error || "Failed to book slot.")
      }
    } catch {
      setBookingError("Network error. Please try again.")
    } finally {
      setIsBooking(false)
    }
  }

  const isSlotAvailable = (slot: ConsultationSlot): boolean => {
    if (slot.slot_type === 'SPECIFIC_GROUP' && slot.reserved_group_name) {
      return false
    }
    return slot.current_groups < slot.max_groups && !bookedSlots.includes(slot.slot_id)
  }

  const isSlotExpired = (slot: ConsultationSlot): boolean => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const slotDay = String(slot.slot_date_only || slot.slot_date || '').slice(0, 10)

    return slotDay < today || (slotDay === today && String(slot.end_time || '') <= currentTime)
  }

  const isReservedForCurrentGroup = (slot: ConsultationSlot): boolean => {
    if (slot.slot_type !== 'SPECIFIC_GROUP' || !slot.reserved_group_name || !userGroup?.groupName) return false
    return String(slot.reserved_group_name).trim().toLowerCase() === String(userGroup.groupName).trim().toLowerCase()
  }

  const visibleSlots = useMemo(() => {
    return slots.filter((slot) => !bookedSlots.includes(slot.slot_id) && !isSlotExpired(slot))
  }, [slots, bookedSlots])

  const groupedSlots = useMemo(() => {
    const byDate = new Map<string, ConsultationSlot[]>()
    for (const slot of visibleSlots) {
      const day = String(slot.slot_date_only || slot.slot_date || '').slice(0, 10)
      if (!byDate.has(day)) byDate.set(day, [])
      byDate.get(day)!.push(slot)
    }

    return Array.from(byDate.entries())
      .map(([date, daySlots]) => ({
        date,
        slots: [...daySlots].sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [visibleSlots])

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Book Consultation
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {canBookConsultation
              ? "You can book consultations for your group."
              : "You can view available dates, but only group leader/member #1/member #2 can book consultations."}
          </p>
        </div>

        {/* Group Info */}
        {userGroup && (
          <div className="bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 p-4 mb-6">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold text-gray-800">{userGroup.groupName}</p>
                <p className="text-sm text-gray-600">
                  {canBookConsultation ? "Booking-enabled Member" : "Group Member"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {bookingError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg flex gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            {bookingError}
          </div>
        )}

        {bookingSuccess && (
          <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg flex gap-2">
            <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
            {bookingSuccess}
          </div>
        )}

        {/* Available Slots */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : groupedSlots.length === 0 ? (
          <div className="text-center py-12 bg-white/70 backdrop-blur-xl rounded-xl border border-white/50">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No available consultation slots at this time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedSlots.map((dayGroup) => (
              <div key={dayGroup.date} className="bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50">
                <button
                  type="button"
                  onClick={() => setExpandedDate(expandedDate === dayGroup.date ? null : dayGroup.date)}
                  className="w-full p-4 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold">
                      {new Date(dayGroup.date).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-xs text-gray-500">({dayGroup.slots.length} slot{dayGroup.slots.length > 1 ? 's' : ''})</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedDate === dayGroup.date ? 'rotate-180' : ''}`} />
                </button>

                {expandedDate === dayGroup.date && (
                  <div className="px-4 pb-4 border-t border-gray-200 space-y-2">
                    {dayGroup.slots.map((slot) => {
                      const reservedForGroup = isReservedForCurrentGroup(slot)
                      const available = isSlotAvailable(slot)
                      const isBooked = bookedSlots.includes(slot.slot_id)
                      const displayedBooked = Number(
                        slot.current_groups_display ??
                        (reservedForGroup
                          ? Math.min(Number(slot.max_groups || 1), Number(slot.current_groups || 0) + 1)
                          : Number(slot.current_groups || 0))
                      )

                      return (
                        <div
                          key={slot.slot_id}
                          className={`bg-white rounded-lg border p-3 transition-all ${
                            available || isBooked || reservedForGroup
                              ? 'border-gray-200 hover:shadow-sm'
                              : 'border-red-200 opacity-70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-gray-700">
                                <Clock className="w-4 h-4 text-cyan-600" />
                                <span className="font-medium">{slot.start_time} - {slot.end_time}</span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                Adviser: <span className="font-medium">{slot.adviser_name}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-medium text-gray-700">{displayedBooked}/{slot.max_groups} groups</p>
                                <p className="text-xs text-gray-500">
                                  {reservedForGroup
                                    ? `Reserved for ${userGroup?.groupName}`
                                    : slot.slot_type === 'FIRST_COME_FIRST_SERVE'
                                      ? 'First Come First Serve'
                                      : 'Reserved'}
                                </p>
                              </div>

                              {reservedForGroup ? (
                                <div className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">Reserved</div>
                              ) : isBooked ? (
                                <div className="px-3 py-2 bg-green-100 text-green-700 rounded-lg flex items-center gap-2 text-sm font-medium">
                                  <Check className="w-4 h-4" />
                                  Booked
                                </div>
                              ) : available && canBookConsultation ? (
                                <button
                                  onClick={() => handleBookSlot(slot)}
                                  disabled={isBooking}
                                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
                                >
                                  Book
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              ) : (
                                <div className="px-3 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium">
                                  {available ? 'Contact Leader' : 'Full'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
