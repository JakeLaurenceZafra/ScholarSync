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
    BarChart3,
    Sparkles,
    TrendingUp,
    ClipboardList,
    ChevronDown,
    Folder,
    FileText
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

const sanitizeAIContent = (text: string) =>
    (text || '').replace(/[\*#]+/g, '').replace(/\n{3,}/g, '\n\n').trim();

type ConsultationLog = {
    conID?: number;
    conDate?: string;
    conMil?: string;
    conSum?: string;
    conAction?: string;
    conConcerns?: string;
    adviser_notes?: string;
    attendance_data?: Record<string, string>;
    participation_data?: Record<string, string>;
    submitted_at?: string;
    updated_at?: string;
    created_at?: string;
    status?: string;
};

type MemberJournal = {
    id: number;
    courseID: number;
    groupName: string;
    member_email: string;
    journal_date: string;
    task_updates: string[];
    action_plans: string[];
    issues: string[];
    minutes_date?: string | null;
    minutes_adviser?: string | null;
    minutes_key_points?: string | null;
    minutes_action_items?: string | null;
    minutes_action_deadlines?: string | null;
    next_consultation?: string | null;
    created_at?: string;
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
    const [activeModalTab, setActiveModalTab] = useState<'discussion' | 'journals' | 'consultations' | 'ai'>('discussion');
    const [journals, setJournals] = useState<any[]>([]);
    const [consultationLogs, setConsultationLogs] = useState<ConsultationLog[]>([]);
    const [expandedConsultationId, setExpandedConsultationId] = useState<number | null>(null);
    const [memberJournals, setMemberJournals] = useState<MemberJournal[]>([]);
    const [loadingMemberJournals, setLoadingMemberJournals] = useState(false);
    const [selectedMemberFolder, setSelectedMemberFolder] = useState<{ email: string; name: string } | null>(null);
    const [expandedMemberJournalId, setExpandedMemberJournalId] = useState<number | null>(null);
    
    // Inline AI Result State
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiResult, setAiResult] = useState<{ type: 'summary' | 'insights', content: string, cached?: boolean } | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);

    // Course-level Admin AI analysis
    const [isCustomAnalysisOpen, setIsCustomAnalysisOpen] = useState(false);
    const [customInstruction, setCustomInstruction] = useState('');
    const [customAnalysisLoading, setCustomAnalysisLoading] = useState(false);
    const [customAnalysisResult, setCustomAnalysisResult] = useState('');
    const [customAnalysisError, setCustomAnalysisError] = useState<string | null>(null);

    // Journal Entry Form State
    const [isJournalFormOpen, setIsJournalFormOpen] = useState(false);
    const [journalMilestone, setJournalMilestone] = useState('');
    const [journalType, setJournalType] = useState('Online Consultation');
    const [journalSummary, setJournalSummary] = useState('');
    const [journalAction, setJournalAction] = useState('');
    const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
    const [memberJournalForm, setMemberJournalForm] = useState({
        journalDate: '',
        taskUpdates: '',
        actionPlans: '',
        issues: '',
        minutesDate: '',
        minutesAdviser: '',
        minutesKeyPoints: '',
        minutesActionItems: '',
        minutesActionDeadlines: '',
        nextConsultation: ''
    });
    const [submittingMemberJournal, setSubmittingMemberJournal] = useState(false);
    const [memberJournalError, setMemberJournalError] = useState<string | null>(null);

    const skyflowUrl = 'http://localhost:3000/boards';

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
        setConsultationLogs([]);
        fetchComments(group.id);
        fetchGroupJournals(group.groupName);
        fetchConsultationLogs(group.id);
        fetchMemberJournals(group.id);
        setAiResult(null);
        setAiError(null);
    };

    const closeModal = () => {
        setSelectedGroup(null);
        setComments([]);
        setJournals([]);
        setConsultationLogs([]);
        setExpandedConsultationId(null);
        setMemberJournals([]);
        setSelectedMemberFolder(null);
        setExpandedMemberJournalId(null);
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

    const fetchConsultationLogs = async (groupId: string) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/api/consultation/group/${groupId}/logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConsultationLogs(data.logs || []);
            } else {
                setConsultationLogs([]);
            }
        } catch (err) {
            console.error("Error fetching consultation logs:", err);
            setConsultationLogs([]);
        }
    };

    const fetchMemberJournals = async (groupId: string) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        setLoadingMemberJournals(true);
        try {
            const res = await fetch(`${API_URL}/api/member-journals/course/${courseId}/group/${groupId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMemberJournals(data.journals || []);
            } else {
                setMemberJournals([]);
            }
        } catch (err) {
            console.error('Error fetching member journals:', err);
            setMemberJournals([]);
        } finally {
            setLoadingMemberJournals(false);
        }
    };

    const handleSubmitMemberJournal = async () => {
        if (!course || !selectedGroup || !selectedMemberFolder) return;
        if (!memberJournalForm.journalDate) {
            setMemberJournalError('Journal date is required.');
            return;
        }

        const toArray = (value: string) =>
            value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);

        setSubmittingMemberJournal(true);
        setMemberJournalError(null);
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setMemberJournalError('Authentication token not found.');
                return;
            }

            const res = await fetch(`${API_URL}/api/member-journals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    courseID: course.id,
                    groupID: selectedGroup.id,
                    member_email: selectedMemberFolder.email,
                    journal_date: memberJournalForm.journalDate,
                    task_updates: toArray(memberJournalForm.taskUpdates),
                    action_plans: toArray(memberJournalForm.actionPlans),
                    issues: toArray(memberJournalForm.issues),
                    minutes_date: memberJournalForm.minutesDate || null,
                    minutes_adviser: memberJournalForm.minutesAdviser || null,
                    minutes_key_points: memberJournalForm.minutesKeyPoints || null,
                    minutes_action_items: memberJournalForm.minutesActionItems || null,
                    minutes_action_deadlines: memberJournalForm.minutesActionDeadlines || null,
                    next_consultation: memberJournalForm.nextConsultation || null
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to create member journal.');
            }

            setMemberJournalForm({
                journalDate: '',
                taskUpdates: '',
                actionPlans: '',
                issues: '',
                minutesDate: '',
                minutesAdviser: '',
                minutesKeyPoints: '',
                minutesActionItems: '',
                minutesActionDeadlines: '',
                nextConsultation: ''
            });
            setIsJournalFormOpen(false);
            await fetchMemberJournals(selectedGroup.id);
        } catch (err: any) {
            console.error('Error creating member journal:', err);
            setMemberJournalError(err.message || 'Failed to create member journal.');
        } finally {
            setSubmittingMemberJournal(false);
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

            const sortedConsultationLogs = [...consultationLogs].sort((a, b) => {
                const left = new Date(a.submitted_at || a.updated_at || a.created_at || a.conDate || 0).getTime();
                const right = new Date(b.submitted_at || b.updated_at || b.created_at || b.conDate || 0).getTime();
                return right - left;
            });

            const consultationHistory = sortedConsultationLogs
                .map((log, idx) => {
                    const attendanceSummary = log.attendance_data
                        ? Object.entries(log.attendance_data)
                              .map(([member, status]) => `${member}: ${status}`)
                              .join(', ')
                        : '';
                    const participationSummary = log.participation_data
                        ? Object.entries(log.participation_data)
                              .map(([member, rating]) => `${member}: ${rating}`)
                              .join(', ')
                        : '';

                    return [
                        `Consultation #${idx + 1}`,
                        `Date: ${log.conDate || '-'}`,
                        `Milestone: ${log.conMil || '-'}`,
                        `Summary: ${log.conSum || '-'}`,
                        `Action Items: ${log.conAction || '-'}`,
                        `Concerns: ${log.conConcerns || '-'}`,
                        `Adviser Notes: ${log.adviser_notes || '-'}`,
                        `Attendance: ${attendanceSummary || '-'}`,
                        `Participation: ${participationSummary || '-'}`
                    ].join('\n');
                })
                .join('\n\n');
            
            let response;
            if (type === 'summary') {
                const summaryConsultationHistory = sortedConsultationLogs
                    .map((log, idx) => [
                        `Consultation #${idx + 1}`,
                        `Date: ${log.conDate || '-'}`,
                        `Milestone: ${log.conMil || '-'}`,
                        `Summary: ${log.conSum || '-'}`,
                        `Action Items: ${log.conAction || '-'}`,
                        `Concerns: ${log.conConcerns || '-'}`,
                        `Adviser Notes: ${log.adviser_notes || '-'}`
                    ].join('\n'))
                    .join('\n\n');

                const context = summaryConsultationHistory
                    ? `CONSULTATION HISTORY\n${summaryConsultationHistory}`
                    : '';

                if (!context) {
                    throw new Error('No consultation history available for synthesis.');
                }

                const res = await fetch(`${API_URL}/api/ai/summary`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ 
                        context,
                        consultationHistory: summaryConsultationHistory,
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
                setAiResult({ type: 'summary', content: sanitizeAIContent(response.summary), cached: response.cached });
            } else {
                const latestConsultation = sortedConsultationLogs.find(log => typeof log.conID === 'number');
                const targetConID = latestConsultation?.conID;

                if (!targetConID) {
                    throw new Error("No consultation history found for participation analysis.");
                }

                const res = await fetch(`${API_URL}/api/ai/participation`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ 
                        conID: targetConID,
                        consultationHistory,
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
                setAiResult({ type: 'insights', content: sanitizeAIContent(response.insight), cached: response.cached });
            }
        } catch (err: any) {
            console.error("AI Generation Error:", err);
            setAiError(err.message || "An unexpected error occurred during AI generation.");
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleCustomCourseAnalysis = async () => {
        if (!course) return;
        if (!customInstruction.trim()) {
            setCustomAnalysisError('Please enter an analysis prompt.');
            return;
        }

        setCustomAnalysisLoading(true);
        setCustomAnalysisError(null);
        setCustomAnalysisResult('');

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setCustomAnalysisError('Authentication token not found.');
                return;
            }

            const res = await fetch(`${API_URL}/api/ai/custom-analysis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    courseId: course.id,
                    instruction: customInstruction.trim()
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            setCustomAnalysisResult(sanitizeAIContent(data.analysis || ''));
        } catch (err: any) {
            console.error('Custom Analysis Error:', err);
            setCustomAnalysisError(err.message || 'Failed to run custom analysis.');
        } finally {
            setCustomAnalysisLoading(false);
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

    const formatDateLabel = (value: any) => {
        if (!value) return 'No date';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatDateTimeLabel = (value: any) => {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return parsed.toLocaleString();
    };

    const formatJournalDateDDMMYYYY = (value: any) => {
        if (!value) return '--/--/----';
        const text = String(value);
        const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return text;
        const dd = String(parsed.getDate()).padStart(2, '0');
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const yyyy = parsed.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
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
                    {user?.role === 'Admin' && groups.length > 0 && (
                        <button
                            onClick={() => {
                                setIsCustomAnalysisOpen(true);
                                setCustomAnalysisError(null);
                                setCustomAnalysisResult('');
                            }}
                            className="px-5 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] hover:bg-black transition-all shadow-lg shadow-gray-200 active:scale-95 flex items-center gap-2"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Custom Analysis
                        </button>
                    )}
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

            {isCustomAnalysisOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Course-wide Custom Analysis</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">Admin only • all groups in this course</p>
                            </div>
                            <button onClick={() => setIsCustomAnalysisOpen(false)} className="p-2 hover:bg-gray-100 rounded-2xl transition-colors">
                                <X className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Analysis Prompt</label>
                                <textarea
                                    value={customInstruction}
                                    onChange={(e) => setCustomInstruction(e.target.value)}
                                    rows={5}
                                    placeholder="Example: Give me the latest SRS updates for all groups in this course."
                                    className="w-full px-6 py-4 bg-white border border-gray-200 rounded-[24px] text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder-gray-300 font-medium resize-none"
                                />
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs text-gray-500 font-medium">This analyzes consultation data across every group in {course.courseCode}.</p>
                                <button
                                    onClick={handleCustomCourseAnalysis}
                                    disabled={customAnalysisLoading || !customInstruction.trim()}
                                    className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {customAnalysisLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {customAnalysisLoading ? 'Analyzing...' : 'Run Analysis'}
                                </button>
                            </div>

                            {customAnalysisError && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                                    <p className="text-sm text-red-700 font-semibold">{customAnalysisError}</p>
                                </div>
                            )}

                            {customAnalysisResult && (
                                <div className="p-6 bg-gray-50 border border-gray-200 rounded-3xl">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">AI Result</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{customAnalysisResult}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                                    {['discussion', 'journals', 'consultations', 'ai'].map((tab) => {
                                        if (tab === 'ai' && !(user?.role === 'Admin' || user?.role === 'Adviser')) return null;
                                        return (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveModalTab(tab as any)}
                                                className={`px-6 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all border ${activeModalTab === tab ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/[0.05] border-blue-100' : 'text-gray-600 border-transparent hover:text-gray-800 hover:bg-white/80 hover:border-gray-200'}`}
                                            >
                                                {tab === 'ai' ? 'AI Tools' : tab === 'consultations' ? 'Consultation History' : tab}
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
                                                <Folder className="w-6 h-6 text-blue-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Member Journal Folders</h3>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">One folder per member</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-8">
                                        {selectedGroup.members?.map((member) => {
                                            const memberEntries = memberJournals.filter(
                                                (j) => String(j.member_email).toLowerCase() === String(member.email).toLowerCase()
                                            );
                                            return (
                                                <button
                                                    key={member.email}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedMemberFolder({ email: member.email, name: member.name });
                                                        setExpandedMemberJournalId(null);
                                                        setIsJournalFormOpen(false);
                                                        setMemberJournalError(null);
                                                    }}
                                                    className="text-left group bg-white border border-gray-200 rounded-2xl p-6 hover:-translate-y-1 hover:border-blue-400 hover:shadow-xl transition-all duration-300"
                                                >
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                                            <Folder className="w-6 h-6" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-gray-900 uppercase tracking-tight truncate">{member.name}</p>
                                                            <p className="text-[11px] text-gray-400 truncate font-medium">{member.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Journal Folder</span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{memberEntries.length} Entries</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {loadingMemberJournals && (
                                        <div className="flex justify-center pb-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                        </div>
                                    )}
                                </div>
                            ) : activeModalTab === 'consultations' ? (
                                <div className="p-8">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                                            <ClipboardList className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Consultation History</h3>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">{consultationLogs.length} Logs Found</p>
                                        </div>
                                    </div>

                                    {consultationLogs.length === 0 ? (
                                        <div className="py-20 bg-gray-50 rounded-[32px] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center gap-4">
                                            <ClipboardList className="w-12 h-12 text-gray-200" />
                                            <div>
                                                <p className="font-black text-gray-400 uppercase tracking-widest">No Consultation Logs Yet</p>
                                                <p className="text-xs text-gray-400 mt-1 max-w-xs font-medium">Completed adviser consultations for this group will appear here.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-6 pb-8">
                                            {consultationLogs.map((log: any) => (
                                                <div key={log.conID} className="bg-white border border-gray-100 rounded-[28px] hover:border-blue-300 transition-all hover:shadow-lg overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedConsultationId(expandedConsultationId === log.conID ? null : log.conID)}
                                                        className="w-full p-6 flex items-start justify-between gap-3 text-left"
                                                    >
                                                        <div>
                                                            <h4 className="text-base font-black text-gray-900 uppercase tracking-tight">{log.conMil || log.groupName || selectedGroup.groupName}</h4>
                                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">{log.adviser_name || 'Adviser'}</p>
                                                            <p className="text-xs text-gray-500 mt-2">
                                                                {formatDateLabel(log.conDate || log.slot_date)}{log.start_time ? ` at ${log.start_time}` : ''}
                                                            </p>
                                                            {log.conMil && <p className="text-xs text-gray-500 mt-1">Topic: {log.conMil}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                                                                log.status === 'SUBMITTED'
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : log.status === 'DRAFT'
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : 'bg-blue-100 text-blue-700'
                                                            }`}>{log.status || 'UNKNOWN'}</span>
                                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedConsultationId === log.conID ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </button>

                                                    {expandedConsultationId === log.conID && (
                                                        <div className="px-6 pb-6 border-t border-gray-100">
                                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Consultation Date</p><p className="text-gray-700">{log.conDate || '-'}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Milestone/Topic</p><p className="text-gray-700">{log.conMil || '-'}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Group Name</p><p className="text-gray-700">{log.groupName || '-'}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Course ID</p><p className="text-gray-700">{log.courseID ?? '-'}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Slot ID</p><p className="text-gray-700">{log.slot_id ?? '-'}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Submitted At</p><p className="text-gray-700">{formatDateTimeLabel(log.submitted_at)}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Created At</p><p className="text-gray-700">{formatDateTimeLabel(log.created_at)}</p></div>
                                                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3"><p className="font-black text-gray-400 uppercase tracking-wider mb-1">Updated At</p><p className="text-gray-700">{formatDateTimeLabel(log.updated_at)}</p></div>
                                                            </div>

                                                            {log.conSum && (
                                                                <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Summary</p>
                                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.conSum}</p>
                                                                </div>
                                                            )}

                                                            {log.conAction && (
                                                                <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Action Items</p>
                                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.conAction}</p>
                                                                </div>
                                                            )}

                                                            {log.conConcerns && (
                                                                <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Concerns</p>
                                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.conConcerns}</p>
                                                                </div>
                                                            )}

                                                            {log.adviser_notes && (
                                                                <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Adviser Notes</p>
                                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.adviser_notes}</p>
                                                                </div>
                                                            )}

                                                            {log.attendance_data && Object.keys(log.attendance_data).length > 0 && (
                                                                <div className="mt-4">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Attendance & Participation</p>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                        {Object.entries(log.attendance_data).map(([member, status]: [string, any], idx) => (
                                                                            <div key={idx} className="text-xs p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                                                <p className="font-bold text-gray-800">{member}</p>
                                                                                <div className="flex gap-2 mt-1 flex-wrap">
                                                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{String(status)}</span>
                                                                                    {log.participation_data?.[member] && (
                                                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                                                                            log.participation_data[member] === 'High' ? 'bg-blue-100 text-blue-700' :
                                                                                            log.participation_data[member] === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                                                                                            'bg-gray-100 text-gray-700'
                                                                                        }`}>{log.participation_data[member]}</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
                                                <button onClick={() => handleAIGenerate('summary')} disabled={generatingAI || consultationLogs.length === 0} className="group bg-white border-2 border-gray-100 p-8 rounded-[40px] hover:border-blue-400 hover:shadow-2xl transition-all flex flex-col items-center gap-5 disabled:opacity-50">
                                                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><BookOpen className="w-8 h-8" /></div>
                                                    <div className="text-center">
                                                        <span className="block font-black text-gray-900 uppercase tracking-tight text-xl mb-1">Synthesis</span>
                                                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full">{consultationLogs.length} Data Points</span>
                                                    </div>
                                                </button>
                                                <button onClick={() => handleAIGenerate('participation')} disabled={generatingAI || consultationLogs.length === 0} className="group bg-white border-2 border-gray-100 p-8 rounded-[40px] hover:border-purple-400 hover:shadow-2xl transition-all flex flex-col items-center gap-5 disabled:opacity-50">
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
                            <a href={skyflowUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-black text-[11px] uppercase tracking-[0.25em] underline underline-offset-8 decoration-2 decoration-blue-200 hover:text-blue-700 transition-colors">
                                View Full Analytics in SkyFlow
                            </a>
                            <button onClick={closeModal} className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-blue-200 transition-all active:scale-95">
                                Dismiss Modal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedMemberFolder && selectedGroup && course && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedMemberFolder.name}'s Journal Folder</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">{selectedMemberFolder.email}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {user?.role === 'Student' && String(user?.email || '').toLowerCase() === String(selectedMemberFolder.email).toLowerCase() && (
                                    <button
                                        onClick={() => {
                                            setIsJournalFormOpen(true);
                                            setMemberJournalError(null);
                                        }}
                                        className="px-5 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-95 flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setSelectedMemberFolder(null);
                                        setIsJournalFormOpen(false);
                                        setMemberJournalError(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-2xl transition-colors"
                                >
                                    <X className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 overflow-y-auto space-y-6">
                            {isJournalFormOpen && (
                                <div className="p-6 bg-blue-50/40 border-2 border-dashed border-blue-200 rounded-3xl space-y-4">
                                    <h4 className="font-black text-blue-900 uppercase tracking-tight">Create Journal Entry</h4>
                                    {memberJournalError && <p className="text-sm text-red-600 font-semibold">{memberJournalError}</p>}
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Journal Date</label>
                                        <input
                                            type="date"
                                            value={memberJournalForm.journalDate}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, journalDate: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Task Updates (one per line)</label>
                                        <textarea
                                            rows={4}
                                            value={memberJournalForm.taskUpdates}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, taskUpdates: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Action Plans (one per line)</label>
                                        <textarea
                                            rows={3}
                                            value={memberJournalForm.actionPlans}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, actionPlans: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Issues / Blockers (one per line)</label>
                                        <textarea
                                            rows={3}
                                            value={memberJournalForm.issues}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, issues: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Minutes Date</label>
                                            <input
                                                type="date"
                                                value={memberJournalForm.minutesDate}
                                                onChange={(e) => setMemberJournalForm(prev => ({ ...prev, minutesDate: e.target.value }))}
                                                className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Next Consultation</label>
                                            <input
                                                type="date"
                                                value={memberJournalForm.nextConsultation}
                                                onChange={(e) => setMemberJournalForm(prev => ({ ...prev, nextConsultation: e.target.value }))}
                                                className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Minutes Adviser</label>
                                        <input
                                            value={memberJournalForm.minutesAdviser}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, minutesAdviser: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Minutes Key Points</label>
                                        <textarea
                                            rows={3}
                                            value={memberJournalForm.minutesKeyPoints}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, minutesKeyPoints: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Minutes Action Items</label>
                                        <textarea
                                            rows={3}
                                            value={memberJournalForm.minutesActionItems}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, minutesActionItems: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] px-1">Minutes Action Deadlines</label>
                                        <textarea
                                            rows={2}
                                            value={memberJournalForm.minutesActionDeadlines}
                                            onChange={(e) => setMemberJournalForm(prev => ({ ...prev, minutesActionDeadlines: e.target.value }))}
                                            className="w-full mt-1 px-4 py-3 bg-white border border-blue-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 resize-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setIsJournalFormOpen(false)}
                                            className="px-6 py-3 text-xs font-black uppercase tracking-widest text-blue-400 hover:text-blue-600 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSubmitMemberJournal}
                                            disabled={submittingMemberJournal}
                                            className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {submittingMemberJournal ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                            {submittingMemberJournal ? 'Saving...' : 'Save Entry'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {memberJournals.filter((j) => String(j.member_email).toLowerCase() === String(selectedMemberFolder.email).toLowerCase()).length === 0 ? (
                                <div className="py-16 bg-gray-50 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center gap-3">
                                    <FileText className="w-10 h-10 text-gray-300" />
                                    <p className="font-black text-gray-400 uppercase tracking-widest">No Journal Entries Yet</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {memberJournals
                                        .filter((j) => String(j.member_email).toLowerCase() === String(selectedMemberFolder.email).toLowerCase())
                                        .map((entry, idx) => (
                                            <div key={entry.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedMemberJournalId(expandedMemberJournalId === entry.id ? null : entry.id)}
                                                    className="w-full px-6 py-5 flex items-center justify-between text-left"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Journal Entry #{idx + 1}</p>
                                                        <p className="text-[11px] text-gray-400 font-bold truncate">Member: {entry.member_email}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">{formatJournalDateDDMMYYYY(entry.journal_date)}</p>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedMemberJournalId === entry.id ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </button>

                                                {expandedMemberJournalId === entry.id && (
                                                    <div className="px-6 pb-6 border-t border-gray-100 space-y-4">
                                                        <div className="pt-4 bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Task Updates</p>
                                                            {(entry.task_updates || []).length === 0 ? <p className="text-sm text-gray-500">No updates provided.</p> : (
                                                                <ul className="space-y-1">
                                                                    {(entry.task_updates || []).map((line, idx) => <li key={idx} className="text-sm text-gray-700">• {line}</li>)}
                                                                </ul>
                                                            )}
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Action Plans</p>
                                                            {(entry.action_plans || []).length === 0 ? <p className="text-sm text-gray-500">No action plans provided.</p> : (
                                                                <ul className="space-y-1">
                                                                    {(entry.action_plans || []).map((line, idx) => <li key={idx} className="text-sm text-gray-700">• {line}</li>)}
                                                                </ul>
                                                            )}
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Issues / Blockers</p>
                                                            {(entry.issues || []).length === 0 ? <p className="text-sm text-gray-500">No issues listed.</p> : (
                                                                <ul className="space-y-1">
                                                                    {(entry.issues || []).map((line, idx) => <li key={idx} className="text-sm text-gray-700">• {line}</li>)}
                                                                </ul>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Minutes Date</p>
                                                                <p className="text-sm text-gray-700">{entry.minutes_date || '-'}</p>
                                                            </div>
                                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Next Consultation</p>
                                                                <p className="text-sm text-gray-700">{entry.next_consultation || '-'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Minutes Adviser</p>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.minutes_adviser || '-'}</p>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Minutes Key Points</p>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.minutes_key_points || '-'}</p>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Minutes Action Items</p>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.minutes_action_items || '-'}</p>
                                                        </div>
                                                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Minutes Action Deadlines</p>
                                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.minutes_action_deadlines || '-'}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </SidebarLayout>
    );
}
