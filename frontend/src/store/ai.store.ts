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
  console.log("Attempting to connect to:", url);
  console.log("Payload:", JSON.stringify(payload));

  const token = localStorage.getItem('auth_token');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(payload),
  });

  // Log the raw response status
  console.log("Response status:", response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Backend error response:", errorText);
    throw new Error(`AI service failed with status ${response.status}`);
  }

  const data = await response.json();
  set({ 
    result: data.summary || data.insight || data.analysis, 
    loading: false 
  });
} catch (err: any) {
  console.error("Fetch error details:", err);
  set({ error: err.message, loading: false });
}
  },
}));