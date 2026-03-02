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

export default function CourseDetailsPage() {
    const params = useParams();
    const router = useRouter();

    const [user, setUser] = useState<any>(null);
    const [course, setCourse] = useState<Course | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [groupings, setGroupings] = useState<Grouping[]>([]);

    const [activeTab, setActiveTab] = useState<'members' | 'groupings'>('members');
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

    // Dynamic refetch function block separated mapped for reusing after Sheets import
    const fetchData = async (token: string) => {
        try {
            const courseRes = await axios.get(`http://localhost:5000/api/courses/${params.id}`, { headers: { Authorization: `Bearer ${token}` } });
            setCourse(courseRes.data);
            const membersRes = await axios.get(`http://localhost:5000/api/courses/${params.id}/members`, { headers: { Authorization: `Bearer ${token}` } });
            setMembers(membersRes.data);
            const groupingsRes = await axios.get(`http://localhost:5000/api/courses/${params.id}/groupings`, { headers: { Authorization: `Bearer ${token}` } });
            setGroupings(groupingsRes.data);
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
                            </div>

                            {/* Show Import button explicitly tracking the Groupings tab context */}
                            {activeTab === 'groupings' && canManageGroupings && (
                                <button
                                    onClick={() => setShowImportModal(true)}
                                    className="bg-white text-[#4FB6DF] px-6 py-1.5 text-sm font-bold transform -translate-y-1 hover:bg-blue-50 transition-colors shadow-sm"
                                >
                                    Import
                                </button>
                            )}
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
                                    <div key={group.groupID} className="bg-white w-full py-4 px-6 flex items-center justify-between text-black shadow-sm relative group/item">
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

                    </div>
                </main>
            </div>
        </SidebarLayout>
    );
}
