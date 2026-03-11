'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

type Course = {
    id: number;
    courseName: string;
    courseCode: string;
    courseKey: string;
    courseAmount: number;
    courseSection: string;
    courseAdviser: string;
    courseTerm: string;
};

type Member = {
    account_id: number;
    accountName: string;
    accountEmail: string;
    accountRole: string;
};

type Grouping = {
    groupID: number;
    groupName: string;
    groupMembers: string; // JSON or comma-separated list of names based on DB setup
    courseID: number;
};

type Consultation = {
    conID: number;
    courseID: number;
    groupName: string;
    conDate: string;
    conType: string;
    conMil: string;
    conSum: string;
    conAction: string;
    conAtt: string;
    isDraft: boolean;
    conStat: string;
};

type Task = {
    taskID: number;
    taskTitle: string;
    taskAssign: string;
    taskDeadline: string;
    taskInfo: string;
    groupID: number;
};

export default function CourseDetailsPage() {
    const params = useParams();
    const router = useRouter();

    const [user, setUser] = useState<any>(null);
    const [course, setCourse] = useState<Course | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [groupings, setGroupings] = useState<Grouping[]>([]);
    const [consultations, setConsultations] = useState<Consultation[]>([]);

    const [activeTab, setActiveTab] = useState<'members' | 'groupings' | 'consultations'>('members');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // Edit Role State
    const [editingUserId, setEditingUserId] = useState<number | null>(null);
    const [editedRole, setEditedRole] = useState<string>('');

    // Import Google Sheets Modal State
    const [showImportModal, setShowImportModal] = useState(false);
    const [sheetLink, setSheetLink] = useState('');
    const [importing, setImporting] = useState(false);

    // Consultation Modal State
    const [showConsultationModal, setShowConsultationModal] = useState(false);
    const [isEditingConsId, setIsEditingConsId] = useState<number | null>(null);
    const [conDate, setConDate] = useState('');
    const [conType, setConType] = useState('Scheduled'); // Default
    const [conMil, setConMil] = useState('');
    const [conSum, setConSum] = useState('');
    const [conStat, setConStat] = useState('On Track'); // Default
    const [selectedGroup, setSelectedGroup] = useState('');
    const [creatingConsultation, setCreatingConsultation] = useState(false);

    // Create Group Modal State
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupMembers, setNewGroupMembers] = useState(['', '', '', '']); // Only 4 inputs needed as logged-in user is member1
    const [creatingGroup, setCreatingGroup] = useState(false);

    // Consultation Expanded State
    const [expandedConsId, setExpandedConsId] = useState<number | null>(null);
    const [attendanceState, setAttendanceState] = useState<Record<number, Record<string, 'Present' | 'Absent'>>>({});
    const [participationState, setParticipationState] = useState<Record<number, Record<string, 'High' | 'Moderate' | 'Low'>>>({});
    const [fetchedConsTasks, setFetchedConsTasks] = useState<Record<number, Task[]>>({});

    // Task Info Modal State
    const [selectedTaskInfo, setSelectedTaskInfo] = useState<Task | null>(null);

    const toggleConsExpand = async (consId: number, attendeesString: string, groupName: string) => {
        if (expandedConsId === consId) {
            setExpandedConsId(null);
        } else {
            setExpandedConsId(consId);
            
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            // 1. Setup default Attendance/Participation OR fetch existing from db
            if (attendeesString) {
                const attendeesList = attendeesString.split(',').map(a => a.trim()).filter(a => a);
                const initialAttendance: Record<string, 'Present' | 'Absent'> = {};
                const initialParticipation: Record<string, 'High' | 'Moderate' | 'Low'> = {};
                
                try {
                    // Fetch existing saved attendance and participation states concurrently
                    const [attRes, partRes] = await Promise.all([
                        axios.get(`http://localhost:5000/api/consultations/${consId}/attendance`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }),
                        axios.get(`http://localhost:5000/api/consultations/${consId}/participation`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })
                    ]);
                    
                    const savedAttMap = attRes.data || {};
                    const savedPartMap = partRes.data || {};
                    
                    // Merge DB state or default values
                    attendeesList.forEach(a => {
                        initialAttendance[a] = savedAttMap[a] || 'Present';
                        initialParticipation[a] = savedPartMap[a] || 'Moderate';
                    });
                } catch (err) {
                    console.error("Failed to fetch existing records:", err);
                    attendeesList.forEach(a => {
                        initialAttendance[a] = 'Present';
                        initialParticipation[a] = 'Moderate';
                    });
                }

                setAttendanceState(prev => ({
                    ...prev,
                    [consId]: initialAttendance
                }));
                setParticipationState(prev => ({
                    ...prev,
                    [consId]: initialParticipation
                }));
            }

            // 2. Fetch Tasks dynamically based on the stored GroupName
            if (groupName && !fetchedConsTasks[consId]) {
                try {
                    const res = await axios.get(`http://localhost:5000/api/groups/by-name/${encodeURIComponent(groupName)}/tasks`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setFetchedConsTasks(prev => ({
                        ...prev,
                        [consId]: res.data
                    }));
                } catch (err) {
                    console.error("Failed to fetch tasks for consultation expansion:", err);
                }
            }
        }
    };

    const handleSaveRecords = async (consId: number, groupName: string) => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        const currentAtt = attendanceState[consId];
        const currentPart = participationState[consId];
        if (!currentAtt || !currentPart) return;

        try {
            await Promise.all([
                axios.put(`http://localhost:5000/api/consultations/${consId}/attendance`, 
                    { groupName, attendance: currentAtt },
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
                axios.put(`http://localhost:5000/api/consultations/${consId}/participation`, 
                    { groupName, participation: currentPart },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
            ]);
            alert("Records saved successfully!");
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to save records.");
        }
    };

    const toggleAttendance = (consId: number, attendee: string) => {
        setAttendanceState(prev => ({
            ...prev,
            [consId]: {
                ...prev[consId],
                [attendee]: prev[consId]?.[attendee] === 'Present' ? 'Absent' : 'Present'
            }
        }));
    };

    const updateParticipation = (consId: number, attendee: string, value: 'High' | 'Moderate' | 'Low') => {
        setParticipationState(prev => ({
            ...prev,
            [consId]: {
                ...prev[consId],
                [attendee]: value
            }
        }));
    };

    // Dynamic refetch function block separated mapped for reusing after Sheets import
    const fetchData = async (token: string) => {
        try {
            const courseRes = await axios.get(`http://localhost:5000/api/courses/${params.id}`, { headers: { Authorization: `Bearer ${token}` } });
            setCourse(courseRes.data);
            const membersRes = await axios.get(`http://localhost:5000/api/courses/${params.id}/members`, { headers: { Authorization: `Bearer ${token}` } });
            setMembers(membersRes.data);
            const groupingsRes = await axios.get(`http://localhost:5000/api/courses/${params.id}/groupings`, { headers: { Authorization: `Bearer ${token}` } });
            setGroupings(groupingsRes.data);
            const consultationsRes = await axios.get(`http://localhost:5000/api/courses/${params.id}/consultations`, { headers: { Authorization: `Bearer ${token}` } });
            setConsultations(consultationsRes.data);
        } catch (err: any) {
            console.error("Fetch Course Data Error:", err);
            if (err.response?.status === 404) setError("Course not found.");
            else if (err.response?.status === 403) setError("You do not have permission to view this course.");
            else {
                const verboseError = err.response?.data?.error;
                setError(`Failed to load course details. ${verboseError ? 'Reason: ' + verboseError : ''}`);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            router.push('/login');
            return;
        }

        try {
            const decoded = jwtDecode(token);
            setUser(decoded);
        } catch (err) {
            router.push('/login');
            return;
        }

        fetchData(token);
    }, [params.id, router]);

    const handleImport = async () => {
        if (!sheetLink) {
            alert("Please paste a Google Sheets link.");
            return;
        }

        try {
            setImporting(true);
            const token = localStorage.getItem('auth_token');
            const res = await axios.post(`http://localhost:5000/api/courses/${params.id}/import-groups`,
                { sheetUrl: sheetLink },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            alert(res.data.message);
            setShowImportModal(false);
            setSheetLink('');

            // Refetch to see the new DB payload instantly on the front end
            if (token) await fetchData(token);

        } catch (err: any) {
            alert(err.response?.data?.error || "An error occurred during import.");
        } finally {
            setImporting(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) {
            alert("Group Name is required.");
            return;
        }

        try {
            setCreatingGroup(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            // Logged in user is member1 (index 0)
            const allMembers = [user.email, ...newGroupMembers.filter(m => m.trim() !== '')];
            
            await axios.post(`http://localhost:5000/api/courses/${params.id}/groups`,
                { groupName: newGroupName, members: allMembers },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowCreateGroupModal(false);
            setNewGroupName('');
            setNewGroupMembers(['', '', '', '']);
            await fetchData(token);

        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to create group.");
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleCreateConsultation = async (isDraft: boolean) => {
        if (!conDate || !conMil || !selectedGroup) {
            alert("Date, Milestone, and Group selection are required fields.");
            return;
        }

        try {
            setCreatingConsultation(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            await axios.post(`http://localhost:5000/api/courses/${params.id}/consultations`,
                {
                    conDate,
                    conType,
                    conMil,
                    conSum,
                    conStat,
                    groupName: selectedGroup,
                    isDraft
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowConsultationModal(false);
            setIsEditingConsId(null);
            setConDate('');
            setConType('Scheduled');
            setConMil('');
            setConSum('');
            setConStat('On Track');
            setSelectedGroup('');

            if (token) await fetchData(token);

        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to create consultation.");
        } finally {
            setCreatingConsultation(false);
        }
    };

    const handleEditClick = (cons: Consultation) => {
        setIsEditingConsId(cons.conID);
        setConDate(cons.conDate);
        setConType(cons.conType);
        setConMil(cons.conMil);
        setConSum(cons.conSum);
        setConStat(cons.conStat);
        setSelectedGroup(cons.groupName);
        setShowConsultationModal(true);
    };

    const handleUpdateConsultation = async (isDraft: boolean) => {
        if (!conDate || !conMil || !selectedGroup) {
            alert("Date, Milestone, and Group selection are required fields.");
            return;
        }

        try {
            setCreatingConsultation(true);
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            await axios.put(`http://localhost:5000/api/consultations/${isEditingConsId}`,
                {
                    conDate,
                    conType,
                    conMil,
                    conSum,
                    conAction: consultations.find(c => c.conID === isEditingConsId)?.conAction || '', 
                    conStat,
                    groupName: selectedGroup,
                    isDraft
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowConsultationModal(false);
            setIsEditingConsId(null);
            setConDate('');
            setConType('Scheduled');
            setConMil('');
            setConSum('');
            setConStat('On Track');
            setSelectedGroup('');

            if (token) await fetchData(token);

        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to update consultation.");
        } finally {
            setCreatingConsultation(false);
        }
    };

    const handleCopyKey = () => {
        if (course?.courseKey) {
            navigator.clipboard.writeText(course.courseKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Reset visual feedback
        }
    };

    const handleSaveRole = async (accountId: number) => {
        try {
            const token = localStorage.getItem('auth_token');
            await axios.put(`http://localhost:5000/api/accounts/${accountId}/role`,
                { role: editedRole },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Update local state without refreshing map
            setMembers(members.map(m => m.account_id === accountId ? { ...m, accountRole: editedRole } : m));
            setEditingUserId(null);
            alert("Role updated successfully!");
        } catch (err) {
            alert("Failed to update role. You may not have permission.");
        }
    };

    if (loading) return <div className="min-h-screen bg-white"></div>;

    if (error) {
        return (
            <SidebarLayout>
                <div className="min-h-screen bg-white text-gray-900 font-sans h-full">
                    <main className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center h-[60vh]">
                        <div className="text-red-500 font-bold text-xl mb-4 text-center">{error}</div>
                        <button
                            onClick={() => router.push('/courses')}
                            className="text-blue-600 hover:text-blue-800 underline font-medium"
                        >
                            Return to Courses
                        </button>
                    </main>
                </div>
            </SidebarLayout>
        );
    }

    if (!course) return null;

    const isAdmin = user?.role === 'Admin';
    const canManageGroupings = user?.role === 'Admin' || user?.role === 'Advisers';

    return (
        <SidebarLayout>
            {/* V7 Inner Blue Canvas Wrapper */}
            <div className="h-full bg-white flex flex-col">
                <main className="flex-1 p-8 max-w-7xl mx-auto w-full">

                    {/* Dark Blue Container encompassing everything */}
                    <div className="bg-[#4FB6DF] w-full min-h-[600px] p-6 text-white font-[family-name:var(--font-inter)] relative flex flex-col">

                        {/* 1. Header Block (Transparent with White Bottom Border) */}
                        <div className="border-b border-white pb-6 mb-6 relative">
                            <h1 className="text-3xl tracking-wide font-normal mb-1">
                                {course.courseName}
                            </h1>
                            <p className="text-sm font-medium opacity-90">
                                {course.courseCode} - {course.courseSection}
                            </p>
                            <p className="text-sm font-bold opacity-90 mt-4">
                                {course.courseTerm}
                            </p>

                            {/* Copy Key Top Right */}
                            <div className="absolute top-0 right-0 flex items-center gap-2">
                                <span className="text-sm font-medium">{copied ? 'Copied!' : 'Course Key'}</span>
                                <button
                                    onClick={handleCopyKey}
                                    className="hover:scale-110 active:scale-95 transition-transform"
                                    title="Copy Course Key"
                                >
                                    <img src="/CopyIcon.png" alt="Copy" className="w-5 h-5 brightness-0 invert opacity-90 hover:opacity-100" />
                                </button>
                            </div>
                        </div>

                        {/* 2. Interactive White Tabs & Optional Import Button */}
                        <div className="flex items-center justify-between mb-8 border-b border-white w-full">
                            <div className="flex items-center gap-0">
                                <button
                                    onClick={() => setActiveTab('members')}
                                    className={`px-6 py-2 text-sm font-bold transition-colors ${activeTab === 'members'
                                        ? 'bg-white text-[#4FB6DF]'
                                        : 'bg-transparent text-white border border-white border-b-0 hover:bg-white/10'
                                        }`}
                                >
                                    All Members ({members.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('groupings')}
                                    className={`px-6 py-2 text-sm font-bold transition-colors ${activeTab === 'groupings'
                                        ? 'bg-white text-[#4FB6DF]'
                                        : 'bg-transparent text-white border border-white border-b-0 hover:bg-white/10'
                                        }`}
                                >
                                    Groupings ({groupings.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('consultations')}
                                    className={`px-6 py-2 text-sm font-bold transition-colors ${activeTab === 'consultations'
                                        ? 'bg-white text-[#4FB6DF]'
                                        : 'bg-transparent text-white border border-white border-b-0 hover:bg-white/10'
                                        }`}
                                >
                                    Consultations ({consultations.length})
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                {activeTab === 'groupings' && canManageGroupings && (
                                    <>
                                        <button
                                            onClick={() => setShowCreateGroupModal(true)}
                                            className="bg-white text-[#4FB6DF] px-6 py-1.5 text-sm font-bold transform -translate-y-1 hover:bg-blue-50 transition-colors shadow-sm"
                                        >
                                            Create Group
                                        </button>
                                        <button
                                            onClick={() => setShowImportModal(true)}
                                            className="bg-white text-[#4FB6DF] px-6 py-1.5 text-sm font-bold transform -translate-y-1 hover:bg-blue-50 transition-colors shadow-sm"
                                        >
                                            Import
                                        </button>
                                    </>
                                )}
                                {activeTab === 'consultations' && canManageGroupings && (
                                    <button
                                        onClick={() => setShowConsultationModal(true)}
                                        className="bg-white text-[#4FB6DF] px-6 py-1.5 text-sm font-bold transform -translate-y-1 hover:bg-blue-50 transition-colors shadow-sm"
                                    >
                                        Create
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 3. List Render Mapping Contexts */}
                        <div className="flex-1 w-full space-y-3">
                            {/* --------- MEMBERS TAB --------- */}
                            {activeTab === 'members' && (
                                members.length > 0 ? members.map((member) => (
                                    <div key={member.account_id} className="bg-white w-full py-3 px-4 flex items-center justify-between shadow-sm">

                                        {/* Avatar & Info */}
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0"></div>
                                            <div className="flex flex-col text-black">
                                                <span className="font-bold text-sm">{member.accountName}</span>
                                                <span className="text-xs text-gray-500 font-medium">{member.accountEmail}</span>
                                            </div>
                                        </div>

                                        {/* Role Editor Logic */}
                                        <div className="flex items-center gap-3">
                                            {editingUserId === member.account_id ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={editedRole}
                                                        onChange={(e) => setEditedRole(e.target.value)}
                                                        className="text-black text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:border-[#4FB6DF]"
                                                    >
                                                        <option value="Student">Student</option>
                                                        <option value="Advisers">Adviser</option>
                                                        <option value="Admin">Admin</option>
                                                    </select>
                                                    <button onClick={() => handleSaveRole(member.account_id)} className="text-xs bg-[#4FB6DF] text-white px-3 py-1 font-bold rounded hover:bg-blue-500">
                                                        Save
                                                    </button>
                                                    <button onClick={() => setEditingUserId(null)} className="text-xs text-gray-500 font-bold hover:text-black">
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-black font-semibold">{member.accountRole}</span>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingUserId(member.account_id);
                                                                setEditedRole(member.accountRole);
                                                            }}
                                                            className="text-[#4FB6DF] hover:scale-110 active:scale-95 transition-transform"
                                                            title="Edit Role"
                                                        >
                                                            {/* Pencil Vector equivalent mapping */}
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-[1.10rem] h-[1.10rem]" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )) : (
                                    <div className="text-white/80 italic text-sm py-4">No members currently enrolled.</div>
                                )
                            )}

                            {/* --------- GROUPINGS TAB --------- */}
                            {activeTab === 'groupings' && (
                                groupings.length > 0 ? groupings.map((group) => (
                                    <div 
                                      key={group.groupID} 
                                      onClick={() => router.push(`/courses/${params.id}/groups/${group.groupID}`)}
                                      className="bg-white w-full py-4 px-6 flex items-center justify-between text-black shadow-sm relative group/item cursor-pointer hover:bg-blue-50 transition-colors"
                                    >
                                        <div className="font-bold text-[#4FB6DF] text-sm">{group.groupName}</div>
                                        <div className="text-sm font-bold text-gray-400">Members: {group.groupMembers}</div>

                                        {/* Mockup indicates an Edit icon on the right side of the groupings block */}
                                        {isAdmin && (
                                            <button className="absolute right-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#4FB6DF]" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                )) : (
                                    <div className="text-white/80 italic text-sm py-4">No groupings structured yet.</div>
                                )
                            )}

                            {/* --------- CONSULTATIONS TAB --------- */}
                            {activeTab === 'consultations' && (
                                consultations.length > 0 ? consultations.map((cons) => (
                                    <div key={cons.conID} className={`bg-white w-full shadow-sm border-l-4 ${cons.isDraft ? 'border-gray-400' : 'border-[#4FB6DF]'} mb-3`}>
                                        <div
                                            className="py-4 px-6 flex items-center justify-between text-black relative group/item cursor-pointer hover:bg-gray-50 transition-colors"
                                            onClick={() => toggleConsExpand(cons.conID, cons.conAtt, cons.groupName)}
                                        >
                                            <div className="flex flex-col">
                                                <div className="font-bold text-[#4FB6DF] text-lg flex items-center gap-3">
                                                    {cons.conMil}
                                                    {cons.isDraft && (
                                                        <span className="bg-gray-200 text-gray-700 text-[10px] uppercase px-2 py-0.5 rounded-full font-bold">
                                                            Draft
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    {cons.conDate}
                                                    <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                                                        {cons.conType}
                                                    </span>
                                                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                                        cons.conStat === 'On Track' ? 'bg-green-50 text-green-700' :
                                                        cons.conStat === 'Needs Revision' ? 'bg-yellow-50 text-yellow-700' :
                                                        'bg-red-50 text-red-700'
                                                    }`}>
                                                        {cons.conStat}
                                                    </span>
                                                </div>
                                                {!expandedConsId || expandedConsId !== cons.conID ? (
                                                    cons.conAtt && (
                                                        <div className="text-xs font-semibold text-gray-400 mt-2 truncate max-w-md">
                                                            Attendees: <span className="text-gray-600">{cons.conAtt}</span>
                                                        </div>
                                                    )
                                                ) : null}
                                            </div>

                                            {/* Expand & Edit Icons */}
                                            <div className="flex items-center gap-4 text-[#4FB6DF]">
                                                {(user?.role === 'Advisers' || user?.role === 'Admin') && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEditClick(cons);
                                                        }}
                                                        className="hover:text-blue-700 transition-colors"
                                                        title="Edit Consultation"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform ${expandedConsId === cons.conID ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Expanded Content */}
                                        {expandedConsId === cons.conID && (
                                            <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
                                                {/* Summary Section */}
                                                <div className="mb-4">
                                                    <h4 className="text-sm font-bold text-gray-700 mb-1">Discussion Summary</h4>
                                                    <p className="text-sm text-gray-600 bg-white p-3 rounded-md border border-gray-100 shadow-sm whitespace-pre-wrap">
                                                        {cons.conSum || <span className="italic text-gray-400">No summary provided.</span>}
                                                    </p>
                                                </div>

                                                {/* Action Items Section */}
                                                {(fetchedConsTasks[cons.conID] && fetchedConsTasks[cons.conID].length > 0) ? (
                                                    <div className="mb-4">
                                                        <h4 className="text-sm font-bold text-gray-700 mb-2">Assigned Action Items</h4>
                                                        <div className="flex flex-col gap-2">
                                                            {fetchedConsTasks[cons.conID].map(task => (
                                                                <div 
                                                                    key={task.taskID}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedTaskInfo(task);
                                                                    }}
                                                                    className="bg-white p-3 rounded-md border border-gray-100 shadow-sm cursor-pointer hover:border-[#4FB6DF] hover:shadow-md transition-all flex items-center justify-between group"
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-sm text-gray-800">{task.taskTitle}</span>
                                                                        <span className="text-xs text-gray-500 mt-0.5">Assigned to: {task.taskAssign}</span>
                                                                    </div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-xs font-semibold text-red-500 mb-0.5">Due: {task.taskDeadline}</span>
                                                                        <span className="text-xs text-[#4FB6DF] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                                                            View Details
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                                            </svg>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    cons.conAction ? (
                                                        <div className="mb-4">
                                                            <h4 className="text-sm font-bold text-gray-700 mb-1">Assigned Action Items (Legacy)</h4>
                                                            <pre className="text-sm text-gray-600 bg-white p-3 rounded-md border border-gray-100 shadow-sm whitespace-pre-wrap font-sans">
                                                                {cons.conAction}
                                                            </pre>
                                                        </div>
                                                    ) : null
                                                )}

                                                {/* Attendees & Participation Section */}
                                                {cons.conAtt ? (
                                                    <div>
                                                        <h4 className="text-sm font-bold text-gray-700 mb-3">Attendees ({cons.conAtt.split(',').filter(a => a.trim()).length})</h4>
                                                        <div className="flex flex-col gap-2">
                                                            {cons.conAtt.split(',').map(a => a.trim()).filter(a => a).map((attendee, idx) => {
                                                                const status = attendanceState[cons.conID]?.[attendee] || 'Present';
                                                                const partStatus = participationState[cons.conID]?.[attendee] || 'Moderate';
                                                                
                                                                return (
                                                                    <div key={idx} className="flex items-center justify-between text-black bg-white px-4 py-2 rounded-md border border-gray-100 shadow-sm">
                                                                        <div className="flex items-center gap-3 w-1/3">
                                                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0"></div>
                                                                            <span className="font-semibold text-sm truncate">{attendee}</span>
                                                                        </div>
                                                                        
                                                                        <div className="flex items-center gap-4 justify-end">
                                                                            {/* Participation Rating */}
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Part:</span>
                                                                                {(user?.role === 'Advisers' || user?.role === 'Admin') ? (
                                                                                    <select
                                                                                        value={partStatus}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={(e) => {
                                                                                            e.stopPropagation();
                                                                                            updateParticipation(cons.conID, attendee, e.target.value as any);
                                                                                        }}
                                                                                        className={`text-xs font-bold rounded-md px-2 py-1 outline-none border cursor-pointer ${
                                                                                            partStatus === 'High' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                                                                            partStatus === 'Low' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                                                                            'bg-gray-100 text-gray-700 border-gray-200'
                                                                                        }`}
                                                                                    >
                                                                                        <option value="High">High</option>
                                                                                        <option value="Moderate">Moderate</option>
                                                                                        <option value="Low">Low</option>
                                                                                    </select>
                                                                                ) : (
                                                                                    <span className={`px-2 py-1 text-xs font-bold rounded-md ${
                                                                                        partStatus === 'High' ? 'bg-indigo-100 text-indigo-700' :
                                                                                        partStatus === 'Low' ? 'bg-orange-100 text-orange-700' :
                                                                                        'bg-gray-100 text-gray-700'
                                                                                    }`}>
                                                                                        {partStatus}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Attendance Toggle */}
                                                                            {(user?.role === 'Advisers' || user?.role === 'Admin') ? (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); toggleAttendance(cons.conID, attendee); }}
                                                                                    className={`px-3 py-1 w-20 text-xs font-bold rounded-full transition-colors ${status === 'Present'
                                                                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                                                        }`}
                                                                                >
                                                                                    {status}
                                                                                </button>
                                                                            ) : (
                                                                                <span className={`px-3 py-1 w-20 text-center text-xs font-bold rounded-full transition-colors ${status === 'Present'
                                                                                        ? 'bg-green-100 text-green-700'
                                                                                        : 'bg-red-100 text-red-700'
                                                                                    }`}
                                                                                >
                                                                                    {status}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {(user?.role === 'Advisers' || user?.role === 'Admin') && (
                                                            <div className="mt-4 flex justify-end">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleSaveRecords(cons.conID, cons.groupName);
                                                                    }}
                                                                    className="bg-[#4FB6DF] hover:bg-blue-500 text-white text-sm font-bold py-2 px-6 rounded-md shadow-sm transition-colors"
                                                                >
                                                                    Save Records
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-gray-500 italic mt-2">No attendees assigned to this consultation.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )) : (
                                    <div className="text-white/80 italic text-sm py-4">No consultations created yet.</div>
                                )
                            )}
                        </div>

                        {/* 4. Import Google Sheets Modal */}
                        {showImportModal && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                                <div className="bg-[#4FB6DF] w-[500px] shadow-2xl relative border-2 border-white/20 pb-8 rounded-sm">

                                    {/* Modal Header */}
                                    <div className="w-full flex justify-between items-center px-4 py-3 border-b border-white/20">
                                        <div className="w-4"></div> {/* Spacer for true centering */}
                                        <h2 className="text-lg font-bold text-white tracking-wide">Import Google Sheets</h2>
                                        <button
                                            onClick={() => setShowImportModal(false)}
                                            className="text-white font-bold text-sm hover:text-gray-200 transition-colors"
                                        >
                                            X
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="px-8 mt-6 flex flex-col items-center">
                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Add Google Sheets Link</label>
                                        <input
                                            type="text"
                                            value={sheetLink}
                                            onChange={(e) => setSheetLink(e.target.value)}
                                            placeholder="https://docs.google.com/spreadsheets/d/..."
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-6"
                                        />

                                        <button
                                            onClick={handleImport}
                                            disabled={importing}
                                            className="bg-white text-[#4FB6DF] font-bold text-sm px-8 py-2 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider shadow-sm flex items-center gap-2"
                                        >
                                            {importing ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4 text-[#4FB6DF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Importing...
                                                </>
                                            ) : 'Import'}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        )}

                        {/* 5. Create Group Modal */}
                        {showCreateGroupModal && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                                <div className="bg-[#4FB6DF] w-[500px] shadow-2xl relative border-2 border-white/20 pb-8 rounded-sm">
                                    <div className="w-full flex justify-between items-center px-4 py-3 border-b border-white/20">
                                        <div className="w-4"></div>
                                        <h2 className="text-lg font-bold text-white tracking-wide">Create Group</h2>
                                        <button
                                            onClick={() => setShowCreateGroupModal(false)}
                                            className="text-white font-bold text-sm hover:text-gray-200 transition-colors"
                                        >
                                            X
                                        </button>
                                    </div>

                                    <div className="px-8 mt-6 flex flex-col items-center">
                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Group Name</label>
                                        <input
                                            type="text"
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            placeholder="e.g. Group 1"
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4"
                                        />

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Add Members by Email (Max 4 others)</label>
                                        <div className="w-full flex flex-col gap-2 mb-6">
                                            {newGroupMembers.map((email, idx) => (
                                                <input
                                                    key={idx}
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => {
                                                        const freshArr = [...newGroupMembers];
                                                        freshArr[idx] = e.target.value;
                                                        setNewGroupMembers(freshArr);
                                                    }}
                                                    placeholder={`Member ${idx + 2} Email Optional`}
                                                    className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white"
                                                />
                                            ))}
                                            <p className="text-white/80 text-xs italic mt-1">You ({user?.email}) will automatically be added as Leader (Member 1).</p>
                                        </div>

                                        <button
                                            onClick={handleCreateGroup}
                                            disabled={creatingGroup}
                                            className="bg-white text-[#4FB6DF] font-bold text-sm px-8 py-2 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider shadow-sm flex items-center gap-2"
                                        >
                                            {creatingGroup ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4 text-[#4FB6DF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Creating...
                                                </>
                                            ) : 'Confirm'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. Create Consultation Modal */}
                        {showConsultationModal && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                                <div className="bg-[#4FB6DF] w-[500px] shadow-2xl relative border-2 border-white/20 pb-8 rounded-sm">
                                    <div className="w-full flex justify-between items-center px-4 py-3 border-b border-white/20">
                                        <div className="w-4"></div>
                                        <h2 className="text-lg font-bold text-white tracking-wide">
                                            {isEditingConsId ? 'Edit Consultation' : 'Create Consultation'}
                                        </h2>
                                        <button
                                            onClick={() => {
                                                setShowConsultationModal(false);
                                                setIsEditingConsId(null);
                                            }}
                                            className="text-white font-bold text-sm hover:text-gray-200 transition-colors"
                                        >
                                            X
                                        </button>
                                    </div>

                                    <div className="px-8 mt-6 flex flex-col items-center max-h-[70vh] overflow-y-auto">
                                        
                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Consultation Milestone</label>
                                        <input
                                            type="text"
                                            value={conMil}
                                            onChange={(e) => setConMil(e.target.value)}
                                            placeholder="e.g. Chapter 1 Review"
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4"
                                        />

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Consultation Date</label>
                                        <input
                                            type="date"
                                            value={conDate}
                                            onChange={(e) => setConDate(e.target.value)}
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4"
                                        />

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Consultation Type</label>
                                        <select
                                            value={conType}
                                            onChange={(e) => setConType(e.target.value)}
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4"
                                        >
                                            <option value="Scheduled">Scheduled</option>
                                            <option value="Emergency">Emergency</option>
                                            <option value="Online">Online</option>
                                            <option value="Face-to-Face">Face-to-Face</option>
                                        </select>

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Discussion Summary</label>
                                        <textarea
                                            value={conSum}
                                            onChange={(e) => setConSum(e.target.value)}
                                            placeholder="Notes on what was discussed..."
                                            rows={3}
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4 resize-none"
                                        />

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Status Indicator</label>
                                        <select
                                            value={conStat}
                                            onChange={(e) => setConStat(e.target.value)}
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-4"
                                        >
                                            <option value="On Track">On Track</option>
                                            <option value="Needs Revision">Needs Revision</option>
                                            <option value="At Risk">At Risk</option>
                                        </select>

                                        <label className="text-white text-sm font-semibold mb-2 self-start pl-1">Assign Attendees (Group)</label>
                                        <select
                                            value={selectedGroup}
                                            onChange={(e) => setSelectedGroup(e.target.value)}
                                            className="w-full bg-white text-black text-sm px-3 py-2 rounded-none focus:outline-none focus:ring-2 focus:ring-white mb-6"
                                        >
                                            <option value="">No specific group</option>
                                            {groupings.map((g) => (
                                                <option key={g.groupID} value={g.groupName}>
                                                    {g.groupName}
                                                </option>
                                            ))}
                                        </select>

                                        <div className="flex gap-4 w-full mb-4">
                                            {(!isEditingConsId || consultations.find(c => c.conID === isEditingConsId)?.isDraft) && (
                                                <button
                                                    onClick={() => isEditingConsId ? handleUpdateConsultation(true) : handleCreateConsultation(true)}
                                                    disabled={creatingConsultation}
                                                    className="flex-1 bg-gray-200 text-gray-700 font-bold text-sm px-4 py-2 rounded-sm hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    Save as Draft
                                                </button>
                                            )}

                                            <button
                                                onClick={() => isEditingConsId ? handleUpdateConsultation(false) : handleCreateConsultation(false)}
                                                disabled={creatingConsultation}
                                                className="flex-1 bg-white text-[#4FB6DF] font-bold text-sm px-4 py-2 rounded-sm hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider shadow-sm flex items-center justify-center gap-2"
                                            >
                                                {creatingConsultation ? (
                                                    <>
                                                        <svg className="animate-spin h-4 w-4 text-[#4FB6DF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        {isEditingConsId ? 'Updating...' : 'Publishing...'}
                                                    </>
                                                ) : (isEditingConsId ? 'Update' : 'Publish')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Task Info Modal */}
                        {selectedTaskInfo && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
                                <div className="bg-white text-black w-full max-w-md shadow-2xl relative border-t-4 border-[#4FB6DF] rounded-md overflow-hidden flex flex-col">
                                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Task Details</h2>
                                        <button
                                            onClick={() => setSelectedTaskInfo(null)}
                                            className="text-gray-400 font-bold hover:text-red-500 transition-colors text-lg"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="flex flex-col p-6 space-y-5">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Title</h3>
                                            <p className="font-bold text-lg text-[#4FB6DF] leading-tight">{selectedTaskInfo.taskTitle}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Assignee</h3>
                                                <p className="font-medium text-gray-800 flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-full bg-gray-200"></div>
                                                    {selectedTaskInfo.taskAssign}
                                                </p>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Deadline</h3>
                                                <p className="font-bold text-red-500">{selectedTaskInfo.taskDeadline}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Description / Info</h3>
                                            <div className="bg-gray-50 p-4 rounded-md border border-gray-100 mt-1 min-h-[80px]">
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTaskInfo.taskInfo || <span className="italic text-gray-400">No additional information provided.</span>}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                        <button
                                            onClick={() => setSelectedTaskInfo(null)}
                                            className="bg-white border border-gray-300 text-gray-700 font-bold py-1.5 px-6 rounded-md hover:bg-gray-100 transition-colors text-sm shadow-sm"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </main>
            </div>
        </SidebarLayout>
    );
}
