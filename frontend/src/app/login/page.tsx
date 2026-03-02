'use client';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  return (
    <div className="flex min-h-screen bg-[#0095FF] relative overflow-hidden">

      {/* Background Cloud SVGs layered beneath z-10 content */}
      <svg className="absolute bottom-0 left-0 w-full h-[30%] pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 320">
        {/* Lighter / Larger background clouds */}
        <circle cx="10%" cy="320" r="180" fill="#2EAAFF" fillOpacity="0.4" />
        <circle cx="28%" cy="340" r="210" fill="#2EAAFF" fillOpacity="0.5" />
        <circle cx="48%" cy="310" r="150" fill="#2EAAFF" fillOpacity="0.4" />
        <circle cx="85%" cy="340" r="240" fill="#2EAAFF" fillOpacity="0.3" />

        {/* Foreground slightly denser clouds */}
        <circle cx="-5%" cy="350" r="150" fill="#88CBFF" fillOpacity="0.8" />
        <circle cx="15%" cy="330" r="160" fill="#88CBFF" fillOpacity="0.85" />
        <circle cx="35%" cy="360" r="200" fill="#88CBFF" fillOpacity="0.9" />
        <circle cx="55%" cy="340" r="180" fill="#88CBFF" fillOpacity="0.85" />
        <circle cx="75%" cy="360" r="190" fill="#88CBFF" fillOpacity="0.8" />
        <circle cx="95%" cy="320" r="140" fill="#88CBFF" fillOpacity="0.8" />

        {/* Top right trailing corner bubble matching mockup framing */}
        <circle cx="95%" cy="0" r="150" fill="#2EAAFF" fillOpacity="0.5" />
      </svg>

      {/* Left Panel - Blue Splash */}
      <div className="hidden lg:flex lg:w-[60%] flex-col justify-center px-16 xl:px-24 z-10 lg:pl-[20%]">
        <h2 className="text-white text-3xl xl:text-4xl tracking-widest uppercase mb-1 font-[family-name:var(--font-inter)] font-bold">
          Welcome To
        </h2>
        <h1 className="text-white text-6xl xl:text-7xl uppercase mb-10 font-[family-name:var(--font-lilita)]" style={{ letterSpacing: '0.1em' }}>
          Scholar Sync
        </h1>
        <p className="text-white text-base xl:text-lg leading-relaxed max-w-lg font-medium opacity-95 font-[family-name:var(--font-hind)]">
          Scholar Sync summarizes long meeting notes, highlighting definitions,
          questions, and important concepts for academic discussions. Providing quick
          review summaries that help with exam preparation or project follow-ups
        </p>
      </div>

      {/* Right Panel - Login UI (Now configured as a floating rounded box) */}
      <div className="w-full lg:w-[40%] flex justify-center items-center relative z-10 px-4 lg:-ml-[5%] xl:-ml-[5%] lg:mr-auto">

        {/* Floating White Container */}
        <div className="w-full max-w-lg lg:w-[85%] lg:h-[85%] bg-white rounded-[20px] shadow-2xl flex flex-col relative overflow-hidden py-12 px-8 font-[family-name:var(--font-hind)]">

          {/* Top Header Information Stack */}
          <div className="mb-auto">
            <h2 className="text-[#0095FF] text-3xl font-bold tracking-wide mb-4">
              Scholar Sync
            </h2>
            <div className="text-[0.80rem] font-medium space-y-2">
              <p className="text-[#0095FF] opacity-90">
                Don't have an Account? <span className="font-bold text-[#0095FF] cursor-pointer hover:underline opacity-100">Create a new Account now!</span>
              </p>
              <p className="text-[#0095FF] opacity-80">
                It's FREE and would take less than a minute.
              </p>
            </div>
          </div>

          {/* Center Focal Point - Google Sign in */}
          <div className="flex flex-col justify-center items-center my-12">
            <div className="flex flex-col items-center mb-8">
              <h1 className="text-[#0095FF] text-[2.75rem] font-bold leading-tight tracking-wide">Sign In</h1>
              <p className="text-[#0095FF] text-lg font-semibold my-1 tracking-wide">with</p>
              <h1 className="text-[#0095FF] text-[2.75rem] font-bold leading-tight tracking-wide">Google</h1>
            </div>

            <div className="w-full max-w-xs border-t border-blue-200 mb-8 opacity-70"></div>

            {/* Custom Solid Blue Box Google Button Wrapper */}
            <button
              onClick={handleGoogleLogin}
              className="group flex items-center bg-[#0095FF] hover:bg-blue-600 transition-colors shadow-md w-64 h-12 rounded-[2px] overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0095FF]"
            >
              <div className="bg-white flex items-center justify-center w-12 h-10 ml-1 rounded-[1px]">
                <img
                  className="h-[22px] w-[22px]"
                  src="https://www.svgrepo.com/show/475656/google-color.svg"
                  alt="Google Logo"
                />
              </div>
              <span className="text-white font-medium text-[13px] tracking-wide flex-1 text-center pr-4 font-[family-name:var(--font-inter)]">
                Sign in with Google
              </span>
            </button>
          </div>

          {/* Bottom spacing spacer */}
          <div className="mt-auto"></div>

        </div>
      </div>

    </div>
  );
}