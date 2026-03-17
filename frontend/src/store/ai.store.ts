import { create } from 'zustand';

interface AIStore {
  loading: boolean;
  result: string | null;
  error: string | null;
  generate: (requestType: 'summary' | 'participation' | 'custom', payload: any) => Promise<void>;
}

export const useAIStore = create<AIStore>((set) => ({
  loading: false,
  result: null,
  error: null,
  generate: async (requestType, payload) => {
    set({ loading: true, error: null, result: null });
    
    // Mapping internal types to backend endpoint paths
    const endpoints = {
      summary: '/api/ai/summary',
      participation: '/api/ai/participation',
      custom: '/api/ai/custom-analysis'
    };

    try {
      const url = `http://localhost:5000${endpoints[requestType]}`;
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AI service failed with status ${response.status}`);
      }

      const data = await response.json();
      set({ 
        result: data.summary || data.insight || data.analysis, 
        loading: false 
      });
    } catch (err: any) {
      console.error("AI Fetch Error:", err);
      set({ error: err.message, loading: false });
    }
  },
}));
