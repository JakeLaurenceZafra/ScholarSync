'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

type Group = {
    groupID?: number;
    smallgroupID?: number; 
    groupName: string;
    team_number?: number;
    proposed_project?: string;
    adviser?: string;
    member1: string | null; roleOne: string | null; nameOne?: string | null;
    member2: string | null; roleTwo: string | null; nameTwo?: string | null;
    member3: string | null; roleThree: string | null; nameThree?: string | null;
    member4: string | null; roleFour: string | null; nameFour?: string | null;
    member5: string | null; roleFive: string | null; nameFive?: string | null;
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

    // Task Creation Modal State
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskAssign, setTaskAssign] = useState('');
    const [taskDeadline, setTaskDeadline] = useState('');
    const [taskInfo, setTaskInfo] = useState('');
    const [creatingTask, setCreatingTask] = useState(false);

    const fetchGroupData = async (token: string) => {
        try {
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
        { email: group.member1, role: group.roleOne, name: group.nameOne },
        { email: group.member2, role: group.roleTwo, name: group.nameTwo },
        { email: group.member3, role: group.roleThree, name: group.nameThree },
        { email: group.member4, role: group.roleFour, name: group.nameFour },
        { email: group.member5, role: group.roleFive, name: group.nameFive },
    ].filter(m => m.email); // Filter out empty slots

    const isLeader = membersList.some(m => m.email === user?.email && m.role === 'leader');
    const isAdmin = user?.role === 'Admin' || user?.role === 'Advisers';
    const canCreateTasks = isLeader || isAdmin;

    return (
        <SidebarLayout>
            <div className="h-full bg-slate-50 flex flex-col min-h-screen">
                <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
                    
                    {/* Header */}
                    <div className="mb-6 flex flex-col justify-start">
                        <button 
                            onClick={() => router.push(`/courses/${courseId}`)}
                            className="text-gray-500 text-sm font-semibold hover:text-indigo-600 mb-4 flex items-center gap-1 w-fit"
                        >
                            ← Back to Course
                        </button>
                        <div className="flex items-center gap-3 mb-2">
                             <div className="text-[13px] font-bold text-indigo-500 uppercase tracking-widest">
                                TEAM {String(group.team_number || group.groupName.replace('Group ', '')).padStart(2, '0')}
                             </div>
                             <div className="flex items-center gap-2 text-[13px] font-bold text-slate-400">
                                 <span>•</span>
                                 <span>{courseId.toUpperCase()}</span>
                             </div>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-snug">
                            {group.proposed_project || group.groupName}
                        </h1>
                        <p className="text-sm text-slate-500 mt-2 font-medium">
                            {group.groupName} • {courseId.toUpperCase()}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
                        
                        {/* Left Container: Team Info & Members */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            
                            {/* Team Info */}
                            <div>
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Team Info</h2>
                                <div className="flex items-start gap-4 mb-4">
                                     <div className="mt-1">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                          </svg>
                                     </div>
                                     <div>
                                         <div className="text-xs text-slate-500 font-medium">Adviser</div>
                                         <div className="text-sm font-bold text-slate-800">{group.adviser || 'TBI'}</div>
                                     </div>
                                </div>
                                <div className="text-[13px] text-slate-500 font-medium mb-8">
                                    {courseId.toUpperCase()}
                                </div>
                            </div>
                            
                            {/* Members */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Members ({membersList.length})</h2>
                                    {isAdmin && (
                                        <button className="text-xs font-bold text-indigo-500 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md transition-colors flex items-center gap-1">
                                            + Add
                                        </button>
                                    )}
                                </div>
                                {membersList.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {membersList.map((member, idx) => {
                                            const colors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500'];
                                            const bgColor = colors[idx % colors.length];
                                            const initial = member.name ? member.name.charAt(0).toUpperCase() : (member.email ? member.email.charAt(0).toUpperCase() : '?');
                                            
                                            return (
                                                <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <div className={`w-10 h-10 ${bgColor} text-white rounded-full flex items-center justify-center font-bold flex-shrink-0 text-lg`}>
                                                            {initial}
                                                        </div>
                                                        <div className="flex flex-col truncate pr-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-sm text-slate-800 truncate">{member.name || member.email?.split('@')[0]}</span>
                                                                {member.role === 'leader' && (
                                                                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                                                        Leader
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-slate-400 truncate">{member.email}</span>
                                                        </div>
                                                    </div>
                                                    {isAdmin && (
                                                        <button className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-slate-500 italic text-sm bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">No members assigned.</p>
                                )}
                            </div>
                            
                            {/* Discussion Stub */}
                            <div className="mt-4">
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Discussion</h2>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[150px]">
                                    <p className="text-sm font-medium text-slate-400 mb-4">No comments yet</p>
                                </div>
                                <div className="mt-3 relative">
                                    <input 
                                        type="text" 
                                        placeholder="Write a comment..." 
                                        className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all shadow-sm"
                                    />
                                    <button className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-500 hover:bg-blue-600 text-white p-1.5 rounded-lg transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Right Container: Activity & Data */}
                        <div className="lg:col-span-8 flex flex-col gap-6 lg:border-l lg:border-slate-200 lg:pl-8">
                            
                            <div className="flex justify-between items-center border-b border-slate-200 pb-px">
                                <div className="flex items-center gap-6">
                                    <button 
                                        onClick={() => setActiveTab('tasks')}
                                        className={`pb-3 text-[13px] font-bold tracking-wide relative transition-colors ${activeTab === 'tasks' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1.5 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                        Progress & Tasks
                                        {activeTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t-full"></div>}
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('journals')}
                                        className={`pb-3 text-[13px] font-bold tracking-wide relative transition-colors ${activeTab === 'journals' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1.5 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                        Journals
                                        {activeTab === 'journals' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t-full"></div>}
                                    </button>
                                </div>
                                {activeTab === 'tasks' && canCreateTasks && (
                                    <button 
                                        onClick={() => setShowTaskModal(true)}
                                        className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors mb-2 flex items-center gap-1.5"
                                    >
                                        <span>+ Add Task</span>
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 w-full pb-10">
                                {activeTab === 'tasks' && (
                                    <>
                                        {/* Abstracted Progress View (Placeholder matching screenshot) */}
                                        <div className="border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-white shadow-sm mb-6">
                                            <h3 className="text-sm font-bold text-slate-500 mb-6">Team Progress</h3>
                                            
                                            <div className="w-32 h-32 rounded-full border-[6px] border-slate-100 border-t-red-500 flex items-center justify-center relative shadow-inner mb-6">
                                                <div className="absolute top-1 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
                                                <span className="text-3xl font-black text-red-500">0%</span>
                                            </div>

                                            <div className="flex justify-center gap-10">
                                                <div className="text-center">
                                                    <div className="text-xl font-bold text-green-500">0</div>
                                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Done</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-xl font-bold text-amber-500">0</div>
                                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">In Progress</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-xl font-bold text-slate-400">0</div>
                                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pending</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actual Tasks mapping below progress */}
                                        {tasks.length > 0 ? (
                                             <div className="grid gap-4">
                                                 {tasks.map(task => (
                                                     <div key={task.taskID} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow relative overflow-hidden group bg-white">
                                                         <div className="flex justify-between items-start mb-2">
                                                             <h3 className="font-bold text-base text-gray-800 break-words max-w-[70%]">{task.taskTitle}</h3>
                                                             <div className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded whitespace-nowrap">
                                                                 Due: {task.taskDeadline || 'No date'}
                                                             </div>
                                                         </div>
                                                         {task.taskInfo && (
                                                             <p className="text-gray-500 text-sm mb-4 line-clamp-3">{task.taskInfo}</p>
                                                         )}
                                                         <div className="flex items-center gap-2 mt-auto">
                                                             <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                                                {task.taskAssign.charAt(0).toUpperCase()}
                                                             </div>
                                                             <span className="text-xs font-bold text-slate-600">{task.taskAssign}</span>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                        ) : null}
                                    </>
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
                                                    
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Discussion Summary</h4>
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{journal.conSum || <span className="italic text-gray-400 text-xs">No summary logged.</span>}</p>
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
                            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                                <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center shrink-0">
                                    <h2 className="text-lg font-bold text-white">Journal Details</h2>
                                    <button onClick={() => setSelectedJournal(null)} className="text-white/80 hover:text-white transition-colors text-xl leading-none">&times;</button>
                                </div>
                                <div className="p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
                                    <div className="flex justify-between items-start border-b border-gray-200 pb-4">
                                        <div>
                                            <h3 className="text-2xl font-bold text-gray-900">{selectedJournal.conMil}</h3>
                                            <div className="flex gap-2 mt-2">
                                                <span className="text-xs font-bold text-[#0095FF] bg-blue-50 px-3 py-1 rounded-full">{selectedJournal.conStat}</span>
                                                <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">{selectedJournal.conType}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold text-gray-500 flex items-center gap-1 justify-end">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                {selectedJournal.conDate}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Discussion Summary</h4>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100">
                                            {selectedJournal.conSum || <span className="italic text-gray-400">No summary.</span>}
                                        </p>
                                    </div>

                                    {selectedJournal.conAction && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Assigned Action Items</h4>
                                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 p-4 rounded-lg border border-gray-100">
                                                {selectedJournal.conAction}
                                            </pre>
                                        </div>
                                    )}

                                    {selectedJournal.conAtt && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Attendees</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedJournal.conAtt.split(',').map((a: string) => a.trim()).filter(Boolean).map((att: string, i: number) => (
                                                    <span key={i} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 shadow-sm flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0"></div>
                                                        {att}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </SidebarLayout>
    );
}
