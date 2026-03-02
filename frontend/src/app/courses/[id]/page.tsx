'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import {
    ArrowLeft,
    Users,
    ExternalLink,
    Loader2,
    BookOpen,
    User,
    CalendarDays,
    MessageSquare,
    Star,
    Shield,
    Hash,
    X,
    Plus,
    Trash2,
} from 'lucide-react';

type Course = {
    id: number;
    courseName: string;
    courseCode: string;
    courseKey: string;
    courseSection: string;
    courseAdviser: string;
    courseTerm: string;
};

type GroupMember = {
    member_number: number;
    name: string;
    email: string;
    is_leader: boolean;
};

type Group = {
    groupID: number;
    groupName: string;
    groupMembers: number;
    courseID: number;
    members: GroupMember[];
    adviser: string;
    proposed_project: string;
    consultation_dates: string[];
    comments: string;
    grade: string;
};

export default function CourseDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.id as string;

    const [course, setCourse] = useState<Course | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal state
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

    // Editable fields for the modal (local state per group)
    const [modalGrade, setModalGrade] = useState('');
    const [modalDates, setModalDates] = useState<string[]>([]);
    const [modalNewDate, setModalNewDate] = useState('');
    const [modalComments, setModalComments] = useState('');

    const skyflowUrl = 'http://localhost:3001';

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try { jwtDecode(token); } catch { router.push('/login'); return; }
        fetchCourse(token);
        fetchGroups(token);
    }, [courseId, router]);

    const fetchCourse = async (token: string) => {
        try {
            const res = await fetch(`${API_URL}/api/courses/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setCourse(await res.json());
            else setError('Course not found');
        } catch { setError('Failed to load course'); }
    };

    const fetchGroups = async (token: string) => {
        try {
            const res = await fetch(`${API_URL}/api/courses/${courseId}/group-members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data: Group[] = await res.json();
                setGroups(data);
            }
        } catch { /* empty */ }
        finally { setLoading(false); }
    };

    const openGroup = (group: Group) => {
        setSelectedGroup(group);
        setModalGrade(group.grade || '');
        setModalDates(Array.isArray(group.consultation_dates) ? group.consultation_dates : []);
        setModalComments(group.comments || '');
        setModalNewDate('');
    };

    const closeModal = () => {
        setSelectedGroup(null);
    };

    const addConsultDate = () => {
        if (modalNewDate && !modalDates.includes(modalNewDate)) {
            setModalDates(prev => [...prev, modalNewDate].sort());
            setModalNewDate('');
        }
    };

    const removeDate = (dateToRemove: string) => {
        setModalDates(prev => prev.filter(d => d !== dateToRemove));
    };

    const formatName = (name: string) => {
        if (!name) return '—';
        return name;
    };

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch { return dateStr; }
    };

    if (loading) {
        return (
            <SidebarLayout>
                <div className="flex items-center justify-center h-[60vh]">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                </div>
            </SidebarLayout>
        );
    }

    if (error || !course) {
        return (
            <SidebarLayout>
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-gray-400">
                    <BookOpen className="w-14 h-14 opacity-30" />
                    <p className="text-lg font-medium">{error || 'Course not found'}</p>
                    <button onClick={() => router.push('/courses')} className="px-5 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-600 transition">
                        ← Back to Courses
                    </button>
                </div>
            </SidebarLayout>
        );
    }

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* ── BACK + HEADER ── */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => router.push('/courses')}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                                {course.courseName}
                            </h1>
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full">
                                {course.courseCode}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">{course.courseTerm}</p>
                    </div>
                    <a
                        href={skyflowUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
                    >
                        <ExternalLink className="w-4 h-4" /> View in SkyFlow
                    </a>
                </div>

                {/* ── GROUP BUTTONS GRID ── */}
                {groups.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium text-gray-500">No groups yet</p>
                        <p className="text-sm mt-1">Import a sheet from Workspace Sync to populate groups</p>
                        <button
                            onClick={() => router.push('/workspace-sync')}
                            className="mt-4 px-5 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
                        >
                            Go to Workspace Sync
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="text-base font-bold text-gray-700 flex items-center gap-2 mb-4">
                            <Users className="w-4 h-4 text-blue-500" />
                            {groups.length} Group{groups.length !== 1 ? 's' : ''} — click to view details
                        </h2>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {groups.map((group) => (
                                <button
                                    key={group.groupID}
                                    onClick={() => openGroup(group)}
                                    className="group bg-white hover:bg-gradient-to-br hover:from-blue-50 hover:to-cyan-50 border border-gray-200 hover:border-blue-300 rounded-2xl p-4 text-left transition-all duration-200 hover:shadow-md"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
                                            <Hash className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="font-bold text-gray-800 text-sm">{group.groupName}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                        <User className="w-3 h-3" />
                                        <span>{group.members?.length || group.groupMembers} members</span>
                                    </div>
                                    {group.adviser && (
                                        <div className="flex items-center gap-1 text-xs text-blue-500 mt-1">
                                            <Shield className="w-3 h-3" />
                                            <span className="truncate">{group.adviser}</span>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* ──── MODAL POPUP ──── */}
            {/* ═══════════════════════════════════════════════════ */}
            {selectedGroup && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                        {/* ── MODAL HEADER ── */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <Hash className="w-5 h-5 text-blue-500" />
                                    {selectedGroup.groupName}
                                    <span className="text-sm font-normal text-gray-400">— {course.courseCode}</span>
                                </h2>
                            </div>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl transition">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* ── GRADE + ADVISER ROW ── */}
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                                        Grade
                                    </label>
                                    <input
                                        type="text"
                                        value={modalGrade}
                                        onChange={e => setModalGrade(e.target.value)}
                                        placeholder="e.g. 1.25"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                                        Adviser Name (Detected from Sheets)
                                    </label>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-xl">
                                        <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                        <span className="text-sm font-semibold text-gray-800">
                                            {selectedGroup.adviser || course.courseAdviser || 'Not set'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── 3-COLUMN TABLE ── */}
                        <div className="grid grid-cols-12 divide-x divide-gray-200 min-h-[350px]">

                            {/* ── Column 1: Team Number + Members ── */}
                            <div className="col-span-4 p-5">
                                <div className="flex items-center gap-1.5 mb-4">
                                    <User className="w-4 h-4 text-blue-500" />
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Team Members</h3>
                                </div>
                                {(!selectedGroup.members || selectedGroup.members.length === 0) ? (
                                    <p className="text-sm text-gray-400 italic">No members found</p>
                                ) : (
                                    <div className="space-y-3">
                                        {selectedGroup.members.map((member) => (
                                            <div key={member.member_number} className="flex items-start gap-3">
                                                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    {member.member_number}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1">
                                                        {formatName(member.name)}
                                                        {member.is_leader && (
                                                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" title="Team Lead" />
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Column 2: Consultation Dates (with date picker) ── */}
                            <div className="col-span-4 p-5">
                                <div className="flex items-center gap-1.5 mb-4">
                                    <CalendarDays className="w-4 h-4 text-purple-500" />
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Consultation Dates</h3>
                                </div>

                                {/* Date list */}
                                <div className="space-y-2 mb-4">
                                    {modalDates.length === 0 && (
                                        <p className="text-sm text-gray-300 italic">No dates added yet</p>
                                    )}
                                    {modalDates.map((date) => (
                                        <div key={date} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <CalendarDays className="w-3.5 h-3.5 text-purple-400" />
                                                <span className="text-sm text-gray-700">{formatDate(date)}</span>
                                            </div>
                                            <button onClick={() => removeDate(date)} className="p-1 hover:bg-purple-100 rounded-lg transition">
                                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add date picker */}
                                <div className="flex gap-2">
                                    <input
                                        type="date"
                                        value={modalNewDate}
                                        onChange={e => setModalNewDate(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-gray-50"
                                    />
                                    <button
                                        onClick={addConsultDate}
                                        disabled={!modalNewDate}
                                        className="px-3 py-2 bg-purple-500 text-white rounded-xl text-sm hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Add
                                    </button>
                                </div>
                            </div>

                            {/* ── Column 3: Comments ── */}
                            <div className="col-span-4 p-5">
                                <div className="flex items-center gap-1.5 mb-4">
                                    <MessageSquare className="w-4 h-4 text-green-500" />
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Comments</h3>
                                </div>

                                {selectedGroup.proposed_project && (
                                    <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl">
                                        <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Proposed Project</p>
                                        <p className="text-sm text-gray-700">{selectedGroup.proposed_project}</p>
                                    </div>
                                )}

                                <textarea
                                    value={modalComments}
                                    onChange={e => setModalComments(e.target.value)}
                                    placeholder="Add comments about this group..."
                                    rows={8}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 bg-gray-50 resize-none placeholder-gray-300 leading-relaxed"
                                />
                            </div>
                        </div>

                        {/* ── MODAL FOOTER ── */}
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                            <a
                                href={skyflowUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-500 hover:text-blue-700 underline flex items-center gap-1"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> View detailed progress in SkyFlow
                            </a>
                            <button
                                onClick={closeModal}
                                className="px-5 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SidebarLayout>
    );
}
