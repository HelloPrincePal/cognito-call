import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FileText, BookOpen, ListTodo, Save, Plus, Trash2, Download, Maximize, Minimize } from 'lucide-react';

// --- Type Definitions ---
interface Word { word: string; start: number; end: number; }
interface Segment { id: string; speaker: string; start: number; end: number; text: string; source: string; words: Word[]; }
interface Transcript { segments: Segment[]; }

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

export default function KaraokePlayer({ 
  folderPath, 
  videoUrl, 
  transcriptUrl,
  onTasksUpdated
}: { 
  folderPath: string; 
  videoUrl: string; 
  transcriptUrl?: string;
  onTasksUpdated?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Tab State
  const [activeTab, setActiveTab] = useState<'transcript' | 'notes' | 'action_items'>('transcript');

  // Details State (Notes & Tasks)
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

  // 1. Fetch transcript if it exists
  useEffect(() => {
    if (transcriptUrl) {
      fetch(transcriptUrl)
        .then(r => {
          if (!r.ok) throw new Error("Transcript file does not exist yet.");
          return r.json();
        })
        .then(setTranscript)
        .catch(err => {
          console.log(err.message);
          setTranscript(null);
        });
    }
  }, [transcriptUrl, folderPath]);

  // 2. Fetch session notes & tasks details
  const fetchSessionDetails = async () => {
    try {
      const details = await invoke<SessionDetails>('get_session_details', { path: folderPath });
      setNotes(details.notes || "");
      setTasks(parseActionItems(details.action_items));
      setHasUnsavedNotes(false);
    } catch (error) {
      console.error("Failed to fetch session details", error);
    }
  };

  useEffect(() => {
    fetchSessionDetails();
  }, [folderPath]);

  // 3. Listen for Tauri Rust events
  useEffect(() => {
    const unlisten = listen('transcription-progress', (event) => {
      try {
        const data = JSON.parse(event.payload as string);
        setStatusMessage(data.message);
        if (data.status === 'complete' || data.status === 'finished') {
          setIsProcessing(false);
          // Auto-fetch the newly generated transcript
          if (transcriptUrl) {
            fetch(`${transcriptUrl}?t=${Date.now()}`)
              .then(r => r.json())
              .then(setTranscript)
              .catch(console.error);
          }
          fetchSessionDetails();
        }
      } catch (e) { console.error(e); }
    });
    return () => { unlisten.then(f => f()); };
  }, [transcriptUrl, folderPath]);

  // 4. Trigger Rust Command
  const startTranscription = async () => {
    try {
      setIsProcessing(true);
      setStatusMessage("Spawning transcription process...");
      await invoke('process_recording', { folderPath });
    } catch (error) {
      alert(error);
      setIsProcessing(false);
    }
  };

  // 5. Karaoke Click-to-Jump
  const jumpToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  // 6. Fullscreen toggle for the video player
  const toggleFullscreen = () => {
    const el = videoContainerRef.current as (HTMLElement & {
      webkitRequestFullscreen?: () => void;
    }) | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    if (!el) return;

    const isActive = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!isActive) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    }
  };

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const handleChange = () => {
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const formatTime = (secs: number) => {
    const min = Math.floor(secs / 60);
    const sec = Math.floor(secs % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // Helper parsing/serializing action items
  const parseActionItems = (text: string): TaskItem[] => {
    if (!text.trim()) return [];
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

  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      await invoke('save_session_notes', { path: folderPath, notes });
      setHasUnsavedNotes(false);
    } catch (e) {
      alert("Failed to save notes: " + e);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleToggleTask = async (index: number) => {
    const updatedTasks = [...tasks];
    updatedTasks[index].done = !updatedTasks[index].done;
    setTasks(updatedTasks);
    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: folderPath, actionItems: serialized });
      if (onTasksUpdated) onTasksUpdated();
    } catch (e) {
      console.error("Failed to save action items", e);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const updatedTasks = [...tasks, { text: newTaskText.trim(), done: false }];
    setTasks(updatedTasks);
    setNewTaskText("");
    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: folderPath, actionItems: serialized });
      if (onTasksUpdated) onTasksUpdated();
    } catch (e) {
      console.error("Failed to add task", e);
    }
  };

  const handleDeleteTask = async (index: number) => {
    const updatedTasks = tasks.filter((_, i) => i !== index);
    setTasks(updatedTasks);
    try {
      const serialized = serializeActionItems(updatedTasks);
      await invoke('save_session_action_items', { path: folderPath, actionItems: serialized });
      if (onTasksUpdated) onTasksUpdated();
    } catch (e) {
      console.error("Failed to delete task", e);
    }
  };

  const exportTranscript = (format: 'json' | 'txt') => {
    if (!transcript) return;

    let content = "";
    let filename = "";

    if (format === 'json') {
      const cleanSegments = transcript.segments.map(seg => ({
        speaker: seg.speaker === 'Me' ? 'Prince Pal' : seg.speaker,
        start: seg.start,
        end: seg.end,
        text: seg.text
      }));
      content = JSON.stringify(cleanSegments, null, 2);
      filename = `${folderPath.split(/[/\\]/).pop()}_transcript.json`;
    } else {
      content = transcript.segments.map(seg => {
        const speaker = seg.speaker === 'Me' ? 'Prince Pal' : seg.speaker;
        return `[${formatTime(seg.start)}] ${speaker}: ${seg.text}`;
      }).join('\n');
      filename = `${folderPath.split(/[/\\]/).pop()}_transcript.txt`;
    }

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F9FAFB]">
      {/* Top Section: Video Player */}
      <div className="flex-shrink-0 w-full bg-white border-b border-gray-200 p-4 flex justify-center items-center">
        <div
          ref={videoContainerRef}
          className={`w-full bg-black overflow-hidden shadow-sm relative group ${
            isFullscreen
              ? 'max-w-none h-full flex items-center justify-center'
              : 'max-w-2xl aspect-video rounded-xl'
          }`}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full h-full object-contain"
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          />

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer border-none backdrop-blur-sm outline-none"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {!transcript && !isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all p-6 text-center">
              <p className="text-white font-semibold mb-4 text-sm max-w-xs select-none">
                No transcript is available for this recording.
              </p>
              <button 
                onClick={startTranscription} 
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-md active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer border-none"
              >
                Generate AI Transcript & Diarization
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Tabs and their Content */}
      <div className="flex-1 min-h-0 flex flex-col p-6 bg-[#F9FAFB]">
        {/* Navigation Tabs & Actions */}
        <div className="flex border-b border-gray-200 justify-between items-center mb-4 flex-shrink-0 select-none">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('transcript')}
              className={`pb-2.5 text-sm font-semibold tracking-wide border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'transcript'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              Transcript
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-2.5 text-sm font-semibold tracking-wide border-b-2 transition-all flex items-center gap-2 cursor-pointer relative ${
                activeTab === 'notes'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Notes
              {hasUnsavedNotes && (
                <span className="absolute top-1 right-[-6px] w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('action_items')}
              className={`pb-2.5 text-sm font-semibold tracking-wide border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'action_items'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <ListTodo className="w-4 h-4" />
              Action Items {tasks.length > 0 && `(${tasks.filter(t => !t.done).length})`}
            </button>
          </div>

          {/* Export Actions */}
          {activeTab === 'transcript' && transcript && (
            <div className="flex gap-2 pb-1.5">
              <button
                onClick={() => exportTranscript('json')}
                className="px-3 py-1 bg-white border border-gray-200 hover:border-purple-600 hover:text-purple-600 text-xs font-semibold text-gray-600 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 border-solid outline-none"
                title="Export segment/sentence level JSON"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                onClick={() => exportTranscript('txt')}
                className="px-3 py-1 bg-white border border-gray-200 hover:border-purple-600 hover:text-purple-600 text-xs font-semibold text-gray-600 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5 border-solid outline-none"
                title="Export plain text transcript"
              >
                <Download className="w-3.5 h-3.5" />
                Export TXT
              </button>
            </div>
          )}
        </div>
        
        {/* Tab Content (Scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'transcript' && (
            <div className="h-full bg-[#F9FAFB] rounded-xl">
              {isProcessing && (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-purple-600 select-none py-12">
                  <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <span className="text-base font-bold text-gray-900 mb-1">Processing Recording...</span>
                  <span className="text-xs text-gray-500 max-w-xs">{statusMessage}</span>
                </div>
              )}

              {!transcript && !isProcessing && (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 select-none py-12 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <FileText className="w-12 h-12 mb-3 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-650">Transcript Empty</p>
                  <p className="text-xs text-gray-400 mt-1">Start transcription from the player to generate word alignments.</p>
                </div>
              )}

              {transcript && (
                <div className="space-y-4">
                  {transcript.segments.map((segment) => {
                    const isSegmentActive = currentTime >= segment.start && currentTime <= segment.end;
                    
                    return (
                      <div 
                        key={segment.id} 
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSegmentActive 
                            ? 'bg-purple-50/30 border-purple-200 border-l-4 border-l-purple-600 shadow-sm' 
                            : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                        }`} 
                        onClick={() => jumpToTime(segment.start)}
                      >
                        <div className="flex justify-between items-center mb-2 select-none">
                          <span className={`font-bold text-xs ${
                            segment.source === 'mic' 
                              ? 'text-purple-600' 
                              : 'text-indigo-600'
                          }`}>
                            {segment.speaker} {segment.source === 'mic' ? '(Me)' : ''}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400">
                            {formatTime(segment.start)}
                          </span>
                        </div>
                        
                        <p className="text-sm leading-relaxed text-gray-750">
                          {segment.words.map((w, idx) => {
                            const isWordActive = currentTime >= w.start && currentTime <= w.end;
                            return (
                              <span 
                                key={idx} 
                                onClick={(e) => { e.stopPropagation(); jumpToTime(w.start); }}
                                className={`mr-1 px-0.5 rounded transition-all cursor-pointer ${
                                  isWordActive 
                                    ? 'bg-purple-100 text-purple-700 font-medium' 
                                    : 'text-gray-800 hover:text-purple-650 hover:bg-purple-50/50'
                                }`}
                              >
                                {w.word}
                              </span>
                            )
                          })}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="h-full flex flex-col bg-white rounded-xl border border-gray-100 p-6 shadow-sm min-h-[300px]">
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-500 select-none">
                  {hasUnsavedNotes ? "⚠️ Unsaved changes" : "✓ Saved offline"}
                </span>
                <button
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes || !hasUnsavedNotes}
                  className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer border-none ${
                    hasUnsavedNotes
                      ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingNotes ? "Saving..." : "Save Notes"}
                </button>
              </div>
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setHasUnsavedNotes(true);
                }}
                className="flex-1 w-full bg-gray-50/30 border border-gray-150 rounded-lg p-4 text-sm text-gray-800 focus:outline-none focus:border-purple-600 focus:bg-white leading-relaxed resize-none transition-all outline-none"
                placeholder="Start typing meeting notes..."
              />
            </div>
          )}

          {activeTab === 'action_items' && (
            <div className="h-full flex flex-col bg-white rounded-xl border border-gray-100 p-6 shadow-sm overflow-hidden min-h-[300px]">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex-shrink-0 select-none">
                Task Checklist
              </h3>
              
              {/* Tasks List */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400 select-none">
                    <ListTodo className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-sm font-semibold text-gray-600">No action items defined yet</p>
                    <p className="text-xs text-gray-400 mt-1">Add tasks below to start tracking objectives.</p>
                  </div>
                ) : (
                  tasks.map((task, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-3 hover:border-purple-200 group transition-all"
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 py-0.5">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggleTask(idx)}
                          className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className={`text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-700'} truncate select-none`}>
                          {task.text}
                        </span>
                      </label>
                      <button
                        onClick={() => handleDeleteTask(idx)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-all ml-2 cursor-pointer border-none"
                        title="Delete Item"
                      >
                        <Trash2 className="w-4 h-4" />
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
                  className="flex-1 bg-gray-50/50 border border-gray-150 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-600 focus:bg-white transition-all text-gray-800 outline-none"
                />
                <button
                  type="submit"
                  className="bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-purple-700 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer border-none"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
