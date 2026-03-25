'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import {
    FileSpreadsheet,
    RefreshCw,
    Check,
    AlertCircle,
    X,
    ExternalLink,
    Upload,
    Loader2,
    GraduationCap,
    BookOpen,
    Maximize2,
    Cloud,
    Clock,
    Users,
    ChevronDown,
    Sparkles,
    PlugZap,
    Search,
    FolderSync
} from 'lucide-react';

interface DriveSheet {
    id: string;
    name: string;
    modifiedTime: string;
    owners?: Array<{ displayName: string }>;
}

interface ConnectedSheet {
    id: string;
    sheetId: string;
    sheetName: string;
    courseId: string;
    createdAt: string;
    groupCount: number;
}

interface Course {
    id: string;
    courseName: string;
    courseCode: string;
    courseSection: string;
    courseTerm: string;
}

export default function WorkspaceSyncPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [courses, setCourses] = useState<Course[]>([]);
    const [driveSheets, setDriveSheets] = useState<DriveSheet[]>([]);
    const [loadingSheets, setLoadingSheets] = useState(false);
    const [sheetsError, setSheetsError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Per-course connected sheets
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [connectedSheets, setConnectedSheets] = useState<ConnectedSheet[]>([]);

    // Import modal
    const [showImportModal, setShowImportModal] = useState(false);
    const [pendingSheet, setPendingSheet] = useState<DriveSheet | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ type: 'success' | 'error' | 'conflict'; message: string; existingCourses?: any[] } | null>(null);
    const [importedCourses, setImportedCourses] = useState<any[]>([]);

    // Embedded viewer
    const [showEmbeddedSheet, setShowEmbeddedSheet] = useState(false);
    const [embeddedSheetId, setEmbeddedSheetId] = useState('');
    const [embeddedSheetName, setEmbeddedSheetName] = useState('');

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try {
            const decoded: any = jwtDecode(token);
            if (decoded.role !== 'Admin') {
                router.push('/dashboard');
                return;
            }
            setUser(decoded);
        } catch { router.push('/login'); return; }
        fetchCourses(token);
        fetchDriveSheets();
    }, [router]);

    const fetchCourses = async (token: string) => {
        try {
            const res = await fetch(`${API_URL}/api/courses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCourses(data);
                if (data.length > 0) {
                    setSelectedCourse(data[0]);
                    fetchConnectedSheets(data[0].id, token);
                }
            }
        } catch { }
        finally { setLoading(false); }
    };

    const fetchDriveSheets = async () => {
        setLoadingSheets(true);
        setSheetsError('');
        const token = localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/sheets/list`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setDriveSheets(data.files || []);
            } else {
                setSheetsError(data.error || 'Failed to load sheets');
            }
        } catch {
            setSheetsError('Could not reach Google Sheets API');
        } finally {
            setLoadingSheets(false);
        }
    };

    const fetchConnectedSheets = async (courseId: string, token?: string) => {
        const t = token || localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/courses/${courseId}/sheets`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConnectedSheets(data.sheets || []);
            }
        } catch { }
    };

    const handleSelectCourse = (course: Course) => {
        setSelectedCourse(course);
        fetchConnectedSheets(course.id);
    };

    const openImportModal = (sheet: DriveSheet) => {
        setPendingSheet(sheet);
        setImportResult(null);
        setImportedCourses([]);
        setShowImportModal(true);
    };

    const importSheet = async (forceReplace = false) => {
        if (!pendingSheet) return;
        setImporting(true);
        if (!forceReplace) {
            setImportResult(null);
            setImportedCourses([]);
        }

        const token = localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/import-from-sheet`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheetId: pendingSheet.id, forceReplace })
            });
            const data = await res.json();

            if (res.ok) {
                setImportResult({ type: 'success', message: data.message });
                setImportedCourses(data.courses || []);
                // Refresh courses list and connected sheets
                const t = localStorage.getItem('auth_token') || '';
                fetchCourses(t);
                showToast(data.message);
            } else if (res.status === 409) {
                setImportResult({ type: 'conflict', message: data.message, existingCourses: data.existingCourses });
            } else {
                setImportResult({ type: 'error', message: data.error || 'Import failed' });
            }
        } catch {
            setImportResult({ type: 'error', message: 'Network error. Check backend is running.' });
        } finally {
            setImporting(false);
        }
    };

    const deleteConnectedSheet = async (sheetId: string) => {
        const token = localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/connected-sheets/${sheetId}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('Sheet removed');
                if (selectedCourse) fetchConnectedSheets(selectedCourse.id);
            }
        } catch { showToast('Failed to remove', 'error'); }
    };

    const formatDate = (str: string) => {
        if (!str) return '';
        return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const canManage = (user as any)?.role === 'Admin' || (user as any)?.role === 'Advisers';

    const filteredSheets = driveSheets.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <SidebarLayout>
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
                </div>
            </SidebarLayout>
        );
    }

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                            Workspace Sync
                        </h1>
                        <p className="text-gray-500 mt-1.5">Detect your Google Sheets and import teams directly into a course</p>
                    </div>
                </div>

                <div className="space-y-8">

                    {/* ── SECTION 1: Detected Google Sheets ── */}
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-green-500" />
                                Google Sheets in Your Drive
                            </h2>
                            {driveSheets.length > 0 && (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search sheets…"
                                        className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {sheetsError && (
                            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p>{sheetsError}</p>
                                    {sheetsError.includes('access token') && (
                                        <p className="text-amber-600 mt-1 text-xs">
                                            Your Google session expired. <a href="/login" className="underline font-semibold">Sign out & sign back in</a> to refresh your permissions.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {!loadingSheets && driveSheets.length === 0 && !sheetsError && (
                            <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl border border-dashed border-gray-200">
                                <div className="p-4 bg-white rounded-2xl shadow-sm inline-flex mb-4">
                                    <FileSpreadsheet className="w-10 h-10 text-gray-400" />
                                </div>
                                <p className="font-semibold text-gray-700 mb-1">No sheets found</p>
                                <p className="text-gray-400 text-sm mb-4">You do not have any Google Sheets connected to this application.</p>
                            </div>
                        )}

                        {loadingSheets && (
                            <div className="flex items-center justify-center py-16 gap-3 text-blue-500">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span className="text-sm font-medium">Loading your Google Sheets…</span>
                            </div>
                        )}

                        {filteredSheets.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredSheets.map((sheet, idx) => {
                                    const gradients = ['from-green-500 to-emerald-500', 'from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-orange-500 to-amber-500', 'from-teal-500 to-green-400'];
                                    return (
                                        <div key={sheet.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:border-blue-200 transition-all group">
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className={`p-2.5 bg-gradient-to-br ${gradients[idx % gradients.length]} rounded-xl shadow-sm flex-shrink-0`}>
                                                    <FileSpreadsheet className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-gray-800 text-sm leading-snug truncate group-hover:text-blue-600 transition-colors" title={sheet.name}>{sheet.name}</p>
                                                    {sheet.owners?.[0] && <p className="text-xs text-gray-400 mt-0.5 truncate">{sheet.owners[0].displayName}</p>}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" /> {formatDate(sheet.modifiedTime)}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                {/* View embedded */}
                                                <button
                                                    onClick={() => { setEmbeddedSheetId(sheet.id); setEmbeddedSheetName(sheet.name); setShowEmbeddedSheet(true); }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-xs font-medium transition"
                                                >
                                                    <Maximize2 className="w-3.5 h-3.5" /> Preview
                                                </button>

                                                {/* Open in Google */}
                                                <a href={`https://docs.google.com/spreadsheets/d/${sheet.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition" title="Open in Google Sheets">
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>

                                                {/* Import into Course */}
                                                <button
                                                    onClick={() => openImportModal(sheet)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-xs font-semibold hover:shadow-md transition-all"
                                                >
                                                    <Upload className="w-3.5 h-3.5" /> Import
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── SECTION 2: Course → Connected Sheets ── */}
                    <div className="grid grid-cols-12 gap-6">

                        {/* Course Sidebar */}
                        <div className="col-span-4 glass-card p-5">
                            <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-blue-500" /> Your Courses
                            </h2>
                            {courses.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">No courses found</p>
                                    <p className="text-xs mt-1 text-gray-400">
                                        <a href="/courses" className="text-blue-500 hover:underline">Create or join a course</a> first
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {courses.map(course => (
                                        <div
                                            key={course.id}
                                            onClick={() => handleSelectCourse(course)}
                                            className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedCourse?.id === course.id
                                                ? 'bg-blue-50 border-blue-300 shadow-sm'
                                                : 'bg-gray-50 hover:bg-gray-100 border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedCourse?.id === course.id ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                                <p className="font-semibold text-gray-800 text-sm truncate">{course.courseName}</p>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5 ml-4">{course.courseCode} · {course.courseSection}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Connected Sheets for Selected Course */}
                        <div className="col-span-8 glass-card p-6">
                            {!selectedCourse ? (
                                <div className="text-center py-20 text-gray-400">
                                    <Cloud className="w-14 h-14 mx-auto mb-4 opacity-30" />
                                    <p>Select a course to view its imported sheets</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-5">
                                        <h2 className="text-lg font-bold text-gray-800">{selectedCourse.courseName}</h2>
                                        <p className="text-gray-400 text-sm mt-0.5">{selectedCourse.courseCode} · {selectedCourse.courseSection} · {selectedCourse.courseTerm}</p>
                                    </div>

                                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                        <FolderSync className="w-4 h-4 text-blue-400" /> Imported Sheets
                                    </h3>

                                    {connectedSheets.length === 0 ? (
                                        <div className="text-center py-10 bg-gray-50 rounded-2xl text-gray-400 border border-dashed border-gray-200">
                                            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            <p className="text-sm font-medium text-gray-500">No sheets imported yet</p>
                                            <p className="text-xs mt-1">Use the "Detect My Sheets" button above to find a sheet and import it here</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {connectedSheets.map(sheet => (
                                                <div key={sheet.id} className="p-4 bg-gray-50 border border-gray-100 hover:border-blue-200 rounded-2xl flex items-center justify-between transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                                                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800 text-sm">{sheet.sheetName}</p>
                                                            <p className="text-xs text-gray-400 mt-0.5">
                                                                {sheet.groupCount} groups · Imported {formatDate(sheet.createdAt)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> Synced
                                                        </span>
                                                        <button
                                                            onClick={() => { setEmbeddedSheetId(sheet.sheetId); setEmbeddedSheetName(sheet.sheetName); setShowEmbeddedSheet(true); }}
                                                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-medium transition"
                                                        >
                                                            <Maximize2 className="w-3.5 h-3.5 inline mr-1" /> View
                                                        </button>
                                                        <a href={`https://docs.google.com/spreadsheets/d/${sheet.sheetId}`} target="_blank" rel="noopener noreferrer"
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
                                                            <ExternalLink className="w-4 h-4" />
                                                        </a>
                                                        <button onClick={() => deleteConnectedSheet(sheet.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Import Modal ── */}
            {showImportModal && pendingSheet && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 relative">
                        <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                                <Upload className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">Import as Teams</h2>
                                <p className="text-xs text-gray-400">Into a course from your ScholarSync</p>
                            </div>
                        </div>

                        {/* Sheet being imported */}
                        <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                            <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-sm truncate">{pendingSheet.name}</p>
                                <p className="text-xs text-gray-400">Modified {formatDate(pendingSheet.modifiedTime)}</p>
                            </div>
                        </div>

                        {/* Auto-detect info */}
                        <div className="mb-5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                            <p className="font-medium mb-1 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Course auto-detected from <span className="font-mono bg-blue-100 px-1 py-0.5 rounded">TEAM CODE</span>
                            </p>
                            <p className="text-blue-600 leading-relaxed">
                                Each row's <span className="font-mono bg-blue-100 px-1 py-0.5 rounded">TEAM CODE</span> (e.g. <span className="font-mono">2526-sem1-it332-01</span>) is parsed to automatically find or create the course and group — no manual selection needed.
                            </p>
                        </div>



                        {/* Result */}
                        {importResult && (
                            <div className={`mb-4 p-3 rounded-xl text-sm flex items-start gap-2 ${importResult.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : importResult.type === 'conflict' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                                {importResult.type === 'success' ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                                <span>{importResult.message}</span>
                            </div>
                        )}

                        {/* Success course breakdown */}
                        {importResult?.type === 'success' && importedCourses.length > 0 && (
                            <div className="mb-4 space-y-2">
                                {importedCourses.map((c: any) => (
                                    <div key={c.courseId} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-xl text-xs">
                                        <span className="font-semibold text-green-800">{c.courseCode}</span>
                                        <span className="text-green-600">{c.groupCount} groups · {c.memberCount} members</span>
                                        <a href={`/courses`} className="text-blue-600 hover:underline font-medium">View →</a>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setShowImportModal(false)} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 text-sm transition">
                                {importResult?.type === 'success' ? 'Close' : importResult?.type === 'conflict' ? 'Skip' : 'Cancel'}
                            </button>
                            {importResult?.type === 'conflict' ? (
                                <button
                                    onClick={() => importSheet(true)}
                                    disabled={importing}
                                    className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl font-medium hover:shadow-lg transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Replacing...</> : 'Replace'}
                                </button>
                            ) : !importResult?.type || importResult?.type === 'error' ? (
                                <button
                                    onClick={() => importSheet(false)}
                                    disabled={importing}
                                    className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {importing
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                                        : <><Upload className="w-4 h-4" /> Import Teams</>
                                    }
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Embedded Sheet Viewer ── */}
            {showEmbeddedSheet && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 rounded-xl">
                                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                </div>
                                <h2 className="font-bold text-gray-800">{embeddedSheetName}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <a href={`https://docs.google.com/spreadsheets/d/${embeddedSheetId}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm transition">
                                    <ExternalLink className="w-4 h-4" /> Open
                                </a>
                                <button onClick={() => setShowEmbeddedSheet(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 rounded-b-2xl overflow-hidden">
                            <iframe src={`https://docs.google.com/spreadsheets/d/${embeddedSheetId}/preview`} className="w-full h-full border-0" title={embeddedSheetName} />
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[200] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-rose-500'}`}>
                    {toast.message}
                </div>
            )}
        </SidebarLayout>
    );
}
