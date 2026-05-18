import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface Session {
  id: string;
  name: string;
  path: string;
  video_path: string;
  created_at: number;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const data = await invoke<Session[]>('get_sessions');
        setSessions(data);
        if (data.length > 0) {
          setSelectedSession(data[0]);
        }
      } catch (error) {
        console.error("Failed to fetch sessions", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  return (
    <div className="flex h-screen bg-[#0f0f11] text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <div className="w-72 bg-[#18181b] flex flex-col border-r border-white/5 shadow-xl z-10">
        <div className="px-5 py-6 border-b border-white/5">
          <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"></div>
            Cognito Gallery
          </h1>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide py-3 px-2 space-y-1">
          {isLoading ? (
            <div className="text-center text-sm text-gray-500 mt-10">Scanning Downloads...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-sm text-gray-500 mt-10 px-4">
              No recordings found in<br/><span className="font-mono text-xs">~/Downloads/CognitoCall</span>
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className={`w-full text-left p-3 rounded-lg transition-all duration-200 group ${
                  selectedSession?.id === session.id 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >
                <h2 className="text-sm font-medium truncate">{session.name}</h2>
                <p className={`text-xs mt-1 ${selectedSession?.id === session.id ? 'text-blue-200' : 'text-gray-500 group-hover:text-gray-400'}`}>
                  {new Date(session.created_at * 1000).toLocaleDateString(undefined, { 
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                  })}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-black relative overflow-hidden">
        {selectedSession ? (
          <div className="flex-1 p-8 flex flex-col items-center justify-center animate-in fade-in duration-500">
            <div className="w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <video
                key={selectedSession.video_path}
                controls
                autoPlay
                className="w-full h-full object-contain bg-[#0a0a0c]"
                src={convertFileSrc(selectedSession.video_path)}
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  console.error("Video Error:", target.error);
                  alert(`Video playback error: ${target.error?.message || target.error?.code}`);
                }}
                onCanPlay={() => console.log("Video can play!")}
              />
            </div>
            
            <div className="mt-8 text-center max-w-2xl">
              <h2 className="text-2xl font-medium text-white tracking-tight">{selectedSession.name}</h2>
              <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full bg-white/5 ring-1 ring-white/10">
                <span className="text-xs font-mono text-gray-400">{selectedSession.path}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center flex flex-col items-center gap-3">
              <p>Select a session to begin playback</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
