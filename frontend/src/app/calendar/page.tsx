"use client"

import { API_URL } from '@/lib/api'
import { useState, useEffect } from "react"
import {
  CalendarIcon,
  Plus,
  Clock,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Trash2,
  AlertCircle,
  Tag,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode"
import SidebarLayout from "@/components/SidebarLayout"

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location?: string
  attendees?: Array<{ email: string; displayName?: string }>
  colorId?: string
}

interface EventFormData {
  title: string
  description: string
  location: string
  startTime: string
  endTime: string
  allDay: boolean
  attendees: string // comma-separated emails
}

type ViewMode = "month" | "week" | "day"

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
const EVENT_TYPE_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  exam: { bg: "bg-red-100", text: "text-red-700", border: "border-l-red-500", dot: "bg-red-500" },
  class: { bg: "bg-blue-100", text: "text-blue-700", border: "border-l-blue-500", dot: "bg-blue-500" },
  assignment: { bg: "bg-amber-100", text: "text-amber-700", border: "border-l-amber-500", dot: "bg-amber-500" },
  meeting: { bg: "bg-purple-100", text: "text-purple-700", border: "border-l-purple-500", dot: "bg-purple-500" },
  other: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-l-cyan-500", dot: "bg-cyan-500" },
}

function detectEventType(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes("exam") || s.includes("quiz") || s.includes("test")) return "exam"
  if (s.includes("class") || s.includes("lecture")) return "class"
  if (s.includes("assignment") || s.includes("homework") || s.includes("due")) return "assignment"
  if (s.includes("meeting") || s.includes("standup") || s.includes("sync")) return "meeting"
  return "other"
}

function getEventColors(event: CalendarEvent) {
  const type = detectEventType(event.summary || "")
  return EVENT_TYPE_COLORS[type] ?? EVENT_TYPE_COLORS.other
}

function formatTime(dateStr?: string, allDay?: boolean): string {
  if (allDay || !dateStr) return "All day"
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  )
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function getEventStartDate(event: CalendarEvent): Date | null {
  if (event.start?.dateTime) {
    const parsed = new Date(event.start.dateTime)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (event.start?.date) {
    const [y, m, d] = event.start.date.split("-").map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d, 0, 0, 0, 0)
  }
  return null
}

// ─────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [formError, setFormError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [calendarWarning, setCalendarWarning] = useState("")

  const blankForm = (): EventFormData => ({
    title: "",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    allDay: false,
    attendees: "",
  })

  const [formData, setFormData] = useState<EventFormData>(blankForm())

  // ── Auth ──
  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    if (!token) { router.push("/login"); return }

    try {
      const decoded: any = jwtDecode(token)
      setUser(decoded)
    } catch {
      router.push("/login")
    }
  }, [router])

  useEffect(() => { if (user) fetchEvents() }, [user])

  // ── Fetch Events ──
  const fetchEvents = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("auth_token")
      if (!token) return
      const res = await fetch(`${API_URL}/api/calendar/events`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEvents(data.events || [])
      if (data.calendarStatus && !data.calendarStatus.googleFetchOk) {
        setCalendarWarning(
          data.calendarStatus.googleError || "Google Calendar connection issue detected."
        )
      } else {
        setCalendarWarning("")
      }
    } catch {
      setEvents([])
      setCalendarWarning("Failed to load calendar data.")
    } finally {
      setLoading(false)
    }
  }

  // ── Event CRUD ──
  const openCreate = (date?: Date) => {
    setEditingEvent(null)
    setFormError("")
    const base = date ?? new Date()
    if (!date) {
      // Default to the next full hour so new events don't start in the past.
      base.setHours(base.getHours() + 1, 0, 0, 0)
    } else {
      base.setMinutes(0, 0, 0)
    }
    const end = new Date(base.getTime() + 60 * 60 * 1000)
    setFormData({
      ...blankForm(),
      startTime: toLocalInputValue(base),
      endTime: toLocalInputValue(end),
    })
    setShowModal(true)
  }

  const openEdit = (event: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingEvent(event)
    setFormError("")
    const start = event.start.dateTime
      ? new Date(event.start.dateTime)
      : event.start.date
        ? new Date(event.start.date + "T00:00")
        : new Date()
    const end = event.end.dateTime
      ? new Date(event.end.dateTime)
      : event.end.date
        ? new Date(event.end.date + "T01:00")
        : new Date(start.getTime() + 3600000)
    setFormData({
      title: event.summary || "",
      description: event.description || "",
      location: event.location || "",
      startTime: toLocalInputValue(start),
      endTime: toLocalInputValue(end),
      allDay: !event.start.dateTime,
      attendees: event.attendees?.map((a) => a.email).join(", ") || "",
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) { setFormError("Event title is required."); return }
    if (!formData.startTime || !formData.endTime) { setFormError("Start and end times are required."); return }
    if (new Date(formData.startTime) >= new Date(formData.endTime)) {
      setFormError("End time must be after start time.")
      return
    }
    setFormError("")
    setIsSaving(true)
    try {
      const token = localStorage.getItem("auth_token")
      const attendeeEmails = formData.attendees
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((email) => ({ email }))

      const payload = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        startTime: new Date(formData.startTime),
        endTime: new Date(formData.endTime),
        allDay: formData.allDay,
        attendees: attendeeEmails,
      }

      const url = editingEvent
        ? `${API_URL}/api/calendar/events/${editingEvent.id}`
        : `${API_URL}/api/calendar/events`
      const method = editingEvent ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setShowModal(false)
        setEditingEvent(null)
        setSelectedEvent(null)
        fetchEvents()
      } else {
        const err = await res.json()
        setFormError(err.error || "Failed to save event.")
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (eventId: string) => {
    setDeletingEventId(eventId)
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch(`${API_URL}/api/calendar/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setSelectedEvent(null)
        fetchEvents()
      }
    } finally {
      setDeletingEventId(null)
    }
  }

  // ── Computed ──
  const getEventsForDate = (date: Date) =>
    events.filter((ev) => {
      const d = getEventStartDate(ev)
      if (!d) return false
      return sameDay(d, date)
    })

  const today = new Date()

  // ── Month view helpers ──
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  // ── Week view helpers ──
  const weekStart = getStartOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // ── Day view helpers ──
  const hours = Array.from({ length: 24 }, (_, i) => i)

  const navigatePrev = () => {
    if (viewMode === "month") setCurrentDate(new Date(year, month - 1, 1))
    else if (viewMode === "week") {
      const d = new Date(weekStart)
      d.setDate(d.getDate() - 7)
      setCurrentDate(d)
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() - 1)
      setCurrentDate(d)
    }
  }

  const navigateNext = () => {
    if (viewMode === "month") setCurrentDate(new Date(year, month + 1, 1))
    else if (viewMode === "week") {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + 7)
      setCurrentDate(d)
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + 1)
      setCurrentDate(d)
    }
  }

  const currentLabel = () => {
    if (viewMode === "month") return monthName
    if (viewMode === "week") {
      const endOfWeek = new Date(weekStart)
      endOfWeek.setDate(endOfWeek.getDate() + 6)
      return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    }
    return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  }

  // ── Upcoming sidebar ──
  const upcomingEvents = events
    .filter((e) => {
      const d = getEventStartDate(e)
      return d ? d >= today : false
    })
    .sort((a, b) => {
      const aDate = getEventStartDate(a)
      const bDate = getEventStartDate(b)
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return aDate.getTime() - bDate.getTime()
    })
    .slice(0, 8)

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Calendar
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Your schedule, synced with Google Calendar</p>
          </div>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-cyan-600 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {calendarWarning && (
            <div className="lg:col-span-3 p-3 bg-amber-100 border border-amber-300 text-amber-800 rounded-xl text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Google Calendar issue: {calendarWarning}. Consultation fallback events may still appear.
              </span>
            </div>
          )}

          {/* ── Main Calendar Panel ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Navigation Bar */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              {/* View Switcher */}
              <div className="flex bg-gray-100/80 rounded-xl p-1 gap-1">
                {(["month", "week", "day"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium capitalize transition-all ${viewMode === v
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Date Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCurrentDate(new Date()); setViewMode("day") }}
                  className="px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Today
                </button>
                <button onClick={navigatePrev} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">{currentLabel()}</span>
                <button onClick={navigateNext} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* ── MONTH VIEW ── */}
            {viewMode === "month" && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-xs font-semibold text-blue-600 py-3 uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-gray-100 bg-gray-50/50" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const date = new Date(year, month, day)
                    const isToday = sameDay(date, today)
                    const dayEvents = getEventsForDate(date)
                    const col = (firstDay + i) % 7
                    const isLastCol = col === 6

                    return (
                      <div
                        key={day}
                        onClick={() => { setCurrentDate(date); setViewMode("day") }}
                        className={`min-h-[90px] p-2 cursor-pointer border-b border-r border-gray-100 transition-colors hover:bg-blue-50/40 ${isLastCol ? "border-r-0" : ""}`}
                      >
                        <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isToday ? "bg-gradient-to-br from-blue-500 to-cyan-400 text-white font-bold" : "text-gray-700"
                          }`}>
                          {day}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map((ev) => {
                            const col = getEventColors(ev)
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
                                className={`text-xs px-1.5 py-0.5 rounded truncate font-medium ${col.bg} ${col.text} cursor-pointer hover:opacity-80 transition-opacity`}
                              >
                                {ev.summary}
                              </div>
                            )
                          })}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-gray-400 pl-1.5">+{dayEvents.length - 2} more</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── WEEK VIEW ── */}
            {viewMode === "week" && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                {/* Week Day Headers */}
                <div className="grid grid-cols-8 border-b border-gray-100">
                  <div className="py-3" />
                  {weekDays.map((wd) => {
                    const isToday = sameDay(wd, today)
                    return (
                      <div
                        key={wd.toISOString()}
                        className="text-center py-3 cursor-pointer hover:bg-blue-50"
                        onClick={() => { setCurrentDate(wd); setViewMode("day") }}
                      >
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          {wd.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                        <div className={`text-sm font-bold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-gradient-to-br from-blue-500 to-cyan-400 text-white" : "text-gray-700"}`}>
                          {wd.getDate()}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Hour rows */}
                <div className="max-h-[560px] overflow-y-auto">
                  {hours.map((h) => (
                    <div key={h} className="grid grid-cols-8 border-b border-gray-100 min-h-[52px]">
                      <div className="py-1 pr-3 text-right">
                        <span className="text-xs text-gray-400">
                          {h === 0 ? "" : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`}
                        </span>
                      </div>
                      {weekDays.map((wd) => {
                        const slotEvents = events.filter((ev) => {
                          if (!ev.start.dateTime) return false
                          const d = new Date(ev.start.dateTime)
                          return sameDay(d, wd) && d.getHours() === h
                        })
                        return (
                          <div
                            key={wd.toISOString()}
                            onClick={() => {
                              const d = new Date(wd)
                              d.setHours(h, 0, 0, 0)
                              openCreate(d)
                            }}
                            className="border-l border-gray-100 p-0.5 cursor-pointer hover:bg-blue-50/30 transition-colors"
                          >
                            {slotEvents.map((ev) => {
                              const col = getEventColors(ev)
                              return (
                                <div
                                  key={ev.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
                                  className={`text-xs px-1 py-0.5 rounded truncate font-medium mb-0.5 ${col.bg} ${col.text}`}
                                >
                                  {ev.summary}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DAY VIEW ── */}
            {viewMode === "day" && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {currentDate.toLocaleDateString("en-US", { weekday: "long" })}
                    </div>
                    <div className={`text-xl font-bold ${sameDay(currentDate, today) ? "text-blue-600" : "text-gray-800"}`}>
                      {currentDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <button
                    onClick={() => openCreate(currentDate)}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Event
                  </button>
                </div>

                {/* All-day events */}
                {getEventsForDate(currentDate).filter((ev) => !ev.start.dateTime).length > 0 && (
                  <div className="px-5 py-2 border-b border-gray-100">
                    <div className="text-xs text-gray-400 mb-1.5 font-medium">All Day</div>
                    <div className="space-y-1">
                      {getEventsForDate(currentDate)
                        .filter((ev) => !ev.start.dateTime)
                        .map((ev) => {
                          const col = getEventColors(ev)
                          return (
                            <div
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              className={`text-sm px-3 py-1.5 rounded-lg font-medium cursor-pointer ${col.bg} ${col.text} hover:opacity-80 transition-opacity`}
                            >
                              {ev.summary}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Time slots */}
                <div className="max-h-[560px] overflow-y-auto">
                  {hours.map((h) => {
                    const slotEvents = events.filter((ev) => {
                      if (!ev.start.dateTime) return false
                      const d = new Date(ev.start.dateTime)
                      return sameDay(d, currentDate) && d.getHours() === h
                    })
                    const isCurrentHour = sameDay(currentDate, today) && today.getHours() === h

                    return (
                      <div
                        key={h}
                        className={`flex gap-3 border-b border-gray-100 min-h-[56px] px-4 py-2 cursor-pointer transition-colors hover:bg-blue-50/30 ${isCurrentHour ? "bg-blue-50/50" : ""}`}
                        onClick={() => {
                          const d = new Date(currentDate)
                          d.setHours(h, 0, 0, 0)
                          openCreate(d)
                        }}
                      >
                        <div className="w-14 text-right text-xs text-gray-400 pt-1 shrink-0">
                          {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                          {isCurrentHour && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto mt-0.5" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          {slotEvents.map((ev) => {
                            const col = getEventColors(ev)
                            const start = new Date(ev.start.dateTime!)
                            const end = new Date(ev.end.dateTime || ev.start.dateTime!)
                            const duration = Math.round((end.getTime() - start.getTime()) / 60000)
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
                                className={`border-l-4 rounded-r-lg px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity ${col.border} ${col.bg}`}
                              >
                                <div className={`text-sm font-semibold ${col.text}`}>{ev.summary}</div>
                                <div className={`text-xs ${col.text} opacity-70`}>
                                  {formatTime(ev.start.dateTime)} • {duration >= 60 ? `${Math.floor(duration / 60)}h ` : ""}{duration % 60 > 0 ? `${duration % 60}m` : ""}
                                </div>
                                {ev.location && (
                                  <div className={`text-xs flex items-center gap-1 mt-0.5 ${col.text} opacity-60`}>
                                    <MapPin className="w-3 h-3" />{ev.location}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Event Type Legend ── */}
            <div className="flex flex-wrap gap-3 px-1">
              {Object.entries(EVENT_TYPE_COLORS).map(([type, col]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <span className="text-xs text-gray-500 capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right Sidebar ── */}
          <div className="space-y-4">

            {/* Selected Event Detail */}
            {selectedEvent ? (
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                {/* Color bar */}
                <div className={`h-1.5 w-full ${getEventColors(selectedEvent).dot}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-gray-900 leading-snug">{selectedEvent.summary}</h3>
                    <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-2.5 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <div>{formatDateLabel(getEventStartDate(selectedEvent) || new Date())}</div>
                        <div className="text-xs text-gray-400">
                          {selectedEvent.start.dateTime
                            ? `${formatTime(selectedEvent.start.dateTime)} – ${formatTime(selectedEvent.end.dateTime)}`
                            : "All day"}
                        </div>
                      </div>
                    </div>
                    {selectedEvent.location && (
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <span>{selectedEvent.location}</span>
                      </div>
                    )}
                    {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <Users className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                          {selectedEvent.attendees.slice(0, 4).map((a, i) => (
                            <div key={i} className="text-xs">{a.displayName || a.email}</div>
                          ))}
                          {selectedEvent.attendees.length > 4 && (
                            <div className="text-xs text-gray-400">+{selectedEvent.attendees.length - 4} more</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Tag className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="capitalize">{detectEventType(selectedEvent.summary)}</span>
                    </div>
                    {selectedEvent.description && (
                      <p className="text-sm text-gray-600 border-t border-gray-100 pt-3 leading-relaxed">{selectedEvent.description}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => openEdit(selectedEvent, e)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(selectedEvent.id)}
                      disabled={deletingEventId === selectedEvent.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingEventId === selectedEvent.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Upcoming Events List */
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 p-5">
                <h2 className="text-sm font-bold text-gray-800 mb-4">Upcoming Events</h2>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarIcon className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No upcoming events</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {upcomingEvents.map((ev) => {
                      const col = getEventColors(ev)
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className={`w-full text-left border-l-4 rounded-r-xl p-3 transition-all hover:shadow-sm ${col.border} ${col.bg}`}
                        >
                          <p className={`text-sm font-semibold truncate ${col.text}`}>{ev.summary}</p>
                          <p className={`text-xs mt-0.5 ${col.text} opacity-70`}>
                            {formatDateLabel(getEventStartDate(ev) || new Date())} • {formatTime(ev.start.dateTime, !ev.start.dateTime)}
                          </p>
                          {ev.location && (
                            <p className={`text-xs mt-0.5 flex items-center gap-1 ${col.text} opacity-60`}>
                              <MapPin className="w-3 h-3" />{ev.location}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Quick Add Button if viewing selected event */}
            {selectedEvent && (
              <button
                onClick={() => openCreate()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-600 text-sm font-medium rounded-xl border border-blue-100 hover:from-blue-100 hover:to-cyan-100 transition-colors"
              >
                <Plus className="w-4 h-4" /> Schedule Another Event
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
           Event Create / Edit Modal
          ══════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingEvent ? "Edit Event" : "Create New Event"}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingEvent(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Event Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                  placeholder="e.g. Team Standup, Midterm Exam…"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none resize-none"
                  rows={2}
                  placeholder="Notes or agenda…"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    placeholder="Room, building, or Google Meet link…"
                  />
                </div>
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, allDay: !formData.allDay })}
                  className={`relative w-10 h-6 rounded-full transition-colors ${formData.allDay ? "bg-blue-500" : "bg-gray-200"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.allDay ? "translate-x-5" : "translate-x-1"}`} />
                </button>
                <span className="text-sm text-gray-700">All day event</span>
              </div>

              {/* Start / End Times */}
              {!formData.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Start</label>
                    <input
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">End</label>
                    <input
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    />
                  </div>
                </div>
              )}
              {formData.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={formData.startTime.split("T")[0]}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value + "T00:00", endTime: e.target.value + "T23:59" })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={formData.endTime.split("T")[0]}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value + "T23:59" })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Attendees */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Invite Attendees
                </label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={formData.attendees}
                    onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm outline-none"
                    placeholder="email1@example.com, email2@example.com"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Separate multiple emails with commas</p>
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setShowModal(false); setEditingEvent(null) }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.title.trim()}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSaving ? (editingEvent ? "Saving…" : "Creating…") : (editingEvent ? "Save Changes" : "Create Event")}
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
