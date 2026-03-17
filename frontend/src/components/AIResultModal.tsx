'use client';

import { useAIStore } from '@/store/ai.store';

export default function AIResultModal({ onClose }: { onClose: () => void }) {
  const { loading, result, error } = useAIStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-[#0095FF] to-[#4FB6DF] px-6 py-4 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold">AI Insights</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6">
          {loading && (
            <div className="py-12 text-center flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium tracking-tight">Analyzing data... (takes up to 20s)</p>
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold">{error}</span>
            </div>
          )}
          
          {result && (
            <div className="bg-slate-50 p-6 rounded-xl text-sm text-gray-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed border border-slate-100 shadow-inner custom-scrollbar">
              {result}
            </div>
          )}
          
          <button 
            onClick={onClose}
            className="mt-8 w-full bg-[#0095FF] text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
          >
            Close Results
          </button>
        </div>
      </div>
    </div>
  );
}
