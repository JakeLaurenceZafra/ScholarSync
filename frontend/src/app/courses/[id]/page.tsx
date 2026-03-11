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
    Send,
    Award,
    BarChart3
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
    id: string;
    groupName: string;
    groupMembers: number;
    team_number: number;
    courseID: number;
    members: GroupMember[];
    adviser: string;
    proposed_project: string;
    consultation_dates: string[];
    comments: string;
    grade: string;
};

type Comment = {
    id: string;
    user_name: string;
    content: string;
    created_at: string;
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
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    const skyflowUrl = 'http://localhost:3000/boards';

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
        setNewComment('');
        setModalNewDate('');
        fetchComments(group.id);
    };

    const closeModal = () => {
        setSelectedGroup(null);
        setComments([]);
    };

    const fetchComments = async (groupId: string) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/api/team-groups/${groupId}/comments`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setComments(await res.json());
        } catch { /* ignore */ }
    };

    const submitComment = async () => {
        if (!newComment.trim() || !selectedGroup || submittingComment) return;
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        setSubmittingComment(true);
        try {
            const res = await fetch(`${API_URL}/api/team-groups/${selectedGroup.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ content: newComment.trim() })
            });
            if (res.ok) {
                const saved = await res.json();
                setComments(prev => [...prev, saved]);
                setNewComment('');
            }
        } catch { /* ignore */ }
        finally { setSubmittingComment(false); }
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

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
                            {groups.map((group) => {
                                const teamNumber = group.team_number || group.groupName.replace('Group ', '') || 0;
                                const proposedProject = group.proposed_project || '';
                                const adviserName = group.adviser || 'TBI';
                                const memberCount = group.members?.length || group.groupMembers || 0;
                                
                                // Placeholders to match requested design
                                const progress = 0; 
                                const status = 'active';

                                const statusColors: Record<string, string> = { active: 'rgba(34, 197, 94, 0.12)', completed: 'rgba(59, 130, 246, 0.12)', archived: 'rgba(156, 163, 175, 0.12)' };
                                const statusTextColors: Record<string, string> = { active: '#16a34a', completed: '#2563eb', archived: '#6b7280' };
                                const progressColor = progress >= 75 ? '#16a34a' : progress >= 40 ? '#d97706' : '#dc2626';

                                return (
                                    <div
                                        key={group.id}
                                        onClick={() => openGroup(group)}
                                        className="group/card relative bg-white border border-gray-200 rounded-[16px] p-6 cursor-pointer overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:border-indigo-400 hover:shadow-[0_12px_40px_rgba(99,102,241,0.12)] transition-all duration-300"
                                    >
                                        {/* Gradient top accent */}
                                        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${progressColor}, rgba(99, 102, 241, 0.6))` }} />
                                        
                                        {/* Header */}
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex flex-col">
                                                <div className="text-[13px] font-semibold text-indigo-500 uppercase tracking-widest mb-1">
                                                    TEAM {String(teamNumber).padStart(2, '0')}
                                                </div>
                                                <div className="text-[18px] font-bold text-slate-800 leading-tight mb-0.5">
                                                    {proposedProject || group.groupName}
                                                </div>
                                                {proposedProject && (
                                                    <div className="text-[12px] font-medium text-slate-400">
                                                        {group.groupName}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 ml-2" style={{ background: statusColors[status], color: statusTextColors[status] }}>
                                               {status}
                                            </span>
                                        </div>

                                        {/* Info rows */}
                                        <div className="flex flex-col gap-2.5 mb-5 mt-2">
                                            <div className="flex items-center gap-2">
                                                <Award size={14} className="text-amber-500 shrink-0" />
                                                <span className="text-[13px] text-slate-500">Adviser:</span>
                                                <span className="text-[13px] text-slate-800 font-medium">{adviserName}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users size={14} className="text-cyan-600 shrink-0" />
                                                <span className="text-[13px] text-slate-500">Members:</span>
                                                <span className="text-[13px] text-slate-800 font-medium">{memberCount}</span>
                                            </div>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="mt-auto">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <BarChart3 size={13} className="text-slate-500" />
                                                    <span className="text-[12px] text-slate-500 font-medium">Progress</span>
                                                </div>
                                                <span className="text-[12px] font-bold" style={{ color: progressColor }}>
                                                    {progress}%
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${progressColor}, ${progressColor}cc)` }} />
                                            </div>
                                            <div className="text-[11px] font-medium text-slate-400 mt-2">
                                                0/0 checkpoints
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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
                            <div className="col-span-12 md:col-span-5 p-5">
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
                                                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Column 2: Comments / Discussion ── */}
                            <div className="col-span-12 md:col-span-7 p-5 flex flex-col">
                                <div className="flex items-center gap-1.5 mb-4">
                                    <MessageSquare className="w-4 h-4 text-green-500" />
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discussion</h3>
                                    <span className="text-xs text-gray-300 ml-auto">synced with SkyFlow</span>
                                </div>

                                {selectedGroup.proposed_project && (
                                    <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl">
                                        <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Proposed Project</p>
                                        <p className="text-sm text-gray-700">{selectedGroup.proposed_project}</p>
                                    </div>
                                )}

                                {/* Comment thread */}
                                <div className="flex-1 overflow-y-auto mb-3 space-y-3 max-h-[280px] min-h-[120px]">
                                    {comments.length === 0 && (
                                        <p className="text-sm text-gray-300 italic text-center py-6">No comments yet. Start the discussion!</p>
                                    )}
                                    {comments.map(c => (
                                        <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-blue-600">{c.user_name}</span>
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                                                    {new Date(c.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700 leading-relaxed">{c.content}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Comment input */}
                                <div className="flex gap-2">
                                    <input
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                                        placeholder="Write a comment..."
                                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 bg-gray-50 placeholder-gray-300"
                                    />
                                    <button
                                        onClick={submitComment}
                                        disabled={!newComment.trim() || submittingComment}
                                        className="px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
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
