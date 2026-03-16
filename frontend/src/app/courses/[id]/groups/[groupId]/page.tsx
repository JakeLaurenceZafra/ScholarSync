'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

type Group = {
    smallgroupID: number;
    groupName: string;
    member1: string | null; roleOne: string | null;
    member2: string | null; roleTwo: string | null;
    member3: string | null; roleThree: string | null;
    member4: string | null; roleFour: string | null;
    member5: string | null; roleFive: string | null;
};

type Task = {
    taskID: number;
    taskTitle: string;
    taskAssign: string;
    taskDeadline: string;
    taskInfo: string;
    groupID: number;
};

export default function GroupPage() {
    const params = useParams();
    const router = useRouter();

    const courseId = params.id as string;
    const groupId = params.groupId as string;

    const [user, setUser] = useState<any>(null);
    const [group, setGroup] = useState<Group | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [journals, setJournals] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'tasks' | 'journals'>('tasks');
    const [selectedJournal, setSelectedJournal] = useState<any | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Journal Details Loading State
    const [journalAttendance, setJournalAttendance] = useState<Record<string, string>>({});
    const [journalParticipation, setJournalParticipation] = useState<Record<string, string>>({});
    const [fetchingJournalDetails, setFetchingJournalDetails] = useState(false);

    // Task Creation Modal State
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskAssign, setTaskAssign] = useState('');
    const [taskDeadline, setTaskDeadline] = useState('');
    const [taskInfo, setTaskInfo] = useState('');
    const [creatingTask, setCreatingTask] = useState(false);

    const fetchGroupData = async (token: string) => {
        try {
            console.log("DEBUG: fetchGroupData for groupId:", groupId);
            const groupRes = await axios.get(`http://localhost:5000/api/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
            setGroup(groupRes.data);

            const tasksRes = await axios.get(`http://localhost:5000/api/groups/${groupId}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
            setTasks(tasksRes.data);

            const consRes = await axios.get(`http://localhost:5000/api/courses/${courseId}/consultations`, { headers: { Authorization: `Bearer ${token}` } });
            // Filter down to published consultations associated specifically with this exact group Name
            const groupJournals = consRes.data.filter((c: any) => c.groupName === groupRes.data.groupName && !c.isDraft);
            setJournals(groupJournals);
        } catch (err: any) {
            console.error("Fetch Group Error:", err);
            setError(`Failed to load group details: ${err.message}. Backend: ${err.response?.data?.error || 'None'}`);
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

        fetchGroupData(token);
    }, [groupId, router]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedJournal) {
                setJournalAttendance({});
                setJournalParticipation({});
                return;
            }

            try {
                setFetchingJournalDetails(true);
                const token = localStorage.getItem('auth_token');
                if (!token) return;

                const [attRes, partRes] = await Promise.all([
                    axios.get(`http://localhost:5000/api/consultations/${selectedJournal.conID}/attendance`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`http://localhost:5000/api/consultations/${selectedJournal.conID}/participation`, { headers: { Authorization: `Bearer ${token}` } })
                ]);

                setJournalAttendance(attRes.data || {});
                setJournalParticipation(partRes.data || {});
            } catch (err) {
                console.error("Error fetching journal details:", err);
            } finally {
                setFetchingJournalDetails(false);
            }
        };

        fetchDetails();
    }, [selectedJournal]);

    const handleCreateTask = async () => {
        if (!taskTitle || !taskAssign || !taskDeadline) {
            alert("Title, Assignee, and Deadline are required.");
            return;
        }

        try {
            setCreatingTask(true);
            const token = localStorage.getItem('auth_token');
            await axios.post(`http://localhost:5000/api/groups/${groupId}/tasks`,
                { taskTitle, taskAssign, taskDeadline, taskInfo },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowTaskModal(false);
            setTaskTitle('');
            setTaskAssign('');
            setTaskDeadline('');
            setTaskInfo('');
            
            if (token) await fetchGroupData(token);
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to create task.");
        } finally {
            setCreatingTask(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-white"></div>;

    if (error || !group) {
        return (
            <SidebarLayout>
                <div className="min-h-screen bg-white text-gray-900 font-sans p-8 flex flex-col items-center justify-center">
                    <div className="text-red-500 font-bold mb-4">{error || "Group not found"}</div>
                    <button onClick={() => router.push(`/courses/${courseId}`)} className="text-blue-600 hover:underline">Return to Course</button>
                </div>
            </SidebarLayout>
        );
    }

    // Determine memberships
    const membersList = [
        { email: group.member1, role: group.roleOne },
        { email: group.member2, role: group.roleTwo },
        { email: group.member3, role: group.roleThree },
        { email: group.member4, role: group.roleFour },
        { email: group.member5, role: group.roleFive },
    ].filter(m => m.email); // Filter out empty slots

    const isLeader = membersList.some(m => m.email === user?.email && m.role === 'leader');
    const isAdmin = user?.role === 'Admin' || user?.role === 'Advisers';
    const canCreateTasks = isLeader || isAdmin;

    return (
        <SidebarLayout>
            <div className="h-full bg-slate-50 flex flex-col min-h-screen">
                <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
                    
                    {/* Header */}
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <button 
                                onClick={() => router.push(`/courses/${courseId}`)}
                                className="text-gray-500 text-sm font-semibold hover:text-indigo-600 mb-2 flex items-center gap-1"
                            >
                                ← Back to Course
                            </button>
                            <h1 className="text-3xl font-bold text-gray-900">{group.groupName}</h1>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        
                        {/* Left Container: Members */}
                        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                            <div className="bg-[#4FB6DF] p-4 border-b border-gray-100 flex justify-between items-center">
                                <h2 className="font-bold text-white text-lg">Members ({membersList.length}/5)</h2>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto w-full">
                                {membersList.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {membersList.map((member, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                                                <div className="flex flex-col truncate pr-2">
                                                    <span className="font-semibold text-sm text-gray-800 truncate" title={member.email!}>{member.email}</span>
                                                </div>
                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${member.role === 'leader' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {member.role}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic text-sm">No members configured.</p>
                                )}
                            </div>
                        </div>

                        {/* Right Container: Tasks & Journals */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]">
                            
                            <div className="bg-[#0095FF] flex justify-between items-center px-4 w-full">
                                <div className="flex items-center pt-2">
                                    <button 
                                        onClick={() => setActiveTab('tasks')}
                                        className={`px-4 py-2 font-bold transition-colors ${activeTab === 'tasks' ? 'text-[#0095FF] bg-white rounded-t-lg' : 'text-white/80 hover:text-white'}`}
                                    >
                                        Group Tasks
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('journals')}
                                        className={`px-4 py-2 font-bold transition-colors ${activeTab === 'journals' ? 'text-[#0095FF] bg-white rounded-t-lg' : 'text-white/80 hover:text-white'}`}
                                    >
                                        Journals
                                    </button>
                                </div>
                                {activeTab === 'tasks' && canCreateTasks && (
                                    <button 
                                        onClick={() => setShowTaskModal(true)}
                                        className="bg-white text-[#0095FF] px-4 py-1.5 rounded text-sm font-bold shadow hover:bg-gray-50 transition-colors my-2"
                                    >
                                        + Add Task
                                    </button>
                                )}
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto w-full max-h-[600px]">
                                {activeTab === 'tasks' && (
                                    tasks.length > 0 ? (
                                        <div className="grid gap-4">
                                            {tasks.map(task => (
                                                <div key={task.taskID} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative overflow-hidden group">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0095FF]"></div>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h3 className="font-bold text-lg text-gray-800 break-words max-w-[70%]">{task.taskTitle}</h3>
                                                        <div className="text-xs font-semibold px-2 py-1 bg-red-50 text-red-600 rounded whitespace-nowrap">
                                                            Due: {task.taskDeadline || 'No date'}
                                                        </div>
                                                    </div>
                                                    {task.taskInfo && (
                                                        <p className="text-gray-600 text-sm mb-4 line-clamp-3">{task.taskInfo}</p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-auto">
                                                        <span className="text-xs font-medium text-gray-500">Assigned to:</span>
                                                        <span className="text-xs font-bold text-[#0095FF] bg-blue-50 px-2 py-1 rounded-full">{task.taskAssign}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p>No tasks created yet.</p>
                                        </div>
                                    )
                                )}

                                {activeTab === 'journals' && (
                                    journals.length > 0 ? (
                                        <div className="grid gap-4 flex-col">
                                            {journals.map(journal => (
                                                <div 
                                                    key={journal.conID} 
                                                    onClick={() => setSelectedJournal(journal)}
                                                    className="bg-gray-50 border border-gray-200 rounded-lg p-5 hover:shadow-md hover:border-[#0095FF]/30 transition-all relative cursor-pointer group"
                                                >
                                                    <div className="flex justify-between items-start border-b border-gray-200 pb-3 mb-3">
                                                        <div className="flex flex-col">
                                                            <h3 className="font-bold text-lg text-gray-800 tracking-tight">{journal.conMil}</h3>
                                                            <span className="text-xs font-bold text-[#0095FF] bg-blue-50 px-2 py-0.5 rounded-full w-fit mt-1">{journal.conStat}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                </svg>
                                                                {journal.conDate}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 mt-0.5">{journal.conType}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Milestone Description</h4>
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{journal.conSum || <span className="italic text-gray-400 text-xs">No description logged.</span>}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                            </svg>
                                            <p>No journals published yet.</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Task Creation Modal */}
                    {showTaskModal && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fixed">
                            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-white">Create New Task</h2>
                                    <button onClick={() => setShowTaskModal(false)} className="text-white/80 hover:text-white transition-colors text-xl leading-none">&times;</button>
                                </div>
                                <div className="p-6 flex flex-col gap-4">
                                    
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Task Title <span className="text-red-500">*</span></label>
                                        <input 
                                            type="text" 
                                            value={taskTitle} 
                                            onChange={e => setTaskTitle(e.target.value)} 
                                            placeholder="e.g., Database Schema Design"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Assign To <span className="text-red-500">*</span></label>
                                        <select 
                                            value={taskAssign}
                                            onChange={e => setTaskAssign(e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]"
                                        >
                                            <option value="">Select a member...</option>
                                            {membersList.map((m, i) => (
                                                <option key={i} value={m.email!}>{m.email}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Deadline Date <span className="text-red-500">*</span></label>
                                        <input 
                                            type="date" 
                                            value={taskDeadline} 
                                            onChange={e => setTaskDeadline(e.target.value)} 
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Task Description</label>
                                        <textarea 
                                            value={taskInfo} 
                                            onChange={e => setTaskInfo(e.target.value)} 
                                            placeholder="Provide details about the task..."
                                            rows={3}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF] resize-none"
                                        />
                                    </div>

                                    <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-gray-100">
                                        <button 
                                            onClick={() => setShowTaskModal(false)}
                                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleCreateTask}
                                            disabled={creatingTask}
                                            className="bg-[#0095FF] text-white px-6 py-2 rounded text-sm font-bold shadow hover:bg-blue-600 transition-colors disabled:opacity-50"
                                        >
                                            {creatingTask ? 'Saving...' : 'Create Task'}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}
                    {/* Journal Details Modal */}
                    {selectedJournal && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fixed p-4">
                            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                                <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center shrink-0">
                                    <h2 className="text-lg font-bold text-white">Journal Details</h2>
                                    <button onClick={() => setSelectedJournal(null)} className="text-white/80 hover:text-white transition-colors text-xl leading-none">&times;</button>
                                </div>
                                <div className="p-8 overflow-y-auto flex flex-col gap-8 custom-scrollbar">
                                    {/* Top Section: Header Info */}
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6">
                                        <div className="flex-1">
                                            <h3 className="text-3xl font-black text-gray-900 leading-tight mb-2 uppercase tracking-tight">{selectedJournal.conMil}</h3>
                                            <div className="flex flex-wrap gap-2">
                                                <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full border shadow-sm ${
                                                    selectedJournal.conStat === 'On Track' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    selectedJournal.conStat === 'Needs Revision' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                    'bg-red-50 text-red-700 border-red-200'
                                                }`}>
                                                    {selectedJournal.conStat}
                                                </span>
                                                <span className="text-[10px] uppercase font-black px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full shadow-sm">
                                                    {selectedJournal.conType}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-400 font-bold bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 shadow-inner">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-sm tracking-widest">{selectedJournal.conDate}</span>
                                        </div>
                                    </div>

                                    {/* Middle Section: Description */}
                                    <div className="space-y-3">
                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Milestone Description</h4>
                                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                                            <p className="text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">
                                                {selectedJournal.conSum || <span className="italic text-gray-400">No description provided.</span>}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Attendees Table */}
                                    <div className="space-y-3">
                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Attendance & Participation</h4>
                                        <div className="overflow-hidden border border-gray-100 rounded-xl shadow-sm">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-[#4FB6DF]/10 border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-3 text-[10px] font-black text-[#4FB6DF] uppercase tracking-wider">Member Name</th>
                                                        <th className="px-6 py-3 text-[10px] font-black text-[#4FB6DF] uppercase tracking-wider text-right">Attendance</th>
                                                        <th className="px-6 py-3 text-[10px] font-black text-[#4FB6DF] uppercase tracking-wider text-right">Participation Rating</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {fetchingJournalDetails ? (
                                                        <tr>
                                                            <td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic text-sm">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <div className="w-4 h-4 border-2 border-[#4FB6DF] border-t-transparent rounded-full animate-spin"></div>
                                                                    Loading records...
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : selectedJournal.conAtt ? (
                                                        selectedJournal.conAtt.split(',').map((name: string) => name.trim()).filter(Boolean).map((attendee: string, i: number) => {
                                                            const status = journalAttendance[attendee] || 'Absent';
                                                            const rating = journalParticipation[attendee] || 'None';
                                                            return (
                                                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded-full bg-[#0095FF]/10 flex items-center justify-center text-[#0095FF] font-black text-xs border border-[#0095FF]/20 shadow-sm">
                                                                                {attendee.charAt(0)}
                                                                            </div>
                                                                            <span className="text-sm font-bold text-gray-800">{attendee}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm border ${
                                                                            status === 'Present' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                                                                        }`}>
                                                                            {status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm border ${
                                                                            rating === 'High' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                                            rating === 'Moderate' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                                            rating === 'Low' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                                                            'bg-slate-50 text-slate-400 border-slate-100 italic'
                                                                        }`}>
                                                                            {rating}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic text-sm">No attendees logged.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Bottom Section: Internal Notes */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Adviser&apos;s Notes</h4>
                                        <div className="bg-[#4FB6DF]/5 p-6 rounded-2xl border border-[#4FB6DF]/10 shadow-sm relative overflow-hidden group">
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#4FB6DF] opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                            <p className="text-gray-700 italic text-sm leading-relaxed pl-2 whitespace-pre-wrap">
                                                {selectedJournal.conNotes || "No internal notes provided for this consultation."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </SidebarLayout>
    );
}
