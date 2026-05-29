import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Home, Video, Loader2, Edit2 } from 'lucide-react';
import KaraokePlayer from './components/Player';

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
  
  // Navigation states
  const [currentView, setCurrentView] = useState<'home' | 'meetings'>('home');

  // Title edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");

  // Fetch all sessions
  const fetchSessions = async (selectId?: string) => {
    try {
      setIsLoading(true);
      const data = await invoke<Session[]>('get_sessions');
      setSessions(data);
      
      if (selectId) {
        const found = data.find(s => s.id === selectId);
        if (found) setSelectedSession(found);
      }
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRename = async () => {
    if (!selectedSession || !editTitleText.trim()) return;
    try {
      await invoke('rename_session', { path: selectedSession.path, newName: editTitleText });
      setIsEditingTitle(false);
      await fetchSessions(selectedSession.id);
      setSelectedSession(prev => prev ? { ...prev, name: editTitleText } : null);
    } catch (e) {
      alert("Failed to rename: " + e);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <div className="w-[272px] h-full bg-white border-r border-[#EBEBEB] flex flex-col flex-shrink-0">
        {/* Sidebar Header: Logo & Branding */}
        <div className="px-6 py-5 border-b border-[#EBEBEB] flex items-center gap-3">
          <img src="/Logo_icon.svg" alt="Cognito Icon" className="w-[38px] h-[38px] object-contain" />
          <span className="font-bold text-lg text-[#101828] tracking-tight select-none">
            Cognito Call
          </span>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider select-none mb-2">
              MAIN
            </span>
            
            {/* Nav: Home */}
            <button
              onClick={() => {
                setSelectedSession(null);
                setCurrentView('home');
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentView === 'home' && !selectedSession
                  ? 'bg-gray-50 text-purple-600'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-955'
              }`}
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              Home
            </button>

            {/* Nav: All Meetings */}
            <button
              onClick={() => {
                setSelectedSession(null);
                setCurrentView('meetings');
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentView === 'meetings' && !selectedSession
                  ? 'bg-gray-50 text-purple-600'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-955'
              }`}
            >
              <Video className="w-5 h-5 flex-shrink-0" />
              All Meetings
            </button>

            {/* Nested Session List under All Meetings */}
            {sessions.length > 0 && (
              <div className="pl-6 mt-2 flex flex-col gap-1 border-l border-gray-100 ml-5">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setSelectedSession(session);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs font-medium transition-all truncate cursor-pointer ${
                      selectedSession?.id === session.id
                        ? 'bg-gray-50 text-gray-900 font-semibold'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={session.name}
                  >
                    {session.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-5 border-t border-[#EBEBEB] flex items-center gap-3 mt-auto">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700 text-sm select-none">
            PP
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-gray-900 truncate select-none">
              Prince Pal
            </span>
            <span className="text-xs text-gray-500 truncate select-none">
              hello@princepal.me
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 h-full flex flex-col bg-[#F9FAFB] overflow-hidden">
        {selectedSession ? (
          /* Detailed Player View */
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Top Workspace Header (Breadcrumb, Title & Rename) */}
            <div className="h-20 px-8 border-b border-[#EBEBEB] flex items-center justify-between flex-shrink-0 bg-white">
              {/* Breadcrumb Hierarchy */}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 select-none">
                  <span className="hover:text-gray-900 cursor-pointer" onClick={() => setSelectedSession(null)}>All Meetings</span>
                  <span>/</span>
                  <span className="text-gray-400 font-medium truncate max-w-xs">{selectedSession.name}</span>
                </div>
                
                {/* Title & Rename Block */}
                <div className="flex items-center gap-2 group min-w-0">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTitleText}
                        onChange={(e) => setEditTitleText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        className="text-lg font-bold border-b border-purple-600 focus:outline-none py-0.5 bg-transparent max-w-md text-gray-900"
                        autoFocus
                      />
                      <button
                        onClick={handleRename}
                        className="px-2 py-1 bg-purple-600 text-white rounded-md text-[10px] font-bold hover:bg-purple-700 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingTitle(false);
                          setEditTitleText(selectedSession.name);
                        }}
                        className="px-2 py-1 bg-gray-150 text-gray-700 rounded-md text-[10px] font-bold hover:bg-gray-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-lg font-bold tracking-tight text-gray-900 truncate">
                        {selectedSession.name}
                      </h1>
                      <button
                        onClick={() => {
                          setIsEditingTitle(true);
                          setEditTitleText(selectedSession.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-purple-600 hover:bg-gray-50 rounded-md transition-all cursor-pointer flex-shrink-0"
                        title="Rename Meeting"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Close Button */}
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 text-gray-600 cursor-pointer flex items-center gap-1.5 transition-all shadow-sm"
              >
                Close View
              </button>
            </div>

            {/* Karaoke Player component (Vertical Stack: Video on top, Tabs on bottom) */}
            <div className="flex-1 min-h-0">
              <KaraokePlayer
                key={selectedSession.id}
                folderPath={selectedSession.path}
                videoUrl={convertFileSrc(selectedSession.video_path)}
                transcriptUrl={convertFileSrc(`${selectedSession.path}/transcript.json`)}
                onTasksUpdated={() => fetchSessions()}
              />
            </div>
          </div>
        ) : (
          /* Dashboard Grid View */
          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 bg-[#F9FAFB]">
            {/* Greeting Header */}
            <div className="flex flex-col gap-1 select-none">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Good Morning, Prince Pal
              </h1>
              <p className="text-sm text-gray-500">
                Welcome back to Cognito Call 👋🏻
              </p>
            </div>

            {/* Session Grid */}
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center select-none">
                <h2 className="font-bold text-sm text-gray-400 uppercase tracking-wider">
                  Recent Meetings
                </h2>
                {sessions.length > 0 && (
                  <span className="text-xs text-gray-500 font-medium">
                    {sessions.length} meeting{sessions.length > 1 ? 's' : ''} total
                  </span>
                )}
              </div>

              {isLoading && sessions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#EBEBEB] rounded-xl bg-white text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                  <span>Scanning records folder...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#EBEBEB] rounded-xl bg-white px-6">
                  <Video className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="font-semibold text-gray-700">No meeting recordings found</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Make sure your WebM screen recordings are exported to <span className="font-mono bg-gray-50 p-1 rounded border border-gray-150">~/Downloads/CognitoCall/</span>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => {
                        setSelectedSession(session);
                      }}
                      className="bg-white border border-[#EBEBEB] rounded-xl p-5 hover:border-purple-600 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-40 shadow-sm"
                    >
                      <div>
                        <h3 className="font-bold text-base text-gray-900 line-clamp-1" title={session.name}>
                          {session.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">
                          Review meeting details, transcript, and notes.
                        </p>
                      </div>
                      <div className="flex justify-end items-center">
                        <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          {formatDate(session.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
