'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SidebarLayout from '@/components/SidebarLayout';
import { API_URL } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';
import {
    BookOpen,
    Plus,
    Search,
    Users,
    Copy,
    CheckCircle,
    X,
    KeyRound,
    Loader2
} from 'lucide-react';

type Course = {
    id?: number;
    courseName: string;
    courseCode: string;
    courseKey: string;
    courseAmount: number;
    courseSection: string;
    courseAdviser: string;
    courseTerm: string;
};

export default function CoursesPage() {
    const [user, setUser] = useState<any>(null);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [canCreate, setCanCreate] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [successKey, setSuccessKey] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [enrollKey, setEnrollKey] = useState('');
    const [enrolling, setEnrolling] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [courseName, setCourseName] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseSection, setCourseSection] = useState('');
    const [courseTerm, setCourseTerm] = useState('First Semester');

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const router = useRouter();

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) { router.push('/login'); return; }
        try {
            const decoded: any = jwtDecode(token);
            setUser(decoded);
            if (decoded.role === 'Admin' || decoded.role === 'Advisers') setCanCreate(true);
            fetchCourses(token);
        } catch (err) { router.push('/login'); }
    }, [router]);

    const fetchCourses = async (token: string) => {
        try {
            const res = await fetch(`${API_URL}/api/courses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setCourses(await res.json());
        } catch (err) { console.error('Failed to load courses'); }
        finally { setLoading(false); }
    };

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/api/courses`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseName, courseCode, courseSection, courseTerm })
            });
            if (res.ok) {
                const data = await res.json();
                setCourses([data, ...courses]);
                setSuccessKey(data.courseKey);
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to create course', 'error');
            }
        } catch (err) { showToast('Failed to create course', 'error'); }
        finally { setSubmitting(false); }
    };

    const resetModal = () => {
        setIsModalOpen(false);
        setSuccessKey(null);
        setCourseName(''); setCourseCode(''); setCourseSection(''); setCourseTerm('First Semester');
    };

    const handleEnroll = async () => {
        if (!enrollKey) return;
        setEnrolling(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/api/enroll`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseKey: enrollKey })
            });
            if (res.ok) {
                showToast('Successfully enrolled!');
                setEnrollKey('');
                fetchCourses(token!);
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to enroll', 'error');
            }
        } catch (err) { showToast('Failed to enroll. Check your key.', 'error'); }
        finally { setEnrolling(false); }
    };

    const filteredCourses = courses.filter(c =>
        c.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.courseCode.toLowerCase().includes(searchQuery.toLowerCase())
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

    const isAdmin = user?.role === 'Admin';

    return (
        <SidebarLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Courses</h1>
                    <p className="text-gray-600 mt-2">{isAdmin ? 'Manage all courses' : canCreate ? 'Your managed courses' : 'Your enrolled courses'}</p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search courses..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        {canCreate && (
                            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all text-sm font-medium">
                                <Plus className="w-4 h-4" /> Create Course
                            </button>
                        )}
                        {!isAdmin && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={enrollKey}
                                    onChange={e => setEnrollKey(e.target.value)}
                                    placeholder="Course key..."
                                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-40"
                                />
                                <button
                                    onClick={handleEnroll}
                                    disabled={enrolling || !enrollKey}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-lg transition-all text-sm font-medium disabled:opacity-50"
                                >
                                    {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                    Enroll
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Courses Grid */}
                {filteredCourses.length > 0 ? (
                    <div className="space-y-8">
                        {Object.entries(
                            filteredCourses.reduce((acc, course) => {
                                const code = course.courseCode || 'Other Section';
                                if (!acc[code]) acc[code] = [];
                                acc[code].push(course);
                                return acc;
                            }, {} as Record<string, Course[]>)
                        ).map(([code, coursesInCode]) => (
                            <div key={code} className="bg-white/50 border border-gray-100 rounded-[20px] p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-gray-800 mb-5 flex items-center gap-2">
                                    <BookOpen className="w-5 h-5 text-blue-500" />
                                    {code} Teams
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {coursesInCode.map((course, idx) => (
                                        <Link href={`/courses/${course.id}`} key={idx} className="glass-card p-5 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                                                    <BookOpen className="w-5 h-5 text-white" />
                                                </div>
                                                <button
                                                    onClick={e => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(course.courseKey); showToast('Course key copied!'); }}
                                                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Copy course key"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <h3 className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors mb-1">
                                                {course.courseName}
                                            </h3>
                                            <p className="text-sm text-gray-500 mb-1">{course.courseCode} · {course.courseSection}</p>
                                            <p className="text-xs text-gray-400 mb-4">{course.courseTerm}</p>

                                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                                    <Users className="w-4 h-4" />
                                                    <span>{course.courseAmount || 0} students</span>
                                                </div>
                                                <span className="text-xs text-gray-400 uppercase font-medium tracking-wider">{course.courseAdviser?.split('@')[0]}</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card p-12 text-center">
                        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No courses found</h3>
                        <p className="text-gray-500">{searchQuery ? 'Try a different search term' : canCreate ? 'Create your first course' : 'Enroll using a course key'}</p>
                    </div>
                )}
            </div>

            {/* Create Course Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-fade-in">
                        <button onClick={resetModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                            <X className="w-5 h-5" />
                        </button>

                        {successKey ? (
                            <div className="text-center py-4">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle className="w-8 h-8 text-green-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 mb-2">Course Created!</h2>
                                <p className="text-gray-500 mb-6">Share this key with your students:</p>
                                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 mb-6">
                                    <span className="text-3xl font-mono font-bold tracking-widest bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{successKey}</span>
                                </div>
                                <button onClick={resetModal} className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:shadow-lg transition-all">
                                    Done
                                </button>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold text-gray-800 mb-6">Create New Course</h2>
                                <form onSubmit={handleCreateCourse} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                                        <input type="text" required value={courseName} onChange={e => setCourseName(e.target.value)}
                                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g. Introduction to Programming" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Course Code</label>
                                            <input type="text" required value={courseCode} onChange={e => setCourseCode(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. CS101" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                                            <input type="text" required value={courseSection} onChange={e => setCourseSection(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. A" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                                        <select value={courseTerm} onChange={e => setCourseTerm(e.target.value)}
                                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                            <option>First Semester</option>
                                            <option>Second Semester</option>
                                            <option>Summer</option>
                                        </select>
                                    </div>
                                    <button type="submit" disabled={submitting}
                                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4">
                                        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Course'}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[200] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-up ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-rose-500'
                    }`}>
                    {toast.message}
                </div>
            )}
        </SidebarLayout>
    );
}
