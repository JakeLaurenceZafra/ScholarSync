'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import Link from 'next/link';
import { jwtDecode } from 'jwt-decode';
import { API_URL } from '@/lib/api';
import {
  BookOpen,
  Users,
  Layers,
  TrendingUp,
  FolderOpen,
  FileSpreadsheet,
  ArrowRight,
  Calendar
} from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
      fetchDashboardData(token);
    } catch (err) {
      router.push('/login');
    }
  }, [router]);

  const fetchDashboardData = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCourses(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user || loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
        </div>
      </SidebarLayout>
    );
  }

  const isAdmin = user.role === 'Admin';
  const isInstructor = user.role === 'Admin' || user.role === 'Advisers';

  return (
    <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-gray-600 mt-2 text-lg">
            Welcome back, <span className="font-semibold">{user.email?.split('@')[0]}</span>
            <span className="text-gray-400"> · {user.role}</span>
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass-card p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Courses</span>
            </div>
            <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              {courses.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {isInstructor ? 'Courses managed' : 'Enrolled courses'}
            </p>
          </div>

          <div className="glass-card p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl shadow-md">
                <Users className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Students</span>
            </div>
            <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {courses.reduce((sum: number, c: any) => sum + (c.courseAmount || 0), 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Total enrolled</p>
          </div>

          <div className="glass-card p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Sections</span>
            </div>
            <p className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {new Set(courses.map((c: any) => c.courseSection)).size}
            </p>
            <p className="text-xs text-gray-500 mt-1">Unique sections</p>
          </div>

          <div className="glass-card p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-md">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Term</span>
            </div>
            <p className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              {courses[0]?.courseTerm || 'No Term'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Current semester</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-6 mb-8">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-6">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/courses"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-500 hover:border-transparent transition-all duration-300 group hover:shadow-md"
            >
              <BookOpen className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
              <div>
                <p className="font-semibold text-gray-800 group-hover:text-white transition-colors">View Courses</p>
                <p className="text-xs text-gray-500 group-hover:text-white/80 transition-colors">Manage your courses</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white ml-auto transition-colors" />
            </Link>

            <Link
              href="/drive"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-500 hover:border-transparent transition-all duration-300 group hover:shadow-md"
            >
              <FolderOpen className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
              <div>
                <p className="font-semibold text-gray-800 group-hover:text-white transition-colors">Google Drive</p>
                <p className="text-xs text-gray-500 group-hover:text-white/80 transition-colors">Browse your files</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white ml-auto transition-colors" />
            </Link>

            <Link
              href="/sheets"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-500 hover:border-transparent transition-all duration-300 group hover:shadow-md"
            >
              <FileSpreadsheet className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
              <div>
                <p className="font-semibold text-gray-800 group-hover:text-white transition-colors">Google Sheets</p>
                <p className="text-xs text-gray-500 group-hover:text-white/80 transition-colors">View spreadsheets</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-white ml-auto transition-colors" />
            </Link>
          </div>
        </div>

        {/* Recent Courses */}
        <div className="glass-card p-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-6">
            {isInstructor ? 'Your Courses' : 'Enrolled Courses'}
          </h2>
          {courses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.slice(0, 6).map((course: any) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-200 transition-all duration-300 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
                      {course.courseSection}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors mb-1">
                    {course.courseName}
                  </h3>
                  <p className="text-sm text-gray-500">{course.courseCode} · {course.courseTerm}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
                    <Users className="w-3 h-3" />
                    <span>{course.courseAmount || 0} students</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No courses yet</p>
              <p className="text-sm text-gray-400 mt-1">
                {isInstructor ? 'Create your first course to get started' : 'Enroll in a course using a course key'}
              </p>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}