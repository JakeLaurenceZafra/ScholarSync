'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SidebarLayout from '@/components/SidebarLayout';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

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

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [successKey, setSuccessKey] = useState<string | null>(null);

    // Form state
    const [enrollKey, setEnrollKey] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [courseName, setCourseName] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseSection, setCourseSection] = useState('');
    const [courseTerm, setCourseTerm] = useState('First Semester');

    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            router.push('/login');
            return;
        }

        try {
            const decoded: any = jwtDecode(token);
            setUser(decoded);
            if (decoded.role === 'Admin' || decoded.role === 'Adviser') {
                setCanCreate(true);
            }
            fetchCourses(token);
        } catch (err) {
            router.push('/login');
        }
    }, [router]);

    const fetchCourses = async (token: string) => {
        try {
            const res = await axios.get('http://localhost:5000/api/courses', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCourses(res.data);
        } catch (err) {
            console.error("Failed to load courses");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('auth_token');
            const res = await axios.post('http://localhost:5000/api/courses', {
                courseName,
                courseCode,
                courseSection,
                courseTerm
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Add to UI immediately
            setCourses([res.data, ...courses]);
            // Show success logic instead of closing immediately
            setSuccessKey(res.data.courseKey);
        } catch (err: any) {
            console.error("Creation Error:", err.response?.data);
            alert(`Error creating course: ${err.response?.data?.error || err.message}`);
        }
    };

    const resetModal = () => {
        setIsModalOpen(false);
        setSuccessKey(null);
        setCourseName('');
        setCourseCode('');
        setCourseSection('');
        setCourseTerm('First Semester');
    };

    const handleEnroll = async () => {
        if (!enrollKey) return;

        try {
            const token = localStorage.getItem('auth_token');
            await axios.post('http://localhost:5000/api/enroll',
                { courseKey: enrollKey },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            alert("Successfully enrolled!");
            setEnrollKey('');
            // Reload courses silently
            fetchCourses(token!);
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to enroll. Please check your key.");
        }
    };

    const filteredCourses = courses.filter(course =>
        course.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.courseCode.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return <div className="min-h-screen bg-white"></div>;

    const isAdmin = user?.role === 'Admin';

    return (
        <SidebarLayout>
            <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
                <div>
                    <h1 className="text-4xl font-[family-name:var(--font-inter)] tracking-wide font-medium text-[#4FB6DF] mb-4">Courses</h1>
                </div>

                {/* Main Blue Container */}
                <div className="flex-1 bg-[#4FB6DF] rounded-none p-6 min-h-[400px]">
                    {/* Top Controls Row */}
                    <div className="flex justify-between items-center mb-6">
                        {/* Search Bar (Left) */}
                        <div className="w-64">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full text-sm font-medium bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/50 text-[#4FB6DF] placeholder-[#4FB6DF]/60 shadow-sm"
                            />
                        </div>

                        {/* Control Buttons (Right) */}
                        <div className="flex items-center gap-3">
                            {canCreate && (
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="bg-white hover:bg-gray-50 text-[#4FB6DF] font-bold text-sm px-6 py-1.5 rounded-full shadow-sm transition-colors"
                                >
                                    Create
                                </button>
                            )}

                            {/* Only show Enroll logic if NOT an Admin */}
                            {!isAdmin && (
                                <>
                                    <button
                                        onClick={handleEnroll}
                                        className="bg-white hover:bg-gray-50 text-[#4FB6DF] font-bold text-sm px-6 py-1.5 rounded-full shadow-sm transition-colors"
                                    >
                                        Enroll
                                    </button>
                                    <input
                                        type="text"
                                        value={enrollKey}
                                        onChange={(e) => setEnrollKey(e.target.value)}
                                        placeholder="Enter Course Code..."
                                        className="border-none rounded-full px-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 text-[#4FB6DF] placeholder-[#4FB6DF]/60 shadow-sm text-sm"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Enrolled Courses List Container with Custom Scrollbar bounds mockup */}
                    <div className="h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredCourses.length > 0 ? (
                            <div className="flex flex-col space-y-3 w-full">
                                {filteredCourses.map((course, idx) => (
                                    <Link href={`/courses/${course.id}`} key={idx} className="block w-full">
                                        <div className="bg-white rounded-none p-4 hover:shadow-md transition-shadow w-full flex flex-col justify-start cursor-pointer border border-transparent hover:border-blue-200">
                                            {/* Stacked Typography exactly matching Mockup alignment */}
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col">
                                                    <h3 className="font-medium text-[1.40rem] text-[#4FB6DF] leading-tight tracking-wide font-[family-name:var(--font-inter)]">
                                                        {course.courseName} - {course.courseSection}
                                                    </h3>
                                                    <p className="text-[#4FB6DF] text-[0.80rem] font-medium mt-0.5">
                                                        {course.courseCode} - {course.courseTerm}
                                                    </p>

                                                    {/* Push Adviser string downwards creating gap identical to design */}
                                                    <p className="text-[#4FB6DF] text-[0.60rem] font-bold mt-4 uppercase">
                                                        {course.courseAdviser}
                                                    </p>
                                                </div>

                                                {/* Adjusted absolute positioning preventing vector clipping on smaller resolutions */}
                                                <div className="flex flex-col items-end pt-1">
                                                    <button
                                                        className="hover:scale-110 transition-transform active:scale-95 flex-shrink-0"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(course.courseKey);
                                                            alert("Course Key Copied!");
                                                        }}
                                                        title="Copy Course Key"
                                                    >
                                                        <img src="/CopyIcon.png" alt="Copy Key" className="w-[1.2rem] h-[1.2rem] opacity-60 hover:opacity-100 transition-opacity" style={{ filter: 'invert(53%) sepia(43%) saturate(541%) hue-rotate(159deg) brightness(96%) contrast(92%)' }} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-white/80">
                                <p className="text-lg font-medium">No courses found matching criteria.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Creation Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 relative animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={resetModal}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            ✕
                        </button>

                        {successKey ? (
                            <div className="text-center py-6">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 mb-2">Course Created!</h2>
                                <p className="text-gray-600 mb-6">Here is your unique course registration key. Share this with your students.</p>
                                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4 mb-6">
                                    <span className="text-3xl font-mono font-bold tracking-widest text-indigo-600">{successKey}</span>
                                </div>
                                <button
                                    onClick={resetModal}
                                    className="w-full bg-gray-900 hover:bg-black text-white py-2 rounded font-medium transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold text-gray-800 mb-6">Create New Course</h2>
                                <form onSubmit={handleCreateCourse} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={courseName}
                                            onChange={e => setCourseName(e.target.value)}
                                            className="w-full border border-[#d1d1d1] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="e.g. Introduction to Programming"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Course Code</label>
                                            <input
                                                type="text"
                                                required
                                                value={courseCode}
                                                onChange={e => setCourseCode(e.target.value)}
                                                className="w-full border border-[#d1d1d1] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="e.g. CS101"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                                            <input
                                                type="text"
                                                required
                                                value={courseSection}
                                                onChange={e => setCourseSection(e.target.value)}
                                                className="w-full border border-[#d1d1d1] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="e.g. A"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                                        <select
                                            value={courseTerm}
                                            onChange={e => setCourseTerm(e.target.value)}
                                            className="w-full border border-[#d1d1d1] rounded px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="First Semester">First Semester</option>
                                            <option value="Second Semester">Second Semester</option>
                                            <option value="Summer">Summer</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded mt-6 transition-colors"
                                    >
                                        Generate Course Option
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}
        </SidebarLayout>
    );
}
