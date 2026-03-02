'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        router.push('/login');
    };

    return (
        <div className="flex h-screen bg-[#4FB6DF] overflow-hidden font-sans text-white">

            {/* Sidebar Navigation */}
            <aside
                className={`relative flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-[280px]' : 'w-[20px]'
                    } h-full`}
            >
                {/* Content bounded internally fading out on collapse */}
                <div className={`flex flex-col h-full w-[280px] p-6 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>

                    {/* Top Header & Logo Space */}
                    <div className="flex items-center gap-4 mb-8">
                        {/* Removed bg-gray-200, rounded-full, border, etc. Just the logo itself now */}
                        <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                            <Image
                                src="/SSLogo.png"
                                alt="ScholarSync Logo"
                                width={64}
                                height={64}
                                className="object-contain"
                            />
                        </div>
                        <h1 className="text-3xl font-[family-name:var(--font-lilita)] tracking-wide pt-2">
                            Scholar Sync
                        </h1>
                    </div>

                    {/* Navigation Block */}
                    <div className="flex flex-col gap-6 font-[family-name:var(--font-inter)]">
                        <h2 className="text-2xl font-bold mb-4 text-center">Welcome!</h2>

                        <Link
                            href="/dashboard"
                            className={`flex items-center gap-4 text-lg hover:opacity-80 transition-opacity ${pathname === '/dashboard' ? 'font-bold' : 'font-medium'
                                }`}
                        >
                            <Image src="/DashboardIcon.png" alt="Dashboard" width={28} height={28} className="brightness-0 invert" />
                            Dashboard
                        </Link>

                        <Link
                            href="/courses"
                            className={`flex items-center gap-4 text-lg hover:opacity-80 transition-opacity ${pathname === '/courses' ? 'font-bold' : 'font-medium'
                                }`}
                        >
                            <Image src="/CoursesIcon.png" alt="Courses" width={28} height={28} className="brightness-0 invert" />
                            Courses
                        </Link>
                    </div>

                    {/* Bottom Utility Hook */}
                    <div className="mt-auto">
                        <button
                            onClick={handleLogout}
                            className="text-sm font-bold opacity-80 hover:opacity-100 transition-opacity flex items-center gap-2"
                        >
                            Log Out
                        </button>
                    </div>
                </div>

                {/* The Interactive White Border Toggle */}
                <div
                    className="absolute top-0 right-0 h-full w-[2px] bg-white cursor-pointer group flex shadow-[1px_0_5px_rgba(0,0,0,0.1)]"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    title="Toggle Sidebar"
                >
                    {/* Hitbox expansion hovering over the border */}
                    <div className="absolute -left-3 h-full w-6 bg-transparent flex items-center justify-center">
                        <div className="bg-[#4FB6DF] text-white pr-1 transform -translate-x-[2px] opacity-0 group-hover:opacity-100 transition-opacity font-bold text-lg select-none">
                            {isSidebarOpen ? '<' : '>'}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Render Area */}
            <main className="flex-1 h-full transition-all duration-300">
                <div className="bg-white w-full h-full shadow-lg overflow-y-auto text-black relative">
                    {children}
                </div>
            </main>

        </div>
    );
}
