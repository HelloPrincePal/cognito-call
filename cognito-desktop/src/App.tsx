import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Home, Compass, ListTodo, Loader2, Edit2, ChevronRight, Search, Video } from 'lucide-react';
import KaraokePlayer from './components/Player';
import OnboardingModal from './components/OnboardingModal';

interface Session {
  id: string;
  name: string;
  display_name: string;
  path: string;
  video_path: string;
  created_at: number;
  is_processing: boolean;
  has_summary: boolean;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // User name onboarding states
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('cognito_user_name') || '');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !localStorage.getItem('cognito_user_name'));

  // Navigation states
  const [currentView, setCurrentView] = useState<'home' | 'meetings' | 'action_items'>('meetings');

  // Title edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");

  // Fetch all sessions
  const fetchSessions = async (selectId?: string, overrideName?: string) => {
    try {
      setIsLoading(true);
      const activeName = overrideName || userName || 'Me';
      const data = await invoke<Session[]>('get_sessions', { userName: activeName });
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

    const unlisten = listen('transcription-progress', (event) => {
      try {
        const data = JSON.parse(event.payload as string);
        if (data.status === 'complete' || data.status === 'finished' || data.status === 'error') {
          // Re-fetch sessions to update statuses and names
          fetchSessions();
        }
      } catch (e) {
        console.error("Error parsing progress event in App.tsx", e);
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        invoke('cancel_transcription')
          .then(() => {
            fetchSessions();
          })
          .catch((err) => {
            console.log("Cancel ignored or no process running:", err);
          });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unlisten.then(f => f());
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Update selectedSession if it is currently selected and sessions list changes
  useEffect(() => {
    if (selectedSession) {
      const updated = sessions.find(s => s.id === selectedSession.id);
      if (updated) {
        setSelectedSession(updated);
      }
    }
  }, [sessions]);

  const handleRename = async () => {
    if (!selectedSession || !editTitleText.trim()) return;
    try {
      await invoke('rename_session', { path: selectedSession.path, newName: editTitleText });
      setIsEditingTitle(false);
      await fetchSessions(selectedSession.id);
      setSelectedSession(prev => prev ? { ...prev, name: editTitleText, display_name: editTitleText } : null);
    } catch (e) {
      alert("Failed to rename: " + e);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans antialiased overflow-hidden select-none">
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentView === 'home' && !selectedSession
                  ? 'bg-[#F2F4F7] text-[#101828]'
                  : 'text-[#475467] hover:bg-[#F2F4F7]/50 hover:text-[#101828]'
              }`}
            >
              <Home className={`w-5 h-5 flex-shrink-0 ${currentView === 'home' && !selectedSession ? 'text-[#335CFF]' : ''}`} />
              <span className="flex-1 text-left">Home</span>
              {(currentView === 'home' && !selectedSession) && <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>

            {/* Nav: All Meeting */}
            <button
              onClick={() => {
                setSelectedSession(null);
                setCurrentView('meetings');
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentView === 'meetings' && !selectedSession
                  ? 'bg-[#F2F4F7] text-[#101828]'
                  : 'text-[#475467] hover:bg-[#F2F4F7]/50 hover:text-[#101828]'
              }`}
            >
              <Compass className={`w-5 h-5 flex-shrink-0 ${currentView === 'meetings' && !selectedSession ? 'text-[#335CFF]' : ''}`} />
              <span className="flex-1 text-left">All Meeting</span>
              {(currentView === 'meetings' && !selectedSession) && <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>

            {/* Nav: Action Items */}
            <button
              onClick={() => {
                setSelectedSession(null);
                setCurrentView('action_items');
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                currentView === 'action_items' && !selectedSession
                  ? 'bg-[#F2F4F7] text-[#101828]'
                  : 'text-[#475467] hover:bg-[#F2F4F7]/50 hover:text-[#101828]'
              }`}
            >
              <ListTodo className={`w-5 h-5 flex-shrink-0 ${currentView === 'action_items' && !selectedSession ? 'text-[#335CFF]' : ''}`} />
              <span className="flex-1 text-left">Action Items</span>
              {(currentView === 'action_items' && !selectedSession) && <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-5 border-t border-[#EBEBEB] flex items-center gap-3 mt-auto cursor-pointer hover:bg-gray-50/80 transition-all select-none">
          <div className="w-10 h-10 rounded-full bg-[#F2F4F7] flex items-center justify-center font-bold text-gray-700 text-sm overflow-hidden border border-gray-200">
            PP
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 truncate">
                Prince Pal
              </span>
              <svg className="w-3.5 h-3.5 text-[#335CFF] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500 truncate">
              hello@princepal.me
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 h-full flex flex-col bg-white overflow-hidden">
        {/* Global Top Header */}
        <div className="h-16 px-8 border-b border-[#EBEBEB] flex items-center justify-between flex-shrink-0 bg-white">
          {/* Left: Greeting */}
          <div className="flex flex-col select-none">
            <h2 className="text-sm font-bold text-gray-900 leading-tight">Good Morning, Prince Pal</h2>
            <p className="text-[11px] text-[#475467]">Welcome back to Cognito Call 👋🏻</p>
          </div>

          {/* Right: Search & Action Button */}
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3" />
              <input
                type="text"
                placeholder="Search..."
                className="w-56 pl-8 pr-10 py-1.5 bg-[#F9FAFB] border border-[#EBEBEB] rounded-lg text-xs focus:outline-none focus:border-[#335CFF] focus:bg-white transition-all text-gray-805"
              />
              <span className="absolute right-2.5 text-[9px] font-bold text-[#475467] bg-white px-1.5 py-0.5 border border-[#EBEBEB] rounded font-mono select-none pointer-events-none">
                ⌘ K
              </span>
            </div>

            {/* Start Magic Button */}
            <button
              onClick={async () => {
                const targetSession = selectedSession || sessions[0];
                if (targetSession && !targetSession.has_summary && !targetSession.is_processing) {
                  try {
                    await invoke('process_recording', { folderPath: targetSession.path });
                    fetchSessions(targetSession.id);
                  } catch (error) {
                    alert(error);
                  }
                }
              }}
              className="hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border-none bg-transparent p-0"
            >
              <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', fontSynthesis: 'none', gap: '12px', MozOsxFontSmoothing: 'grayscale', position: 'relative', WebkitFontSmoothing: 'antialiased' }}>
                <div style={{ alignItems: 'center', backgroundColor: '#335CFF', borderRadius: '10px', boxSizing: 'border-box', display: 'flex', gap: '4px', justifyContent: 'center', overflow: 'clip', padding: '10px 14px' }}>
                  <div style={{ boxSizing: 'border-box', flexShrink: '0', height: '16px', overflow: 'clip', position: 'relative', width: '16px' }}>
                    <svg viewBox="0 0 15.97 12.5" preserveAspectRatio="none" width="12" height="10" xmlns="http://www.w3.org/2000/svg" style={{ width: 'round(79.8611%, 1px)', height: 'round(62.5%, 1px)', left: '8.33333%', top: '15.2778%', overflowX: 'visible', overflowY: 'visible', position: 'absolute' }}>
                      <path d="M3.273 4.950C3.578 4.250 4.128 3.692 4.814 3.387C4.814 3.387 5.342 3.152 5.342 3.152C5.627 3.025 5.627 2.610 5.342 2.483C5.342 2.483 4.844 2.262 4.844 2.262C4.140 1.949 3.580 1.371 3.280 0.646C3.280 0.646 3.105 0.222 3.105 0.222C2.982 -0.074 2.573 -0.074 2.451 0.222C2.451 0.222 2.275 0.646 2.275 0.646C1.975 1.371 1.416 1.949 0.712 2.262C0.712 2.262 0.214 2.483 0.214 2.483C-0.071 2.610 -0.071 3.025 0.214 3.152C0.214 3.152 0.741 3.387 0.741 3.387C1.427 3.692 1.977 4.250 2.282 4.950C2.282 4.950 2.454 5.343 2.454 5.343C2.579 5.630 2.977 5.630 3.102 5.343C3.102 5.343 3.273 4.950 3.273 4.950ZM0.694 11.806C0.694 11.806 0.694 6.944 0.694 6.944C0.694 6.944 2.083 6.944 2.083 6.944C2.083 6.944 2.083 11.111 2.083 11.111C2.083 11.111 10.417 11.111 10.417 11.111C10.417 11.111 10.417 2.778 10.417 2.778C10.417 2.778 6.944 2.778 6.944 2.778C6.944 2.778 6.944 1.389 6.944 1.389C6.944 1.389 11.111 1.389 11.111 1.389C11.495 1.389 11.806 1.700 11.806 2.083C11.806 2.083 11.806 5.000 11.806 5.000C11.806 5.000 15.426 2.466 15.426 2.466C15.583 2.356 15.800 2.394 15.909 2.551C15.950 2.609 15.972 2.679 15.972 2.750C15.972 2.750 15.972 11.139 15.972 11.139C15.972 11.330 15.817 11.486 15.625 11.486C15.554 11.486 15.484 11.464 15.426 11.423C15.426 11.423 11.806 8.889 11.806 8.889C11.806 8.889 11.806 11.806 11.806 11.806C11.806 12.189 11.495 12.500 11.111 12.500C11.111 12.500 1.389 12.500 1.389 12.500C1.005 12.500 0.694 12.189 0.694 11.806ZM11.806 7.194C11.806 7.194 14.583 9.138 14.583 9.138C14.583 9.138 14.583 4.751 14.583 4.751C14.583 4.751 11.806 6.695 11.806 6.695C11.806 6.695 11.806 7.194 11.806 7.194Z" fillRule="evenodd" fill="#FFFFFF" />
                    </svg>
                  </div>
                  <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', paddingInline: '2px' }}>
                    <div style={{ alignContent: 'center', boxSizing: 'border-box', color: '#FFFFFF', flexShrink: '0', fontFamily: '"Inter-Medium", "Inter", system-ui, sans-serif', fontSize: '13px', fontWeight: 500, lineHeight: '18px', width: 'max-content' }}>
                      Start Magic
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {selectedSession ? (
          /* Detailed Player View */
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Top Workspace Header (Breadcrumb, Title & Metadata) */}
            <div className="py-6 px-8 flex flex-col gap-2 flex-shrink-0 bg-white border-b border-[#EBEBEB]">
              {/* Breadcrumb Hierarchy */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500 select-none">
                <span className="hover:text-[#101828] cursor-pointer font-medium" onClick={() => setSelectedSession(null)}>All Meetings</span>
                <span className="text-gray-300">&gt;</span>
                <span className="text-gray-400 font-medium truncate max-w-xs">{selectedSession.display_name}</span>
              </div>
              
              {/* Title & Rename Block */}
              <div className="flex justify-between items-start gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 group min-w-0">
                    {isEditingTitle ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitleText}
                          onChange={(e) => setEditTitleText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                          className="text-2xl font-bold border-b border-[#335CFF] focus:outline-none py-0.5 bg-transparent max-w-md text-gray-900"
                          autoFocus
                        />
                        <button
                          onClick={handleRename}
                          className="px-2.5 py-1 bg-[#335CFF] text-white rounded-md text-[10px] font-bold hover:bg-[#335CFF]/90 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingTitle(false);
                            setEditTitleText(selectedSession.display_name);
                          }}
                          className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-[10px] font-bold hover:bg-gray-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 truncate">
                          {selectedSession.display_name}
                        </h1>
                        <button
                          onClick={() => {
                            setIsEditingTitle(true);
                            setEditTitleText(selectedSession.display_name);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#335CFF] hover:bg-gray-50 rounded-md transition-all cursor-pointer flex-shrink-0"
                          title="Rename Meeting"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Metadata subtitle */}
                  <span className="text-xs text-[#475467] font-medium mt-0.5">
                    {new Date(selectedSession.created_at * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedSession(null)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 text-[#475467] cursor-pointer transition-all shadow-sm bg-white"
                >
                  Close View
                </button>
              </div>
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
        ) : currentView === 'action_items' ? (
          /* Action Items checklist view */
          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 bg-white">
            <div className="flex justify-between items-center select-none border-b border-[#EBEBEB] pb-4">
              <div>
                <h1 className="text-2xl font-bold text-[#101828]">Task Checklist</h1>
                <p className="text-xs text-gray-500 mt-1">Checklist of action items aggregated across your meetings.</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-4 max-w-2xl bg-white border border-[#EBEBEB] rounded-xl p-6 shadow-sm">
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400 select-none">
                <ListTodo className="w-12 h-12 text-[#335CFF] mb-3" />
                <p className="text-sm font-semibold text-gray-650">Select a meeting from "All Meeting" to view and edit task checklists</p>
                <button
                  onClick={() => setCurrentView('meetings')}
                  className="mt-4 px-4 py-2 bg-[#335CFF] text-white rounded-lg text-xs font-semibold hover:bg-[#335CFF]/90 transition-all cursor-pointer border-none"
                >
                  View Meetings
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard Grid View (Home and Meetings view share this clean grid) */
          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 bg-white">
            {/* Session Grid */}
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center select-none">
                <h2 className="font-bold text-xs text-gray-400 uppercase tracking-wider">
                  Recent Meetings
                </h2>
                {sessions.length > 0 && (
                  <span className="text-xs text-[#475467] font-medium">
                    {sessions.length} meeting{sessions.length > 1 ? 's' : ''} total
                  </span>
                )}
              </div>

              {isLoading && sessions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#EBEBEB] rounded-xl bg-white text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-[#335CFF] animate-spin" />
                  <span>Scanning records folder...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#EBEBEB] rounded-xl bg-white px-6">
                  <Video className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="font-semibold text-[#101828]">No meeting recordings found</p>
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
                      className="bg-white border border-[#EBEBEB] rounded-xl p-5 hover:border-[#335CFF] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between h-40 shadow-sm"
                    >
                      <div>
                        {session.is_processing ? (
                          <div className="flex flex-col gap-2 select-none">
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-full mt-2" />
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
                          </div>
                        ) : (
                          <>
                            <h3 className="font-bold text-base text-[#101828] line-clamp-1" title={session.display_name}>
                              {session.display_name}
                            </h3>
                            <p className="text-xs text-[#475467] mt-2 leading-relaxed line-clamp-2">
                              {session.is_processing 
                                ? "AI processing meeting transcript and notes..."
                                : "Review meeting details, transcript, and notes."}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <div />
                        <span className="text-[11px] text-[#475467] font-semibold uppercase tracking-wider bg-[#F9FAFB] px-2 py-0.5 rounded border border-[#EBEBEB]">
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

      {showOnboarding && (
        <OnboardingModal
          onSave={(name) => {
            setUserName(name);
            setShowOnboarding(false);
            fetchSessions(undefined, name);
          }}
        />
      )}
    </div>
  );
}

export default App;
