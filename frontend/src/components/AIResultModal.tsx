import { useAIStore } from '@/store/ai.store';

export default function AIResultModal({ onClose }: { onClose: () => void }) {
  const { loading, result, error } = useAIStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">AI Insights</h2>
        
        {loading && <div className="py-10 text-center text-gray-500">Analyzing data... (takes up to 20s)</div>}
        
        {error && <div className="p-4 bg-red-50 text-red-600 rounded">{error}</div>}
        
        {result && (
          <div className="bg-gray-50 p-4 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
            {result}
          </div>
        )}
        
        <button 
          onClick={onClose}
          className="mt-6 w-full bg-[#0095FF] text-white py-2 rounded font-bold hover:bg-blue-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}