import { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import KaraokePlayer from './components/Player';

interface Session {
  id: string;
  name: string;
  path: string;
  video_path: string;
  created_at: number;
}

interface SessionDetails {
  name: string;
  notes: string;
  action_items: string;
  transcript_exists: boolean;
}

interface TaskItem {
  text: string;
  done: boolean;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Navigation states
  const [activeTab, setActiveTab] = useState<'transcript' | 'notes' | 'action_items'>('transcript');
  const [currentView, setCurrentView] = useState<'home' | 'meetings' | 'action_items_global'>('home');

  // Title edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");

  // Notes save status
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

  // New action item state
  const [newTaskText, setNewTaskText] = useState("");

  // Global actions cache for the dashboard
  const [globalPendingTasksCount, setGlobalPendingTasksCount] = useState(0);
  const [transcribedCount, setTranscribedCount] = useState(0);

  // Fetch all sessions
  const fetchSessions = async (selectId?: string) => {
    try {
      setIsLoading(true);
      const data = await invoke<Session[]>('get_sessions');
      setSessions(data);
      
      // Calculate global stats
      let transcribed = 0;
      let pendingTasks = 0;
      
      for (const session of data) {
        // Fetch details to aggregate pending tasks
        try {
          const details = await invoke<SessionDetails>('get_session_details', { path: session.path });
          if (details.notes || details.action_items) {
            // Count pending tasks
            const items = parseActionItems(details.action_items);
            pendingTasks += items.filter(t => !t.done).length;
          }
          if (details.transcript_exists) {
            transcribed += 1;
          }
        } catch (e) {
          console.error(e);
        }
      }
      
      setTranscribedCount(transcribed);
      setGlobalPendingTasksCount(pendingTasks);

      if (selectId) {
        const found = data.find(s => s.id === selectId);
        if (found) setSelectedSession(found);
      } else if (data.length > 0 && !selectedSession) {
        // Don't auto-select on home view, let it be null so we see the dashboard
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

  // Fetch details when selectedSession changes
  useEffect(() => {
    if (!selectedSession) {
      setSessionDetails(null);
      setNotes("");
      setTasks([]);
      return;
    }

    const fetchDetails = async () => {
      try {
        const details = await invoke<SessionDetails>('get_session_details', { path: selectedSession.path });
        setSessionDetails(details);
        setNotes(details.notes || getDefaultNotesPlaceholder());
        setTasks(parseActionItems(details.action_items));
        setEditTitleText(details.name);
        setHasUnsavedNotes(false);
      } catch (error) {
        console.error("Failed to fetch session details", error);
      }
    };

    fetchDetails();
    setActiveTab('transcript'); // Reset tab to transcript on session load
  }, [selectedSession]);

  const parseActionItems = (text: string): TaskItem[] => {
    if (!text.trim()) {
      return [];
    }
    return text.split("\n").filter(line => line.trim().length > 0).map(line => {
      if (line.startsWith("[x] ") || line.startsWith("[X] ")) {
        return { text: line.substring(4), done: true };
      } else if (line.startsWith("[ ] ")) {
        return { text: line.substring(4), done: false };
      } else {
        return { text: line, done: false };
      }
    });
  };

  const serializeActionItems = (items: TaskItem[]): string => {
    return items.map(item => `${item.done ? "[x]" : "[ ]"} ${item.text}`).join("\n");
  };

  const getDefaultNotesPlaceholder = () => {
    return `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 

Key Discussions:
- Discussed the implementation of the new Cognito Call layout based on modern design systems.
- Reviewed options to store meeting rename metadata locally offline-first.
- Planned timeline for finalizing transcription sidecar features.`;
  };

  const handleRename = async () => {
    if (!selectedSession || !editTitleText.trim()) return;
    try {
      await invoke('rename_session', { path: selectedSession.path, newName: editTitleText });
      setIsEditingTitle(false);
      // Reload session details and session list
      await fetchSessions(selectedSession.id);
      setSessionDetails(prev => prev ? { ...prev, name: editTitleText } : null);
    } catch (e) {
      alert("Failed to rename: " + e);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedSession) return;
    try {
      setIsSavingNotes(true);
      await invoke('save_session_notes', { path: selectedSession.path, notes });
      setHasUnsavedNotes(false);
    } catch (e) {
      alert("Failed to save notes: " + e);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleToggleTask = async (index: number) => {
    if (!selectedSession || !sessionDetails) return;
    const updatedTasks = [...tasks];
    updatedTasks[index].done = !updatedTasks[index].done;
    setTasks(updatedTasks);
    
    // Save immediately
    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: selectedSession.path, actionItems: serialized });
    } catch (e) {
      console.error("Failed to save action items", e);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !newTaskText.trim()) return;
    
    const updatedTasks = [...tasks, { text: newTaskText.trim(), done: false }];
    setTasks(updatedTasks);
    setNewTaskText("");

    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: selectedSession.path, actionItems: serialized });
    } catch (e) {
      console.error("Failed to add task", e);
    }
  };

  const handleDeleteTask = async (index: number) => {
    if (!selectedSession) return;
    const updatedTasks = tasks.filter((_, i) => i !== index);
    setTasks(updatedTasks);

    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: selectedSession.path, actionItems: serialized });
    } catch (e) {
      console.error("Failed to delete task", e);
    }
  };

  // Filtered sessions for sidebar and main dashboard
  const filteredSessions = sessions.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-[#FFFFFF] text-[#171717] font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <div className="w-[272px] h-full bg-[#FFFFFF] border-r border-[#EBEBEB] flex flex-col flex-shrink-0">
        {/* Sidebar Header: Logo & Branding */}
        <div className="px-5 py-4 border-b border-[#EBEBEB] flex items-center gap-3">
          <img src="/Logo_icon.svg" alt="Cognito Icon" className="w-[38px] h-[38px] object-contain" />
          <span className="font-semibold text-lg text-[#101828] tracking-tight select-none">
            Cognito Call
          </span>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="px-3 text-[10px] font-bold text-[#A3A3A3] uppercase tracking-wider select-none mb-1">
              Main
            </span>
            
            {/* Nav: Home */}
            <button
              onClick={() => {
                setSelectedSession(null);
                setCurrentView('home');
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                currentView === 'home' && !selectedSession
                  ? 'bg-[#F7F7F7] text-[#335CFF] font-semibold'
                  : 'text-[#5C5C5C] hover:bg-[#F7F7F7] hover:text-[#171717]'
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </button>

            {/* Nav: All Meetings Header */}
            <button
              onClick={() => {
                setCurrentView('meetings');
                if (sessions.length > 0 && !selectedSession) {
                  setSelectedSession(sessions[0]);
                }
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                (currentView === 'meetings' || selectedSession)
                  ? 'bg-[#F7F7F7] text-[#335CFF] font-semibold'
                  : 'text-[#5C5C5C] hover:bg-[#F7F7F7] hover:text-[#171717]'
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              All Meetings
            </button>

            {/* Nested Session List */}
            {(currentView === 'meetings' || selectedSession) && (
              <div className="pl-6 pr-1 mt-1 flex flex-col gap-1 border-l border-[#EBEBEB] ml-5">
                {isLoading && sessions.length === 0 ? (
                  <span className="text-xs text-[#A3A3A3] py-2 px-2">Loading sessions...</span>
                ) : filteredSessions.length === 0 ? (
                  <span className="text-xs text-[#A3A3A3] py-2 px-2">No meetings found</span>
                ) : (
                  filteredSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => {
                        setSelectedSession(session);
                        setCurrentView('meetings');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-all truncate ${
                        selectedSession?.id === session.id
                          ? 'bg-[#EFEFEF] text-[#171717] font-semibold'
                          : 'text-[#5C5C5C] hover:bg-[#F7F7F7] hover:text-[#171717]'
                      }`}
                      title={session.name}
                    >
                      {session.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer: Profile Card */}
        <div className="p-4 border-t border-[#EBEBEB] flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#CAC0FF] flex items-center justify-center font-bold text-[#335CFF] text-sm shadow-inner">
            PP
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-[#171717] truncate select-none">
              Prince Pal
            </span>
            <span className="text-xs text-[#5C5C5C] truncate select-none">
              hello@princepal.me
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 h-full flex flex-col bg-[#FFFFFF] overflow-hidden">
        {/* Top Header Bar */}
        <div className="h-20 px-8 border-b border-[#EBEBEB] flex items-center justify-between flex-shrink-0">
          {/* Greetings / Breadcrumb */}
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[#171717] text-lg font-semibold tracking-tight select-none">
              Good Morning, Prince Pal
            </h2>
            <p className="text-xs text-[#5C5C5C] select-none">
              Welcome back to Cognito Call 👋🏻
            </p>
          </div>

          {/* Actions: Search & Start Magic */}
          <div className="flex items-center gap-4">
            {/* Search Bar */}
            <div className="relative w-80">
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#EBEBEB] rounded-lg py-2 pl-9 pr-12 text-sm text-[#171717] focus:outline-none focus:border-[#335CFF] focus:ring-1 focus:ring-[#335CFF] transition-all placeholder-[#A3A3A3] shadow-sm"
              />
              <svg className="w-4 h-4 text-[#A3A3A3] absolute left-3 top-[11px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <div className="absolute right-3 top-[8px] px-1.5 py-0.5 border border-[#EBEBEB] rounded text-[10px] font-bold text-[#A3A3A3] select-none">
                ⌘K
              </div>
            </div>

            {/* Start Magic CTA */}
            <button
              onClick={() => fetchSessions()}
              className="bg-[#335CFF] text-[#FFFFFF] text-sm font-semibold px-4 py-2 rounded-lg shadow-[0_1px_2px_rgba(10,13,20,0.08)] hover:bg-[#0c38e7] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.29M21 3v5h-5" />
              </svg>
              Sync Records
            </button>
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-hidden relative">
          {selectedSession ? (
            /* Meeting View Details */
            <div className="h-full flex flex-col p-8 overflow-hidden">
              {/* Breadcrumb Hierarchy */}
              <div className="flex items-center gap-1.5 text-xs text-[#5C5C5C] select-none mb-3">
                <span className="hover:text-[#171717] cursor-pointer" onClick={() => setSelectedSession(null)}>All Meetings</span>
                <span>/</span>
                <span className="text-[#A3A3A3] font-medium truncate max-w-xs">{selectedSession.name}</span>
              </div>

              {/* Title & Rename Block */}
              <div className="flex items-center gap-3 mb-6 group">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitleText}
                      onChange={(e) => setEditTitleText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                      className="text-2xl font-bold border-b-2 border-[#335CFF] focus:outline-none py-1 bg-transparent max-w-lg"
                      autoFocus
                    />
                    <button
                      onClick={handleRename}
                      className="px-3 py-1 bg-[#335CFF] text-white rounded text-xs font-semibold hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingTitle(false);
                        setEditTitleText(selectedSession.name);
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs font-semibold hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
                      {selectedSession.name}
                    </h1>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[#5C5C5C] hover:text-[#335CFF] hover:bg-[#F7F7F7] rounded-md transition-all"
                      title="Rename Meeting"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#EBEBEB] gap-6 mb-6 flex-shrink-0 select-none">
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={`pb-3 text-sm font-semibold tracking-wide border-b-2 transition-all ${
                    activeTab === 'transcript'
                      ? 'border-[#335CFF] text-[#335CFF]'
                      : 'border-transparent text-[#5C5C5C] hover:text-[#171717]'
                  }`}
                >
                  Transcript
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`pb-3 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
                    activeTab === 'notes'
                      ? 'border-[#335CFF] text-[#335CFF]'
                      : 'border-transparent text-[#5C5C5C] hover:text-[#171717]'
                  }`}
                >
                  Notes
                  {hasUnsavedNotes && (
                    <span className="absolute top-0.5 right-[-6px] w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('action_items')}
                  className={`pb-3 text-sm font-semibold tracking-wide border-b-2 transition-all ${
                    activeTab === 'action_items'
                      ? 'border-[#335CFF] text-[#335CFF]'
                      : 'border-transparent text-[#5C5C5C] hover:text-[#171717]'
                  }`}
                >
                  Action Items {tasks.length > 0 && `(${tasks.filter(t => !t.done).length})`}
                </button>
              </div>

              {/* Tab Display Area */}
              <div className="flex-1 min-h-0">
                {activeTab === 'transcript' && (
                  <KaraokePlayer
                    key={selectedSession.id}
                    folderPath={selectedSession.path}
                    videoUrl={convertFileSrc(selectedSession.video_path)}
                    transcriptUrl={convertFileSrc(`${selectedSession.path}/transcript.json`)}
                  />
                )}

                {activeTab === 'notes' && (
                  <div className="h-full flex flex-col bg-[#F9F9FB] rounded-xl border border-[#EBEBEB] p-6">
                    <div className="flex justify-between items-center mb-4 flex-shrink-0">
                      <span className="text-xs font-semibold text-[#5C5C5C]">
                        {hasUnsavedNotes ? "⚠️ Unsaved changes" : "✓ Saved offline"}
                      </span>
                      <button
                        onClick={handleSaveNotes}
                        disabled={isSavingNotes || !hasUnsavedNotes}
                        className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all ${
                          hasUnsavedNotes
                            ? 'bg-[#335CFF] text-white hover:bg-blue-700 shadow-sm'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isSavingNotes ? "Saving..." : "Save Notes"}
                      </button>
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setHasUnsavedNotes(true);
                      }}
                      className="flex-1 w-full bg-[#FFFFFF] border border-[#EBEBEB] rounded-lg p-4 text-sm text-[#171717] focus:outline-none focus:border-[#335CFF] leading-relaxed resize-none shadow-inner"
                      placeholder="Start typing meeting notes..."
                    />
                  </div>
                )}

                {activeTab === 'action_items' && (
                  <div className="h-full flex flex-col bg-[#F9F9FB] rounded-xl border border-[#EBEBEB] p-6 overflow-hidden">
                    <h3 className="text-sm font-bold text-[#171717] mb-4 flex-shrink-0">
                      Task Checklist
                    </h3>
                    
                    {/* Tasks List */}
                    <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
                      {tasks.length === 0 ? (
                        /* Empty Tasks Placeholder */
                        <div className="flex flex-col items-center justify-center py-12 text-center text-[#5C5C5C]">
                          <svg className="w-12 h-12 text-[#A3A3A3] mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="text-sm font-semibold">No action items defined yet</p>
                          <p className="text-xs text-[#A3A3A3] mt-1">Add tasks below to start tracking objectives.</p>
                        </div>
                      ) : (
                        tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-white border border-[#EBEBEB] rounded-lg p-3 shadow-sm hover:border-[#335CFF] group transition-all"
                          >
                            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 py-0.5">
                              <input
                                type="checkbox"
                                checked={task.done}
                                onChange={() => handleToggleTask(idx)}
                                className="w-4.5 h-4.5 text-[#335CFF] rounded border-gray-300 focus:ring-[#335CFF]"
                              />
                              <span className={`text-sm ${task.done ? 'line-through text-[#A3A3A3]' : 'text-[#171717]'} truncate`}>
                                {task.text}
                              </span>
                            </label>
                            <button
                              onClick={() => handleDeleteTask(idx)}
                              className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all ml-2"
                              title="Delete Item"
                            >
                              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Task Input Form */}
                    <form onSubmit={handleAddTask} className="flex gap-2 flex-shrink-0">
                      <input
                        type="text"
                        placeholder="Add a new action item..."
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        className="flex-1 bg-[#FFFFFF] border border-[#EBEBEB] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#335CFF]"
                      />
                      <button
                        type="submit"
                        className="bg-[#335CFF] text-[#FFFFFF] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 active:scale-[0.98] transition-all"
                      >
                        Add Task
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Dashboard View */
            <div className="h-full overflow-y-auto p-8 flex flex-col gap-8">
              {/* Dashboard Hero greeting */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/40 rounded-2xl p-6 flex justify-between items-center shadow-sm select-none">
                <div>
                  <h1 className="text-2xl font-bold text-[#101828] mb-1">Cognito Dashboard</h1>
                  <p className="text-sm text-gray-600">
                    Quickly access recent meeting recordings, transcripts, and tasks.
                  </p>
                </div>
                <div className="text-4xl">🔮</div>
              </div>

              {/* Key Aggregated Statistics Cards */}
              <div className="grid grid-cols-3 gap-6 select-none">
                {/* Total meetings */}
                <div className="bg-white border border-[#EBEBEB] p-5 rounded-xl shadow-sm">
                  <span className="text-[10px] font-bold text-[#A3A3A3] uppercase tracking-wider block mb-1">
                    Total Meetings
                  </span>
                  <span className="text-3xl font-extrabold text-[#171717]">
                    {sessions.length}
                  </span>
                  <span className="text-xs text-[#5C5C5C] block mt-1.5">
                    Meetings saved offline in Downloads
                  </span>
                </div>

                {/* Pending tasks */}
                <div className="bg-white border border-[#EBEBEB] p-5 rounded-xl shadow-sm">
                  <span className="text-[10px] font-bold text-[#A3A3A3] uppercase tracking-wider block mb-1">
                    Pending Tasks
                  </span>
                  <span className="text-3xl font-extrabold text-amber-600">
                    {globalPendingTasksCount}
                  </span>
                  <span className="text-xs text-[#5C5C5C] block mt-1.5">
                    Uncompleted action items
                  </span>
                </div>

                {/* Processed count */}
                <div className="bg-white border border-[#EBEBEB] p-5 rounded-xl shadow-sm">
                  <span className="text-[10px] font-bold text-[#A3A3A3] uppercase tracking-wider block mb-1">
                    Transcribed Meetings
                  </span>
                  <span className="text-3xl font-extrabold text-[#335CFF]">
                    {transcribedCount}
                  </span>
                  <span className="text-xs text-[#5C5C5C] block mt-1.5">
                    Sessions with AI transcripts
                  </span>
                </div>
              </div>

              {/* Grid list of sessions */}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center select-none">
                  <h3 className="font-bold text-base text-[#171717]">
                    Recent Meetings
                  </h3>
                  {sessions.length > 0 && (
                    <span className="text-xs text-[#5C5C5C]">
                      Showing {filteredSessions.length} of {sessions.length} sessions
                    </span>
                  )}
                </div>

                {isLoading && sessions.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-[#EBEBEB] rounded-xl text-sm text-[#A3A3A3]">
                    Scanning folder...
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-[#EBEBEB] rounded-xl text-sm text-[#A3A3A3] px-6">
                    <p className="font-medium text-gray-500">No meeting recordings found</p>
                    <p className="text-xs text-[#A3A3A3] mt-2">
                      Make sure your WebM screen recordings are exported to <span className="font-mono bg-gray-100 p-0.5 rounded">~/Downloads/CognitoCall/</span>.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {filteredSessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => {
                          setSelectedSession(session);
                          setCurrentView('meetings');
                        }}
                        className="bg-white border border-[#EBEBEB] rounded-xl p-5 shadow-sm hover:border-[#335CFF] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-3 mb-2">
                            <h4 className="font-bold text-sm text-[#171717] line-clamp-1">
                              {session.name}
                            </h4>
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex-shrink-0">
                              WebM
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 block truncate">
                            {session.path}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-t border-gray-100 mt-4 pt-3 text-xs text-[#5C5C5C]">
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(session.created_at * 1000).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric', year: 'numeric'
                            })}
                          </div>
                          <span className="text-[#335CFF] font-semibold hover:underline flex items-center gap-0.5">
                            Open Details 
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
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
    </div>
  );
}

export default App;
