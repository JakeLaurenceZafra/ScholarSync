'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { useAIStore } from '@/store/ai.store';
import AIResultModal from '@/components/AIResultModal'; // Ensure this is created

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
    progressRating?: number;
    comments?: Array<{ text: string; date: string; user: string }>;
    completed?: boolean;
    archived?: boolean;
};

export default function GroupPage() {
    const params = useParams();
    const router = useRouter();

    const courseId = params.id as string;
    const groupId = params.groupId as string;

    const [user, setUser] = useState<any>(null);
    const [group, setGroup] = useState<Group | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
    // Consultation history is driven from consultations table
    const [history, setHistory] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'tasks' | 'history' | 'journals' | 'archive'>('tasks');
    const [selectedJournal, setSelectedJournal] = useState<any | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Journal Details Loading State
    const [journalAttendance, setJournalAttendance] = useState<Record<string, string>>({});
    const [journalParticipation, setJournalParticipation] = useState<Record<string, string>>({});
    const [fetchingJournalDetails, setFetchingJournalDetails] = useState(false);
    const [exportingDocs, setExportingDocs] = useState(false);

    // Task Creation Modal State
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskAssign, setTaskAssign] = useState('');
    const [taskDeadline, setTaskDeadline] = useState('');
    const [taskInfo, setTaskInfo] = useState('');
    const [creatingTask, setCreatingTask] = useState(false);

    // Task Edit Modal State
    const [showEditTaskModal, setShowEditTaskModal] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editTaskTitle, setEditTaskTitle] = useState('');
    const [editTaskAssign, setEditTaskAssign] = useState('');
    const [editTaskDeadline, setEditTaskDeadline] = useState('');
    const [editTaskInfo, setEditTaskInfo] = useState('');
    const [editProgressRating, setEditProgressRating] = useState<number | ''>('');
    const [editComments, setEditComments] = useState<Array<{ text: string; date: string; user: string }>>([]);
    const [newComment, setNewComment] = useState('');
    const [editCompleted, setEditCompleted] = useState(false);
    const [updatingTask, setUpdatingTask] = useState(false);
    const [deletingTask, setDeletingTask] = useState(false);
    const { generate } = useAIStore();
    const [showAIModal, setShowAIModal] = useState(false);

    // Member Journal Modal State
    const [showJournalModal, setShowJournalModal] = useState(false);
    const [journalMember, setJournalMember] = useState<{ email: string; role: string } | null>(null);
    const [journalDate, setJournalDate] = useState<string>('');
    const [journalTasks, setJournalTasks] = useState<Array<{ assignedTask: string; currentStatus: string; progressSummary: string; dependencies: string }>>([
      { assignedTask: '', currentStatus: '', progressSummary: '', dependencies: '' }
    ]);
    const [journalPlans, setJournalPlans] = useState<Array<{ title: string; deadline: string; plan: string }>>([
      { title: '', deadline: '', plan: '' }
    ]);
    const [journalIssues, setJournalIssues] = useState<Array<{ type: string; description: string; impact: string; resolution: string }>>([
      { type: '', description: '', impact: '', resolution: '' }
    ]);
    const [minutesDate, setMinutesDate] = useState<string>('');
    const [minutesAdviser, setMinutesAdviser] = useState<string>('');
    const [minutesKeyPoints, setMinutesKeyPoints] = useState<string>('');
    const [minutesActionItems, setMinutesActionItems] = useState<string>('');
    const [minutesActionDeadlines, setMinutesActionDeadlines] = useState<string>('');
    const [nextConsultation, setNextConsultation] = useState<string>('');
    const [savingJournal, setSavingJournal] = useState(false);

    // In your GroupPage.tsx, update handleAIAction:
const handleAIAction = async (action: 'summary' | 'participation') => {
  const token = localStorage.getItem('auth_token');

  // Ensure selectedJournal exists before calling
  if (!selectedJournal) return;

  await useAIStore.getState().generate(action, { 
    conID: selectedJournal.conID, 
    context: selectedJournal.conSum 
  });

  setShowAIModal(true);
};

    const fetchGroupData = async (token: string) => {
        try {
            console.log("DEBUG: fetchGroupData for groupId:", groupId);
            const groupRes = await axios.get(`http://localhost:5000/api/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
            setGroup(groupRes.data);

            const tasksRes = await axios.get(`http://localhost:5000/api/groups/${groupId}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
            setTasks(tasksRes.data);

            const archivedTasksRes = await axios.get(`http://localhost:5000/api/groups/${groupId}/tasks/archived`, { headers: { Authorization: `Bearer ${token}` } });
            setArchivedTasks(archivedTasksRes.data);

            const consRes = await axios.get(`http://localhost:5000/api/courses/${courseId}/consultations`, { headers: { Authorization: `Bearer ${token}` } });
            // Filter down to published consultations associated specifically with this exact group Name
            const groupHistory = consRes.data.filter((c: any) => c.groupName === groupRes.data.groupName && !c.isDraft);
            setHistory(groupHistory);
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

    const handleExportDocs = async () => {
        if (!selectedJournal) return;
        
        try {
            setExportingDocs(true);
            const token = localStorage.getItem('auth_token');
            const res = await axios.post(`http://localhost:5000/api/consultations/${selectedJournal.conID}/export-docs`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.url) {
                window.open(res.data.url, '_blank');
            }
        } catch (err: any) {
            console.error("Export error:", err);
            alert(err.response?.data?.error || "Failed to export to Google Docs. Make sure the advisor has linked their Google account.");
        } finally {
            setExportingDocs(false);
        }
    };

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

    const handleEditTask = (task: Task) => {
        setEditingTask(task);
        setEditTaskTitle(task.taskTitle);
        setEditTaskAssign(task.taskAssign);
        setEditTaskDeadline(task.taskDeadline);
        setEditTaskInfo(task.taskInfo || '');
        setEditProgressRating(task.progressRating || '');
        setEditComments(task.comments || []);
        setEditCompleted(task.completed || false);
        setNewComment('');
        setShowEditTaskModal(true);
    };

    const handleUpdateTask = async () => {
        if (!editingTask) return;

        try {
            setUpdatingTask(true);
            const token = localStorage.getItem('auth_token');
            const updateData: any = {
                taskTitle: editTaskTitle,
                taskAssign: editTaskAssign,
                taskDeadline: editTaskDeadline,
                taskInfo: editTaskInfo,
            };

            if (editProgressRating !== '') updateData.progressRating = editProgressRating;
            
            // Always send comments, include any pending comment
            let commentsToSend = [...editComments];
            if (newComment.trim()) {
                commentsToSend.push({ 
                    text: newComment.trim(), 
                    date: new Date().toISOString(),
                    user: user?.email || 'Unknown'
                });
            }
            updateData.comments = commentsToSend;
            
            updateData.completed = editCompleted;

            await axios.put(`http://localhost:5000/api/groups/${groupId}/tasks/${editingTask.taskID}`,
                updateData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setShowEditTaskModal(false);
            setEditingTask(null);
            
            if (token) await fetchGroupData(token);
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to update task.");
        } finally {
            setUpdatingTask(false);
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!confirm("Are you sure you want to delete this task?")) return;

        try {
            setDeletingTask(true);
            const token = localStorage.getItem('auth_token');
            await axios.delete(`http://localhost:5000/api/groups/${groupId}/tasks/${taskId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (token) await fetchGroupData(token);
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to delete task.");
        } finally {
            setDeletingTask(false);
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
    const isAdmin = user?.role === 'Admin' || user?.role === 'Adviser';
    const canCreateTasks = isLeader || isAdmin;

   return (
  <>
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

            {/* Right Container: Tasks, Consultation History & Journals */}
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
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 font-bold transition-colors ${activeTab === 'history' ? 'text-[#0095FF] bg-white rounded-t-lg' : 'text-white/80 hover:text-white'}`}
                  >
                    Consultation History
                  </button>
                  <button 
                    onClick={() => setActiveTab('journals')}
                    className={`px-4 py-2 font-bold transition-colors ${activeTab === 'journals' ? 'text-[#0095FF] bg-white rounded-t-lg' : 'text-white/80 hover:text-white'}`}
                  >
                    Journals
                  </button>
                  <button 
                    onClick={() => setActiveTab('archive')}
                    className={`px-4 py-2 font-bold transition-colors ${activeTab === 'archive' ? 'text-[#0095FF] bg-white rounded-t-lg' : 'text-white/80 hover:text-white'}`}
                  >
                    Archive
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
                        <div key={task.taskID} className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative overflow-hidden group ${isAdmin ? 'cursor-pointer' : ''}`} onClick={() => isAdmin && handleEditTask(task)}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${task.completed ? 'bg-green-500' : 'bg-[#0095FF]'}`}></div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800 break-words max-w-[70%]">{task.taskTitle}</h3>
                            <div className="flex items-center gap-2">
                              {task.completed && (
                                <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-full">Completed</span>
                              )}
                              <div className="text-xs font-semibold px-2 py-1 bg-red-50 text-red-600 rounded whitespace-nowrap">
                                Due: {task.taskDeadline || 'No date'}
                              </div>
                            </div>
                          </div>
                          {task.taskInfo && (
                            <p className="text-gray-600 text-sm mb-4 line-clamp-3">{task.taskInfo}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500">Assigned to:</span>
                              <span className="text-xs font-bold text-[#0095FF] bg-blue-50 px-2 py-1 rounded-full">{task.taskAssign}</span>
                            </div>
                            {task.progressRating && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-gray-500">Progress:</span>
                                <div className="flex gap-0.5">
                                  {[1,2,3,4,5].map(star => (
                                    <span key={star} className={`text-xs ${star <= task.progressRating! ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                                  ))}
                                </div>
                                <span className="text-xs font-bold text-gray-700 ml-1">{task.progressRating}/5</span>
                              </div>
                            )}
                          </div>
                          {task.comments && (Array.isArray(task.comments) ? task.comments.length > 0 : task.comments) && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-1">Comments:</p>
                              {Array.isArray(task.comments) ? (
                                task.comments.map((comment, idx) => (
                                  <div key={idx} className="mb-2">
                                    <p className="text-sm text-gray-700 italic">{comment.text}</p>
                                    <p className="text-xs text-gray-400">
                                      {comment.user ? `${comment.user} - ` : ''}{new Date(comment.date).toLocaleString()}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="mb-2">
                                  <p className="text-sm text-gray-700 italic">{task.comments}</p>
                                  <p className="text-xs text-gray-400">Legacy comment</p>
                                </div>
                              )}
                            </div>
                          )}
                          {isAdmin && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.taskID); }}
                                disabled={deletingTask}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                title="Delete task"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
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

                {/* Consultation History tab (existing behaviour) */}
                {activeTab === 'history' && (
                  history.length > 0 ? (
                    <div className="grid gap-4 flex-col">
                      {history.map(journal => (
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
                      <p>No consultations published yet.</p>
                    </div>
                  )
                )}

                {/* Member Journals tab – per-member folders */}
                {activeTab === 'journals' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-gray-600">
                      Select a team member to open their personal journal. Each member can write entries that follow the standard journal format.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {membersList.map((m, idx) => (
                        <div
                          key={idx}
                          className="border border-gray-200 rounded-lg p-4 flex items-center justify-between bg-gray-50 hover:bg-blue-50/60 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#0095FF]/10 flex items-center justify-center text-[#0095FF] font-bold text-xs">
                              {m.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-800 truncate max-w-[180px]" title={m.email!}>{m.email}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.role === 'leader' ? 'Leader' : 'Member'}</span>
                            </div>
                          </div>
                          <button
                            className="text-[11px] font-bold px-3 py-1 rounded-full bg-white text-[#0095FF] border border-[#0095FF]/40 shadow-sm hover:bg-[#0095FF]/5"
                            onClick={() => {
                              setJournalMember({ email: m.email!, role: m.role || 'member' });
                              setJournalDate(new Date().toISOString().slice(0, 10));
                              setMinutesDate('');
                              setMinutesAdviser('');
                              setMinutesKeyPoints('');
                              setMinutesActionItems('');
                              setMinutesActionDeadlines('');
                              setNextConsultation('');
                              setJournalTasks([{ assignedTask: '', currentStatus: '', progressSummary: '', dependencies: '' }]);
                              setJournalPlans([{ title: '', deadline: '', plan: '' }]);
                              setJournalIssues([{ type: '', description: '', impact: '', resolution: '' }]);
                              setShowJournalModal(true);
                            }}
                          >
                            Open
                          </button>
                        </div>
                      ))}
                      {membersList.length === 0 && (
                        <div className="col-span-full text-gray-400 text-sm italic py-8 text-center">
                          No members configured for this group yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Archive tab */}
                {activeTab === 'archive' && (
                  archivedTasks.length > 0 ? (
                    <div className="grid gap-4">
                      {archivedTasks.map(task => (
                        <div key={task.taskID} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative overflow-hidden group bg-gray-50">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-400"></div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800 break-words max-w-[70%]">{task.taskTitle}</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-700 rounded-full">Archived</span>
                              <div className="text-xs font-semibold px-2 py-1 bg-red-50 text-red-600 rounded whitespace-nowrap">
                                Due: {task.taskDeadline || 'No date'}
                              </div>
                            </div>
                          </div>
                          {task.taskInfo && (
                            <p className="text-gray-600 text-sm mb-4 line-clamp-3">{task.taskInfo}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500">Assigned to:</span>
                              <span className="text-xs font-bold text-[#0095FF] bg-blue-50 px-2 py-1 rounded-full">{task.taskAssign}</span>
                            </div>
                            {task.progressRating && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-gray-500">Progress:</span>
                                <div className="flex gap-0.5">
                                  {[1,2,3,4,5].map(star => (
                                    <span key={star} className={`text-xs ${star <= task.progressRating! ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                                  ))}
                                </div>
                                <span className="text-xs font-bold text-gray-700 ml-1">{task.progressRating}/5</span>
                              </div>
                            )}
                          </div>
                          {task.comments && (Array.isArray(task.comments) ? task.comments.length > 0 : task.comments) && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-1">Comments:</p>
                              {Array.isArray(task.comments) ? (
                                task.comments.map((comment, idx) => (
                                  <div key={idx} className="mb-2">
                                    <p className="text-sm text-gray-700 italic">{comment.text}</p>
                                    <p className="text-xs text-gray-400">
                                      {comment.user ? `${comment.user} - ` : ''}{new Date(comment.date).toLocaleString()}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <div className="mb-2">
                                  <p className="text-sm text-gray-700 italic">{task.comments}</p>
                                  <p className="text-xs text-gray-400">Legacy comment</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      <p>No archived tasks yet.</p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarLayout>

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
              <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g., Database Schema Design" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assign To <span className="text-red-500">*</span></label>
              <select value={taskAssign} onChange={e => setTaskAssign(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]">
                <option value="">Select a member...</option>
                {membersList.map((m, i) => (<option key={i} value={m.email!}>{m.email}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Deadline Date <span className="text-red-500">*</span></label>
              <input type="date" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Task Description</label>
              <textarea value={taskInfo} onChange={e => setTaskInfo(e.target.value)} placeholder="Provide details about the task..." rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF] resize-none" />
            </div>
            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
              <button onClick={handleCreateTask} disabled={creatingTask} className="bg-[#0095FF] text-white px-6 py-2 rounded text-sm font-bold shadow hover:bg-blue-600 transition-colors disabled:opacity-50">
                {creatingTask ? 'Saving...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Task Edit Modal */}
    {showEditTaskModal && editingTask && (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fixed p-4">
        <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold text-white">Edit Task</h2>
            <button onClick={() => setShowEditTaskModal(false)} className="text-white/80 hover:text-white transition-colors text-xl leading-none">&times;</button>
          </div>
          <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Task Title <span className="text-red-500">*</span></label>
              <input type="text" value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assign To <span className="text-red-500">*</span></label>
              <select value={editTaskAssign} onChange={e => setEditTaskAssign(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]">
                <option value="">Select a member...</option>
                {membersList.map((m, i) => (<option key={i} value={m.email!}>{m.email}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Deadline Date <span className="text-red-500">*</span></label>
              <input type="date" value={editTaskDeadline} onChange={e => setEditTaskDeadline(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Task Description</label>
              <textarea value={editTaskInfo} onChange={e => setEditTaskInfo(e.target.value)} rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF] resize-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Progress Rating (1-5)</label>
              <select value={editProgressRating} onChange={e => setEditProgressRating(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF]">
                <option value="">Not rated</option>
                <option value={1}>1 - Poor</option>
                <option value={2}>2 - Below Average</option>
                <option value={3}>3 - Average</option>
                <option value={4}>4 - Good</option>
                <option value={5}>5 - Excellent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Add Comment</label>
              <div className="flex gap-2">
                <textarea 
                  value={newComment} 
                  onChange={(e) => setNewComment(e.target.value)} 
                  placeholder="Add a new comment..." 
                  rows={2} 
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:border-[#0095FF] focus:ring-1 focus:ring-[#0095FF] resize-none" 
                />
                <button 
                  onClick={() => {
                    if (newComment.trim()) {
                      setEditComments([...editComments, { 
                        text: newComment.trim(), 
                        date: new Date().toISOString(),
                        user: user?.email || 'Unknown'
                      }]);
                      setNewComment('');
                    }
                  }}
                  className="bg-[#0095FF] text-white px-3 py-2 rounded text-sm font-bold hover:bg-blue-600 transition-colors"
                >
                  Add
                </button>
              </div>
              {editComments.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-gray-500 mb-1">Current Comments:</p>
                  {editComments.map((comment, idx) => (
                    <div key={idx} className="mb-1 p-2 bg-gray-50 rounded text-xs">
                      <p className="text-gray-700">{comment.text}</p>
                      <p className="text-gray-400">
                        {comment.user ? `${comment.user} - ` : ''}{new Date(comment.date).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="completed" checked={editCompleted} onChange={e => setEditCompleted(e.target.checked)} className="rounded border-gray-300 text-[#0095FF] focus:ring-[#0095FF]" />
              <label htmlFor="completed" className="text-sm font-semibold text-gray-700">Mark as Completed</label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 px-6 pb-6 border-t border-gray-100 shrink-0 bg-white">
            <button onClick={() => setShowEditTaskModal(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
            <button onClick={handleUpdateTask} disabled={updatingTask} className="bg-[#0095FF] text-white px-6 py-2 rounded text-sm font-bold shadow hover:bg-blue-600 transition-colors disabled:opacity-50">
              {updatingTask ? 'Updating...' : 'Update Task'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Journal Details Modal */}
    {selectedJournal && (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm fixed p-4">
        <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white">Journal Details</h2>
              {(user?.role === 'Admin' || user?.role === 'Adviser') && (
                <button onClick={handleExportDocs} disabled={exportingDocs} className="bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full transition-all flex items-center gap-2 border border-white/20 shadow-sm">
                  {exportingDocs ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                  {exportingDocs ? 'Generating...' : 'Get DOCs Copy'}
                </button>
              )}
            </div>
            <button onClick={() => setSelectedJournal(null)} className="text-white/80 hover:text-white transition-colors text-xl leading-none">&times;</button>
          </div>
          <div className="p-8 overflow-y-auto flex flex-col gap-8 custom-scrollbar">
            <div className="flex gap-2 pt-2 border-b border-gray-100 pb-6">
              <button onClick={() => handleAIAction('summary')} className="bg-indigo-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-indigo-700 transition-colors">Generate Summary</button>
              <button onClick={() => handleAIAction('participation')} className="bg-purple-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-purple-700 transition-colors">Analyze Participation</button>
            </div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6">
              <div className="flex-1">
                <h3 className="text-3xl font-black text-gray-900 leading-tight mb-2 uppercase tracking-tight">{selectedJournal.conMil}</h3>
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full border shadow-sm ${selectedJournal.conStat === 'On Track' ? 'bg-green-50 text-green-700 border-green-200' : selectedJournal.conStat === 'Needs Revision' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{selectedJournal.conStat}</span>
                  <span className="text-[10px] uppercase font-black px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full shadow-sm">{selectedJournal.conType}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-400 font-bold bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-sm tracking-widest">{selectedJournal.conDate}</span>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Milestone Description</h4>
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 shadow-sm"><p className="text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">{selectedJournal.conSum || <span className="italic text-gray-400">No description provided.</span>}</p></div>
            </div>
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
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic text-sm"><div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-[#4FB6DF] border-t-transparent rounded-full animate-spin"></div>Loading records...</div></td></tr>
                    ) : selectedJournal.conAtt ? (
                      selectedJournal.conAtt.split(',').map((name: string) => name.trim()).filter(Boolean).map((attendee: string, i: number) => {
                        const status = journalAttendance[attendee] || 'Absent';
                        const rating = journalParticipation[attendee] || 'None';
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#0095FF]/10 flex items-center justify-center text-[#0095FF] font-black text-xs border border-[#0095FF]/20 shadow-sm">{attendee.charAt(0)}</div><span className="text-sm font-bold text-gray-800">{attendee}</span></div></td>
                            <td className="px-6 py-4 text-right"><span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm border ${status === 'Present' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>{status}</span></td>
                            <td className="px-6 py-4 text-right"><span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-sm border ${rating === 'High' ? 'bg-blue-100 text-blue-700 border-blue-200' : rating === 'Moderate' ? 'bg-amber-100 text-amber-700 border-amber-200' : rating === 'Low' ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-slate-50 text-slate-400 border-slate-100 italic'}`}>{rating}</span></td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 italic text-sm">No attendees logged.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Adviser&apos;s Notes</h4>
              <div className="bg-[#4FB6DF]/5 p-6 rounded-2xl border border-[#4FB6DF]/10 shadow-sm relative overflow-hidden group"><div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#4FB6DF] opacity-50 group-hover:opacity-100 transition-opacity"></div><p className="text-gray-700 italic text-sm leading-relaxed pl-2 whitespace-pre-wrap">{selectedJournal.conNotes || "No internal notes provided for this consultation."}</p></div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* AI Modal Instance */}
    {showAIModal && <AIResultModal onClose={() => setShowAIModal(false)} />}

    {/* Member Journal Modal */}
    {showJournalModal && journalMember && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-[#0095FF] px-6 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white">Member Journal</h2>
              <p className="text-xs text-white/80 mt-1">
                {journalMember.email} &middot; {journalMember.role === 'leader' ? 'Leader' : 'Member'}
              </p>
            </div>
            <button
              onClick={() => setShowJournalModal(false)}
              className="text-white/80 hover:text-white transition-colors text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                <input
                  type="date"
                  value={journalDate}
                  onChange={e => setJournalDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Team Member</label>
                <input
                  type="text"
                  value={journalMember.email}
                  readOnly
                  className="w-full border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700"
                />
              </div>
            </div>

            {/* 1. Task Updates */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">1. Task Updates</h3>
              {journalTasks.map((t, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Task {idx + 1}</span>
                    {journalTasks.length > 1 && (
                      <button
                        type="button"
                        className="text-[10px] text-red-500 font-bold"
                        onClick={() =>
                          setJournalTasks(journalTasks.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Assigned Task</label>
                      <input
                        type="text"
                        value={t.assignedTask}
                        onChange={e => {
                          const copy = [...journalTasks];
                          copy[idx].assignedTask = e.target.value;
                          setJournalTasks(copy);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Current Status</label>
                      <input
                        type="text"
                        value={t.currentStatus}
                        onChange={e => {
                          const copy = [...journalTasks];
                          copy[idx].currentStatus = e.target.value;
                          setJournalTasks(copy);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Progress Summary</label>
                    <textarea
                      rows={2}
                      value={t.progressSummary}
                      onChange={e => {
                        const copy = [...journalTasks];
                        copy[idx].progressSummary = e.target.value;
                        setJournalTasks(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Dependencies</label>
                    <input
                      type="text"
                      value={t.dependencies}
                      onChange={e => {
                        const copy = [...journalTasks];
                        copy[idx].dependencies = e.target.value;
                        setJournalTasks(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-[11px] font-bold text-[#0095FF]"
                onClick={() =>
                  setJournalTasks([...journalTasks, { assignedTask: '', currentStatus: '', progressSummary: '', dependencies: '' }])
                }
              >
                + Add Task
              </button>
            </div>

            {/* 2. Action Plans */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">2. Action Plans</h3>
              <p className="text-xs text-gray-500">Immediate tasks and how you plan to accomplish them.</p>
              {journalPlans.map((p, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Task {idx + 1}</span>
                    {journalPlans.length > 1 && (
                      <button
                        type="button"
                        className="text-[10px] text-red-500 font-bold"
                        onClick={() =>
                          setJournalPlans(journalPlans.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Immediate Task</label>
                    <input
                      type="text"
                      value={p.title}
                      onChange={e => {
                        const copy = [...journalPlans];
                        copy[idx].title = e.target.value;
                        setJournalPlans(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Deadline</label>
                      <input
                        type="date"
                        value={p.deadline}
                        onChange={e => {
                          const copy = [...journalPlans];
                          copy[idx].deadline = e.target.value;
                          setJournalPlans(copy);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Plan of Action</label>
                    <textarea
                      rows={2}
                      value={p.plan}
                      onChange={e => {
                        const copy = [...journalPlans];
                        copy[idx].plan = e.target.value;
                        setJournalPlans(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-[11px] font-bold text-[#0095FF]"
                onClick={() =>
                  setJournalPlans([...journalPlans, { title: '', deadline: '', plan: '' }])
                }
              >
                + Add Action Plan
              </button>
            </div>

            {/* 3. Issues and Concerns */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">3. Issues and Concerns</h3>
              {journalIssues.map((i, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Issue {idx + 1}</span>
                    {journalIssues.length > 1 && (
                      <button
                        type="button"
                        className="text-[10px] text-red-500 font-bold"
                        onClick={() =>
                          setJournalIssues(journalIssues.filter((_, i2) => i2 !== idx))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                      <input
                        type="text"
                        value={i.type}
                        onChange={e => {
                          const copy = [...journalIssues];
                          copy[idx].type = e.target.value;
                          setJournalIssues(copy);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Impact</label>
                      <input
                        type="text"
                        value={i.impact}
                        onChange={e => {
                          const copy = [...journalIssues];
                          copy[idx].impact = e.target.value;
                          setJournalIssues(copy);
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={i.description}
                      onChange={e => {
                        const copy = [...journalIssues];
                        copy[idx].description = e.target.value;
                        setJournalIssues(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Suggested Resolution</label>
                    <textarea
                      rows={2}
                      value={i.resolution}
                      onChange={e => {
                        const copy = [...journalIssues];
                        copy[idx].resolution = e.target.value;
                        setJournalIssues(copy);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="text-[11px] font-bold text-[#0095FF]"
                onClick={() =>
                  setJournalIssues([...journalIssues, { type: '', description: '', impact: '', resolution: '' }])
                }
              >
                + Add Issue
              </button>
            </div>

            {/* 4. Minutes of Consultation */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">4. Minutes of Consultation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date of Consultation</label>
                  <input
                    type="date"
                    value={minutesDate}
                    onChange={e => setMinutesDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Adviser</label>
                  <input
                    type="text"
                    value={minutesAdviser}
                    onChange={e => setMinutesAdviser(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Key Discussion Points</label>
                <textarea
                  rows={3}
                  value={minutesKeyPoints}
                  onChange={e => setMinutesKeyPoints(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Action Items</label>
                <textarea
                  rows={2}
                  value={minutesActionItems}
                  onChange={e => setMinutesActionItems(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Deadlines for Action Items</label>
                <textarea
                  rows={2}
                  value={minutesActionDeadlines}
                  onChange={e => setMinutesActionDeadlines(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF] resize-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Next Consultation</label>
                  <input
                    type="date"
                    value={nextConsultation}
                    onChange={e => setNextConsultation(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-[#0095FF]"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
            <button
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700"
              onClick={() => setShowJournalModal(false)}
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 text-sm font-bold rounded bg-[#0095FF] text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={savingJournal}
              onClick={async () => {
                try {
                  setSavingJournal(true);
                  const token = localStorage.getItem('auth_token');
                  if (!token || !journalMember || !group) return;

                  await axios.post(
                    `http://localhost:5000/api/groups/${groupId}/journals`,
                    {
                      courseId,
                      groupName: group.groupName,
                      memberEmail: journalMember.email,
                      journalDate,
                      taskUpdates: journalTasks,
                      actionPlans: journalPlans,
                      issues: journalIssues,
                      minutes: {
                        dateOfConsultation: minutesDate,
                        adviser: minutesAdviser,
                        keyDiscussionPoints: minutesKeyPoints,
                        actionItems: minutesActionItems,
                        actionDeadlines: minutesActionDeadlines,
                        nextConsultation
                      }
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                  );

                  alert('Journal saved.');
                  setShowJournalModal(false);
                } catch (err: any) {
                  alert(err.response?.data?.error || 'Failed to save journal.');
                } finally {
                  setSavingJournal(false);
                }
              }}
            >
              {savingJournal ? 'Saving...' : 'Save Journal'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);
}
