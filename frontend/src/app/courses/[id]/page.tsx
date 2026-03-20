'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import { io, Socket } from 'socket.io-client';
import ProgressBar from '@/components/ProgressBar';
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
    BarChart3,
    Sparkles,
    TrendingUp
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
    progress?: number;
    total_tasks?: number;
    completed_tasks?: number;
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

    // Editable fields for the modal
    const [modalGrade, setModalGrade] = useState('');
    const [modalDates, setModalDates] = useState<string[]>([]);
    const [modalNewDate, setModalNewDate] = useState('');
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // AI & Tab State
    const [user, setUser] = useState<any>(null);
    const [activeModalTab, setActiveModalTab] = useState<'discussion' | 'journals' | 'ai'>('discussion');
    const [journals, setJournals] = useState<any[]>([]);
    
    // Socket.io for real-time progress updates
    const [socket, setSocket] = useState<Socket | null>(null);
    
    // Inline AI Result State
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiResult, setAiResult] = useState<{ type: 'summary' | 'insights', content: string, cached?: boolean } | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);

    // Journal Entry Form State
    const [isJournalFormOpen, setIsJournalFormOpen] = useState(false);
    const [journalMilestone, setJournalMilestone] = useState('');
    const [journalType, setJournalType] = useState('Online Consultation');
    const [journalSummary, setJournalSummary] = useState('');
    const [journalAction, setJournalAction] = useState('');
    const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);

    const getSkyflowUrl = () => {
        const token = localStorage.getItem('auth_token');
        return token ? `http://localhost:3000/boards?token=${token}` : 'http://localhost:3000/boards';
    };

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try { 
            const decoded = jwtDecode(token); 
            setUser(decoded);
        } catch { 
            router.push('/login'); 
            return; 
        }
        fetchCourse(token);
        fetchGroups(token);

        // Initialize Socket.io connection for real-time progress updates
        const newSocket = io('http://localhost:5000', {
            transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => {
            console.log('🔌 Connected to ScholarSync backend for real-time updates');
        });

        newSocket.on('progressUpdated', (data: { 
            groupId: string; 
            progress: number; 
            totalTasks: number; 
            completedTasks: number;
        }) => {
            console.log('📊 Progress update received:', data);
            
            // Update the groups list with new progress
            setGroups(prevGroups => 
                prevGroups.map(group => 
                    group.id === data.groupId 
                        ? { 
                            ...group, 
                            progress: data.progress,
                            total_tasks: data.totalTasks,
                            completed_tasks: data.completedTasks
                          }
                        : group
                )
            );

            // Update selected group if it's the one that changed
            setSelectedGroup(prevSelected => 
                prevSelected && prevSelected.id === data.groupId
                    ? { 
                        ...prevSelected, 
                        progress: data.progress,
                        total_tasks: data.totalTasks,
                        completed_tasks: data.completedTasks
                      }
                    : prevSelected
            );
        });

        newSocket.on('disconnect', () => {
            console.log('🔌 Disconnected from ScholarSync backend');
        });

        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.close();
        };
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
        setActiveModalTab('discussion');
        setJournals([]);
        fetchComments(group.id);
        fetchGroupJournals(group.groupName);
        setAiResult(null);
        setAiError(null);
    };

    const closeModal = () => {
        setSelectedGroup(null);
        setComments([]);
        setJournals([]);
        setActiveModalTab('discussion');
        setAiResult(null);
        setAiError(null);
        resetJournalForm();
    };

    const resetJournalForm = () => {
        setIsJournalFormOpen(false);
        setJournalMilestone('');
        setJournalType('Online Consultation');
        setJournalSummary('');
        setJournalAction('');
        setIsSubmittingJournal(false);
    };

    const handleSubmitJournal = async () => {
        if (!journalMilestone || !journalSummary || !selectedGroup || !course) {
            alert("Milestone and Summary are required.");
            return;
        }

        setIsSubmittingJournal(true);
        try {
            const token = localStorage.getItem('auth_token');
            const data = {
                courseID: course.id,
                groupName: selectedGroup.groupName,
                conDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                conType: journalType,
                conMil: journalMilestone,
                conSum: journalSummary,
                conAction: journalAction,
                conAtt: "",
                isDraft: false,
                conStat: "On Track",
                conNotes: `Submitted by ${user?.email}`
            };

            const res = await fetch(`${API_URL}/api/consultations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                resetJournalForm();
                fetchGroupJournals(selectedGroup.groupName);
            } else {
                const errorData = await res.json();
                alert(errorData.error || "Failed to submit journal entry.");
            }
        } catch (err) {
            console.error("Journal Submission Error:", err);
            alert("An error occurred while submitting the journal.");
        } finally {
            setIsSubmittingJournal(false);
        }
    };

    const fetchGroupJournals = async (groupName: string) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/api/courses/${courseId}/consultations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const groupJournals = (data || []).filter((c: any) => c.groupName === groupName && !c.isDraft);
                setJournals(groupJournals);
            }
        } catch (err) {
            console.error("Error fetching journals:", err);
        }
    };

    const handleAIGenerate = async (type: 'summary' | 'participation', forceRefresh = false) => {
        if (!selectedGroup || !course) return;
        setGeneratingAI(true);
        setAiError(null);
        setAiResult(null);
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setAiError("Authentication token not found.");
                return;
            }
            
            let response;
            if (type === 'summary') {
                const context = journals.map(j => `${j.conMil}: ${j.conSum}`).join('\n');
                const res = await fetch(`${API_URL}/api/ai/summary`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ 
                        context,
                        courseID: course.id,
                        groupName: selectedGroup.groupName,
                        forceRefresh 
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
                }
                response = await res.json();
                setAiResult({ type: 'summary', content: response.summary, cached: response.cached });
            } else {
                const lastJournal = journals[0];
                if (!lastJournal) throw new Error("No journals found for participation analysis.");
                const res = await fetch(`${API_URL}/api/ai/participation`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ 
                        conID: lastJournal.conID,
                        courseID: course.id,
                        groupName: selectedGroup.groupName,
                        forceRefresh 
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
                }
                response = await res.json();
                setAiResult({ type: 'insights', content: response.insight, cached: response.cached });
            }
        } catch (err: any) {
            console.error("AI Generation Error:", err);
            setAiError(err.message || "An unexpected error occurred during AI generation.");
        } finally {
            setGeneratingAI(false);
        }
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

    const formatName = (name: string) => {
        if (!name) return '—';
        return name;
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
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.push('/courses')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
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
                </div>

                {groups.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-medium text-gray-500">No groups yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {groups.map((group) => (
                            <div
                                key={group.id}
                                onClick={() => openGroup(group)}
                                className="group relative bg-white border border-gray-200 rounded-2xl p-6 cursor-pointer hover:-translate-y-1 hover:border-blue-400 hover:shadow-xl transition-all duration-300"
                            >
                                <div className="text-[13px] font-semibold text-blue-500 uppercase tracking-widest mb-1">
                                    TEAM {String(group.team_number).padStart(2, '0')}
                                </div>
                                <div className="text-lg font-bold text-slate-800 mb-4 truncate">{group.groupName}</div>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2">
                                        <Award size={14} className="text-amber-500" />
                                        <span className="text-sm text-slate-600 truncate">{group.adviser || 'No Adviser'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Users size={14} className="text-cyan-600" />
                                        <span className="text-sm text-slate-600">{group.members?.length || group.groupMembers} Members</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selectedGroup && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div className="flex flex-col gap-4">
                                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                                    <Hash className="w-6 h-6 text-blue-600" />
                                    {selectedGroup.groupName}
                                </h2>
                                <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-2xl w-fit border border-gray-100">
                                    {['discussion', 'journals', 'ai'].map((tab) => {
                                        if (tab === 'ai' && !(user?.role === 'Admin' || user?.role === 'Advisers')) return null;
                                        return (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveModalTab(tab as any)}
                                                className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeModalTab === tab ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/[0.05]' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                {tab === 'ai' ? 'AI Tools' : tab}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-2xl transition-colors">
                                <X className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {activeModalTab === 'discussion' ? (
                                <div className="grid grid-cols-12 divide-x divide-gray-100 h-full">
                                    <div className="col-span-4 p-8">
                                        <div className="flex items-center gap-2 mb-6">
                                            <Users className="w-4 h-4 text-blue-500" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Team Roster</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {selectedGroup.members?.map((member) => (
                                                <div key={member.email} className="flex items-center gap-3 group/member">
                                                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-blue-600 font-bold border border-gray-100 group-hover/member:bg-blue-50 transition-colors">
                                                        {member.member_number}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5 uppercase tracking-tight">
                                                            {member.name}
                                                            {member.is_leader && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400 truncate font-medium">{member.email}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="col-span-8 p-8 flex flex-col bg-gray-50/30">
                                        <div className="flex items-center gap-2 mb-6">
                                            <MessageSquare className="w-4 h-4 text-green-500" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Activity & Feedback</h3>
                                        </div>
                                        <div className="flex-1 overflow-y-auto mb-6 space-y-4 pr-2">
                                            {comments.length === 0 ? (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3 italic">
                                                    <MessageSquare className="w-8 h-8 opacity-20" />
                                                    <p className="text-sm">No discussion history found for this group.</p>
                                                </div>
                                            ) : (
                                                comments.map(c => (
                                                    <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">{c.user_name}</span>
                                                            <span className="text-[10px] text-gray-400 font-bold">{new Date(c.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-700 font-medium leading-relaxed">{c.content}</p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        <div className="flex gap-3 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
                                            <input 
                                                value={newComment}
                                                onChange={e => setNewComment(e.target.value)}
                                                placeholder="Type a message or feedback..."
                                                className="flex-1 px-4 py-2 text-sm focus:outline-none placeholder-gray-300 font-medium"
                                            />
                                            <button 
                                                onClick={submitComment}
                                                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 active:scale-95"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : activeModalTab === 'journals' ? (
                                <div className="p-8">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                                                <BookOpen className="w-6 h-6 text-blue-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Consultation Journals</h3>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">{journals.length} Logs Available</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setIsJournalFormOpen(true)}
                                            className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-95 flex items-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            New Progress Log
                                        </button>
                                    </div>

                                    {/* Real-Time Progress Bar from SkyFlow */}
                                    <div className="mb-8 p-6 bg-gradient-to-br from-blue-50/50 to-cyan-50/50 rounded-3xl border border-blue-100/50 backdrop-blur-sm">
                                        <ProgressBar 
                                            progress={selectedGroup.progress || 0}
                                            totalTasks={selectedGroup.total_tasks}
                                            completedTasks={selectedGroup.completed_tasks}
                                        />
                                        <p className="text-xs text-gray-500 mt-3 text-center italic">
                                            Synced in real-time from SkyFlow project tasks
                                        </p>
                                    </div>

                                    {isJournalFormOpen && (
                                        <div className="mb-8 p-8 bg-blue-50/30 border-2 border-dashed border-blue-200 rounded-[32px] animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-blue-100">
                                                <h4 className="font-black text-blue-900 uppercase tracking-tight text-lg">New Journal Entry</h4>
                                                <button onClick={resetJournalForm} className="p-2 hover:bg-blue-100 rounded-full transition-colors">
                                                    <X className="w-4 h-4 text-blue-400" />
                                                </button>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Milestone / Focus</label>
                                                    <input 
                                                        value={journalMilestone}
                                                        onChange={e => setJournalMilestone(e.target.value)}
                                                        placeholder="e.g. Design Phase Update"
                                                        className="w-full px-5 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder-gray-300 font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Consultation Mode</label>
                                                    <select 
                                                        value={journalType}
                                                        onChange={e => setJournalType(e.target.value)}
                                                        className="w-full px-5 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 font-bold appearance-none shadow-sm"
                                                    >
                                                        <option>Online Consultation</option>
                                                        <option>Face-to-Face Meeting</option>
                                                        <option>Status Report Only</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-2 mb-6">
                                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Accomplishments & Summary</label>
                                                <textarea 
                                                    value={journalSummary}
                                                    onChange={e => setJournalSummary(e.target.value)}
                                                    rows={4}
                                                    placeholder="Detail the progress made during this period..."
                                                    className="w-full px-6 py-4 bg-white border border-blue-100 rounded-[24px] text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder-gray-300 font-medium resize-none shadow-sm shadow-blue-50"
                                                />
                                            </div>

                                            <div className="space-y-2 mb-8">
                                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Action Items / Future Goals</label>
                                                <input 
                                                    value={journalAction}
                                                    onChange={e => setJournalAction(e.target.value)}
                                                    placeholder="What will the team focus on next?"
                                                    className="w-full px-5 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder-gray-300 font-bold"
                                                />
                                            </div>

                                            <div className="flex justify-end gap-4">
                                                <button onClick={resetJournalForm} className="px-8 py-3 text-xs font-black uppercase tracking-widest text-blue-400 hover:text-blue-600 transition-colors">Discard</button>
                                                <button 
                                                    onClick={handleSubmitJournal}
                                                    disabled={isSubmittingJournal || !journalMilestone || !journalSummary}
                                                    className="px-10 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50 shadow-xl shadow-blue-100 flex items-center gap-2"
                                                >
                                                    {isSubmittingJournal ? 'Posting...' : 'Save Journal Log'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                                        {journals.length === 0 && !isJournalFormOpen ? (
                                            <div className="col-span-full py-20 bg-gray-50 rounded-[40px] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center gap-4">
                                                <BookOpen className="w-12 h-12 text-gray-200" />
                                                <div>
                                                    <p className="font-black text-gray-400 uppercase tracking-widest">No Journals Yet</p>
                                                    <p className="text-xs text-gray-400 mt-1 max-w-xs font-medium">Be the first to log progress! Click "New Progress Log" to start tracking accomplishments.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            journals.map((journal: any) => (
                                                <div key={journal.conID} className="bg-white border border-gray-100 rounded-[32px] p-8 hover:border-blue-400 transition-all hover:shadow-2xl hover:shadow-blue-50 group/log relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover/log:opacity-[0.08] transition-opacity">
                                                        <BookOpen className="w-20 h-20" />
                                                    </div>
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div>
                                                            <h4 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">{journal.conMil}</h4>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{journal.conType}</span>
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">{journal.conDate}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-6">
                                                        <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-50">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Accomplishments</p>
                                                            <p className="text-sm text-gray-600 leading-relaxed font-medium line-clamp-4">{journal.conSum}</p>
                                                        </div>
                                                        {journal.conAction && (
                                                            <div className="px-6">
                                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Next Steps</p>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-1 h-1 rounded-full bg-blue-400" />
                                                                    <p className="text-xs text-blue-600 font-bold">{journal.conAction}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-12 h-full flex flex-col items-center justify-center text-center">
                                    {!aiResult ? (
                                        <div className="max-w-xl animate-in fade-in zoom-in-95 duration-500">
                                            <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-cyan-400 text-white rounded-[32px] flex items-center justify-center mb-8 shadow-2xl shadow-blue-200 ring-8 ring-blue-50 mx-auto">
                                                <Sparkles className="w-12 h-12" />
                                            </div>
                                            <h3 className="text-3xl font-black text-gray-900 mb-3 uppercase tracking-tight">AI Academic Intelligence</h3>
                                            <p className="text-gray-500 text-lg mb-12 font-medium">Synthesize progress and analyze group participation with state-of-the-art AI.</p>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                                <button onClick={() => handleAIGenerate('summary')} disabled={generatingAI || journals.length === 0} className="group bg-white border-2 border-gray-100 p-8 rounded-[40px] hover:border-blue-400 hover:shadow-2xl transition-all flex flex-col items-center gap-5 disabled:opacity-50">
                                                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><BookOpen className="w-8 h-8" /></div>
                                                    <div className="text-center">
                                                        <span className="block font-black text-gray-900 uppercase tracking-tight text-xl mb-1">Synthesis</span>
                                                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">{journals.length} Data Points</span>
                                                    </div>
                                                </button>
                                                <button onClick={() => handleAIGenerate('participation')} disabled={generatingAI || journals.length === 0} className="group bg-white border-2 border-gray-100 p-8 rounded-[40px] hover:border-purple-400 hover:shadow-2xl transition-all flex flex-col items-center gap-5 disabled:opacity-50">
                                                    <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><TrendingUp className="w-8 h-8" /></div>
                                                    <div className="text-center">
                                                        <span className="block font-black text-gray-900 uppercase tracking-tight text-xl mb-1">Participation</span>
                                                        <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest bg-purple-50 px-3 py-1 rounded-full">Member Insight</span>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                                            <div className="bg-white border-2 border-gray-100 rounded-[48px] p-12 shadow-2xl shadow-blue-100 relative overflow-hidden">
                                                <div className="flex items-center justify-between mb-12 pb-8 border-b border-gray-100">
                                                    <div className="flex items-center gap-5">
                                                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-inner ${aiResult.type === 'summary' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                                            {aiResult.type === 'summary' ? <BookOpen className="w-8 h-8" /> : <TrendingUp className="w-8 h-8" />}
                                                        </div>
                                                        <div className="text-left">
                                                            <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight mb-1">{aiResult.type === 'summary' ? 'Academic Synthesis' : 'Participation Insight'}</h3>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Analysis Complete</span>
                                                                {aiResult.cached && <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-600 px-3 py-1 rounded-full border border-amber-200">Cached Intelligence</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleAIGenerate(aiResult.type as any, true)} disabled={generatingAI} className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center gap-3 shadow-2xl shadow-gray-200">
                                                        <Sparkles className={`w-4 h-4 text-cyan-400 ${generatingAI ? 'animate-spin' : ''}`} />
                                                        {generatingAI ? 'Re-analyzing...' : 'Refresh Insights'}
                                                    </button>
                                                </div>
                                                <div className="text-left text-gray-700 leading-loose text-lg font-medium whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-900">
                                                    {aiResult.content}
                                                </div>
                                                <button onClick={() => setAiResult(null)} className="mt-16 flex items-center gap-3 mx-auto px-8 py-3 rounded-full border border-gray-100 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:bg-gray-50 transition-all active:scale-95">
                                                    <ArrowLeft className="w-4 h-4" /> Go Back
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {generatingAI && !aiResult && (
                                        <div className="flex flex-col items-center gap-6 mt-8">
                                            <div className="w-16 h-16 border-[6px] border-blue-600 border-t-transparent rounded-full animate-spin shadow-xl shadow-blue-50"></div>
                                            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-600 animate-pulse">Processing Academic Data...</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-10 py-8 bg-white border-t border-gray-100 flex items-center justify-between">
                            <a href={getSkyflowUrl()} className="text-blue-600 font-black text-[11px] uppercase tracking-[0.25em] underline underline-offset-8 decoration-2 decoration-blue-200 hover:text-blue-700 transition-colors">
                                View Full Analytics in SkyFlow
                            </a>
                            <button onClick={closeModal} className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-blue-200 transition-all active:scale-95">
                                Dismiss Modal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SidebarLayout>
    );
}
