'use client';

import { GraduationCap } from 'lucide-react';
import { API_URL } from '@/lib/api';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 relative overflow-hidden">
      {/* Cloud background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 animate-cloud-1">
          <div className="w-80 h-32 bg-white/10 rounded-full blur-3xl" />
        </div>
        <div className="absolute top-60 animate-cloud-2">
          <div className="w-64 h-24 bg-white/8 rounded-full blur-3xl" />
        </div>
        <div className="absolute bottom-20 animate-cloud-3">
          <div className="w-96 h-40 bg-white/10 rounded-full blur-3xl" />
        </div>
        <div className="absolute top-96 animate-cloud-4">
          <div className="w-56 h-20 bg-white/6 rounded-full blur-3xl" />
        </div>

        {/* Static cloud circles */}
        <svg className="absolute bottom-0 left-0 w-full h-[35%] pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 320">
          <circle cx="10%" cy="320" r="180" fill="white" fillOpacity="0.06" />
          <circle cx="30%" cy="340" r="210" fill="white" fillOpacity="0.08" />
          <circle cx="50%" cy="310" r="150" fill="white" fillOpacity="0.06" />
          <circle cx="70%" cy="340" r="190" fill="white" fillOpacity="0.08" />
          <circle cx="90%" cy="320" r="160" fill="white" fillOpacity="0.06" />
        </svg>
      </div>

      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-center items-center z-10 px-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-6xl font-bold text-white mb-4 font-[family-name:var(--font-lilita)] tracking-wide">
            ScholarSync
          </h1>
          <p className="text-white/85 text-lg leading-relaxed">
            Sync your courses, manage teams, and streamline academic workflows — all in one place.
          </p>
        </div>
      </div>

      {/* Right Panel — Login Card */}
      <div className="w-full lg:w-[45%] flex justify-center items-center z-10 px-6">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-10">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-[family-name:var(--font-lilita)]">
              ScholarSync
            </span>
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h2>
            <p className="text-gray-500">Sign in to continue to ScholarSync</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full group flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg px-6 py-4 rounded-xl transition-all duration-300"
          >
            <img
              className="h-5 w-5"
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
            />
            <span className="text-gray-700 font-semibold text-sm group-hover:text-blue-600 transition-colors">
              Sign in with Google
            </span>
          </button>

          <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">
              Don't have an account? Sign in with Google and we'll create one for you automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}