
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, Map as MapIcon, ClipboardList, Send, Plus, Trash2, 
  ChevronRight, ArrowLeft, Edit3, Search, CloudSun, AlertTriangle,
  LayoutDashboard, Download, CheckCircle2, Settings, X, 
  Info, Bell, MapPin, Calendar, User, Save, FileText, Upload, Loader2,
  Maximize2, Eye, FolderOpen, LogOut, PlusCircle, Database, BookmarkPlus, Sparkles,
  Map as MapPinIcon, ChevronDown, ListPlus, Pencil, Check, Circle, CheckCircle, MoreHorizontal,
  Wifi, WifiOff, CloudUpload, RefreshCw, Move, PlusSquare, Image as ImageIcon,
  Moon, Sun, MapPinned
} from 'lucide-react';
import { 
  Priority, Coordinates, Observation, FloorPlan, ProjectInfo, ProjectMeta, WeatherData 
} from './types';
import { PhotoAnnotation } from './components/PhotoAnnotation';

// Setup PDF.js worker
const pdfjsLib = (window as any).pdfjsLib;
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_COMMENTS = [
  "Water intrusion observed at ceiling.",
  "Safety hazard: Unprotected floor opening.",
  "Drywall finish requires touch-up/sanding.",
  "Electrical junction box missing cover.",
  "Plumbing leak detected at supply line.",
  "ADA compliance issue: Incorrect ramp slope.",
  "Structural crack observed in foundation.",
  "Incorrect paint sheen applied to trim."
];

const App: React.FC = () => {
  // --- Global Shared Database (Across all projects) ---
  const [sharedComments, setSharedComments] = useState<string[]>(() => {
    const saved = localStorage.getItem('site_shared_comments');
    return saved ? JSON.parse(saved) : DEFAULT_COMMENTS;
  });

  // --- Project Database State ---
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => {
    const saved = localStorage.getItem('site_project_list');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Current Project State ---
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem('site_active_project_id');
  });

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);

  // --- Connectivity & Sync State ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(() => {
    return localStorage.getItem('site_has_unsynced_changes') === 'true';
  });

  // --- UI State ---
  const [view, setView] = useState<'projectBrowser' | 'dashboard' | 'plans' | 'observations' | 'editor' | 'settings' | 'manageTemplates'>('projectBrowser');
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isSelectingLocation, setIsSelectingLocation] = useState<string | null>(null); 
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isRepositioningId, setIsRepositioningId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState<{index: number, data: string} | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCommentDropdown, setShowCommentDropdown] = useState(false);
  const [newTemplateInput, setNewTemplateInput] = useState('');
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null);
  
  // New specific UI state for editor
  const [editorDarkMode, setEditorDarkMode] = useState(() => localStorage.getItem('site_editor_dark_mode') === 'true');

  // --- Bulk Selection State ---
  const [isBulkSelectMode, setIsBulkSelectMode] = useState(false);
  const [selectedObsIds, setSelectedObsIds] = useState<Set<string>>(new Set());

  // Filtered Observations
  const filteredObservations = useMemo(() => {
    return observations.filter(obs => {
      const query = searchQuery.toLowerCase();
      return (
        obs.note.toLowerCase().includes(query) ||
        obs.trade.toLowerCase().includes(query) ||
        obs.responsibleParty.toLowerCase().includes(query) ||
        obs.priority.toLowerCase().includes(query)
      );
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [observations, searchQuery]);

  // --- Offline Mode Detection ---
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      notify("Back Online. Ready to sync.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      notify("Offline Mode: Changes saved locally.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Persistence Logic ---
  useEffect(() => {
    localStorage.setItem('site_shared_comments', JSON.stringify(sharedComments));
  }, [sharedComments]);

  useEffect(() => {
    localStorage.setItem('site_editor_dark_mode', editorDarkMode.toString());
  }, [editorDarkMode]);

  useEffect(() => {
    if (activeProjectId) {
      const savedInfo = localStorage.getItem(`site_project_${activeProjectId}_info`);
      const savedPlans = localStorage.getItem(`site_project_${activeProjectId}_plans`);
      const savedObs = localStorage.getItem(`site_project_${activeProjectId}_obs`);

      if (savedInfo) {
        setProject(JSON.parse(savedInfo));
        setPlans(savedPlans ? JSON.parse(savedPlans) : []);
        setObservations(savedObs ? JSON.parse(savedObs) : []);
        setView('dashboard');
      } else {
        setActiveProjectId(null);
        localStorage.removeItem('site_active_project_id');
        setView('projectBrowser');
      }
    } else {
      setView('projectBrowser');
      setProject(null);
      setPlans([]);
      setObservations([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (activeProjectId && project) {
      localStorage.setItem(`site_project_${activeProjectId}_info`, JSON.stringify(project));
      localStorage.setItem(`site_project_${activeProjectId}_plans`, JSON.stringify(plans));
      localStorage.setItem(`site_project_${activeProjectId}_obs`, JSON.stringify(observations));
      localStorage.setItem('site_active_project_id', activeProjectId);

      const updatedList = projectList.map(p => 
        p.id === activeProjectId 
          ? { ...p, name: project.name, location: project.location, findingCount: observations.length, lastModified: Date.now() }
          : p
      );
      setProjectList(updatedList);
      localStorage.setItem('site_project_list', JSON.stringify(updatedList));
      
      // Mark as having unsynced changes
      setHasUnsyncedChanges(true);
      localStorage.setItem('site_has_unsynced_changes', 'true');
    }
  }, [project, plans, observations]);

  // Weather Logic with Offline Handling
  useEffect(() => {
    if (project?.location) {
      const fetchWeather = async () => {
        if (!navigator.onLine) {
          setWeather({ temp: 72, condition: 'Clear (Offline)', humidity: 40, wind: 5 });
          return;
        }
        try {
          const city = project.location.split(',')[0].trim();
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          const data = await res.json();
          const current = data.current_condition[0];
          setWeather({
            temp: parseInt(current.temp_F),
            condition: current.weatherDesc[0].value,
            humidity: parseInt(current.humidity),
            wind: parseInt(current.windspeedMiles)
          });
        } catch (err) {
          setWeather({ temp: 72, condition: 'Clear', humidity: 40, wind: 5 });
        }
      };
      fetchWeather();
    }
  }, [project?.location, isOnline]);

  // --- Logic Helpers ---
  const notify = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const simulateSync = async () => {
    if (!isOnline) {
      notify("Cannot sync while offline.");
      return;
    }
    setIsSyncing(true);
    // Simulate API delay
    await new Promise(r => setTimeout(r, 2000));
    setIsSyncing(false);
    setHasUnsyncedChanges(false);
    localStorage.setItem('site_has_unsynced_changes', 'false');
    notify("Cloud Backup Complete");
  };

  const addToLibrary = (text: string) => {
    if (!text || sharedComments.includes(text)) return;
    setSharedComments([text, ...sharedComments]);
    notify("Added to Library");
  };

  const removeFromLibrary = (text: string) => {
    setSharedComments(sharedComments.filter(c => c !== text));
    notify("Removed from Library");
  };

  const useComment = (text: string) => {
    if (!editingObs) return;
    const currentNote = editingObs.note;
    const newNote = currentNote ? `${currentNote.trim()} ${text}` : text;
    setEditingObs({ ...editingObs, note: newNote });
    setShowCommentDropdown(false);
  };

  const handleRenamePlan = (id: string, newName: string) => {
    if (!newName.trim()) return;
    setPlans(plans.map(p => p.id === id ? { ...p, name: newName } : p));
    setRenamingPlanId(null);
    notify("Plan Renamed");
  };

  const toggleObsSelection = (id: string) => {
    const newSelected = new Set(selectedObsIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedObsIds(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedObsIds.size === 0) return;
    if (confirm(`Delete ${selectedObsIds.size} findings permanently?`)) {
      setObservations(observations.filter(o => !selectedObsIds.has(o.id)));
      setSelectedObsIds(new Set());
      setIsBulkSelectMode(false);
      notify(`${selectedObsIds.size} findings deleted`);
    }
  };

  const handleBulkUpdatePriority = (priority: Priority) => {
    if (selectedObsIds.size === 0) return;
    setObservations(observations.map(o => selectedObsIds.has(o.id) ? { ...o, priority } : o));
    setSelectedObsIds(new Set());
    setIsBulkSelectMode(false);
    notify(`Priority updated for ${selectedObsIds.size} findings`);
  };

  const handleBulkUpdateParty = () => {
    if (selectedObsIds.size === 0) return;
    const party = prompt("Enter new Responsible Party for selected items:");
    if (party !== null) {
      setObservations(observations.map(o => selectedObsIds.has(o.id) ? { ...o, responsibleParty: party } : o));
      setSelectedObsIds(new Set());
      setIsBulkSelectMode(false);
      notify(`Party updated for ${selectedObsIds.size} findings`);
    }
  };

  const renderPlanWithPins = (plan: FloorPlan, planObs: Observation[]): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);

        planObs.forEach((obs) => {
          if (!obs.coords) return;
          const px = (obs.coords.x / 100) * canvas.width;
          const py = (obs.coords.y / 100) * canvas.height;
          const pinBaseSize = Math.max(canvas.width, canvas.height) * 0.015;
          const color = obs.priority === 'Critical' ? '#dc2626' : obs.priority === 'High' ? '#f97316' : '#2563eb';
          
          ctx!.beginPath();
          ctx!.arc(px, py, pinBaseSize * 1.5, 0, Math.PI * 2);
          ctx!.fillStyle = `${color}33`;
          ctx!.fill();

          ctx!.beginPath();
          ctx!.arc(px, py, pinBaseSize, 0, Math.PI * 2);
          ctx!.fillStyle = color;
          ctx!.fill();
          ctx!.strokeStyle = 'white';
          ctx!.lineWidth = pinBaseSize * 0.2;
          ctx!.stroke();
          
          ctx!.fillStyle = 'white';
          ctx!.font = `bold ${pinBaseSize}px Inter, sans-serif`;
          ctx!.textAlign = 'center';
          ctx!.textBaseline = 'middle';
          const index = observations.indexOf(obs) + 1;
          ctx!.fillText(index.toString(), px, py);
        });
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = plan.imageData;
    });
  };

  const generateReport = async () => {
    if (!project || observations.length === 0) {
      notify("No observations to export");
      return;
    }
    setIsExporting(true);
    try {
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setFontSize(22);
      doc.setTextColor(33, 33, 33);
      doc.text("SITE INSPECTION REPORT", 105, 40, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 48, { align: "center" });

      doc.setDrawColor(200, 200, 200);
      doc.line(20, 55, 190, 55);
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("PROJECT DETAILS", 20, 65);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Project Name: ${project.name}`, 20, 72);
      doc.text(`Location: ${project.location}`, 20, 78);
      doc.text(`Lead Inspector: ${project.inspector}`, 20, 84);
      doc.text(`Total Findings: ${observations.length}`, 20, 90);

      if (weather) {
        doc.setDrawColor(240, 240, 240);
        doc.setFillColor(245, 247, 250);
        doc.rect(20, 95, 170, 15, 'F');
        doc.setFont("helvetica", "bold");
        doc.text("WEATHER AT TIME OF INSPECTION:", 25, 102);
        doc.setFont("helvetica", "normal");
        doc.text(`${weather.temp}°F, ${weather.condition} | Humidity: ${weather.humidity}% | Wind: ${weather.wind} mph`, 25, 107);
      }

      for (const plan of plans) {
        const planObs = observations.filter(o => o.planId === plan.id);
        if (planObs.length === 0) continue;

        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(`MAP REFERENCE: ${plan.name.toUpperCase()}`, 105, 20, { align: "center" });

        const mappedPlanImg = await renderPlanWithPins(plan, planObs);
        const imgProps = doc.getImageProperties(mappedPlanImg);
        const pdfMaxWidth = 170;
        const pdfWidth = pdfMaxWidth;
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        doc.addImage(mappedPlanImg, 'JPEG', 20, 30, pdfWidth, Math.min(pdfHeight, pageHeight - 50));
      }

      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("DETAILED FINDINGS", 105, 20, { align: "center" });

      let currentY = 30;

      for (const [obs, index] of observations.map((o, i) => [o, i] as [Observation, number])) {
        const rowHeight = 40; 
        const imgCount = obs.images.length;
        const imagesPerRow = 3;
        const imgSize = 50;
        const spacing = 5;
        const imgRows = Math.ceil(imgCount / imagesPerRow);
        const totalImgHeight = imgRows > 0 ? (imgRows * (imgSize + spacing)) : 0;
        const totalNeeded = rowHeight + totalImgHeight + 10;

        if (currentY + totalNeeded > pageHeight - 20) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.rect(20, currentY, 170, rowHeight, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(20, currentY, 170, rowHeight, 'S');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(37, 99, 235);
        doc.text(`#${index + 1} - ${obs.priority.toUpperCase()} PRIORITY`, 25, currentY + 7);
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(`Trade: ${obs.trade || 'General'}`, 25, currentY + 14);
        doc.text(`Party: ${obs.responsibleParty || 'GC'}`, 100, currentY + 14);
        doc.text(`Date: ${new Date(obs.timestamp).toLocaleDateString()}`, 25, currentY + 20);
        
        doc.setFont("helvetica", "normal");
        const splitNote = doc.splitTextToSize(obs.note || "No description provided.", 160);
        doc.text(splitNote, 25, currentY + 28);
        
        currentY += rowHeight + 5;

        if (imgCount > 0) {
          for (let i = 0; i < imgCount; i++) {
            const rowIdx = Math.floor(i / imagesPerRow);
            const colIdx = i % imagesPerRow;
            const x = 20 + colIdx * (imgSize + spacing);
            const y = currentY + rowIdx * (imgSize + spacing);
            try {
              doc.addImage(obs.images[i], 'JPEG', x, y, imgSize, imgSize);
            } catch (e) { console.error(e); }
          }
          currentY += totalImgHeight + 10;
        } else {
          currentY += 5;
        }
      }

      doc.save(`${project.name.replace(/\s+/g, '_')}_Report.pdf`);
      notify("Report Generated Successfully");
    } catch (err) {
      console.error(err);
      notify("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddPlan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context!, viewport }).promise;
        const imageData = canvas.toDataURL('image/jpeg', 0.85);
        setPlans([...plans, { id: generateId(), name: fileName, imageData }]);
        notify("PDF Plan Processed");
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPlans([...plans, { id: generateId(), name: fileName, imageData: reader.result as string }]);
          notify("Plan Uploaded");
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      notify("Failed to process plan");
    } finally {
      setIsProcessingFile(false);
      e.target.value = '';
    }
  };

  const startNewObservation = (planId?: string, coords?: Coordinates) => {
    const newObs: Observation = {
      id: generateId(),
      note: '',
      priority: 'Medium',
      planId: planId || null,
      coords: coords || null,
      images: [],
      tags: [],
      trade: '',
      responsibleParty: 'GC', 
      recommendedAction: '',
      timestamp: Date.now()
    };
    setEditingObs(newObs);
    setView('editor');
    setActivePlanId(null);
  };

  const syncToCloud = () => {
    if (!editingObs) return;
    const exists = observations.find(o => o.id === editingObs.id);
    if (exists) setObservations(observations.map(o => o.id === editingObs.id ? editingObs : o));
    else setObservations([editingObs, ...observations]);
    setEditingObs(null);
    notify("Observation Saved");
    setView('observations');
  };

  const closeActiveProject = () => {
    setActiveProjectId(null);
    localStorage.removeItem('site_active_project_id');
    setView('projectBrowser');
    notify("Work Saved & Closed");
  };

  const createNewProject = () => {
    const id = generateId();
    const newProject: ProjectInfo = {
      id,
      name: 'New Site Inspection',
      location: 'City, State',
      inspector: 'Inspector Name',
      emailTo: '',
      lastModified: Date.now()
    };
    const newMeta: ProjectMeta = {
      id,
      name: newProject.name,
      location: newProject.location,
      findingCount: 0,
      lastModified: Date.now()
    };
    const newList = [newMeta, ...projectList];
    setProjectList(newList);
    localStorage.setItem('site_project_list', JSON.stringify(newList));
    setActiveProjectId(id);
    setProject(newProject);
    setPlans([]);
    setObservations([]);
    setView('dashboard');
  };

  const NavItem = ({ icon: Icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 relative ${active ? 'text-blue-600 scale-105' : 'text-gray-400 hover:text-gray-600'}`}>
      <Icon size={22} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      {active && <div className="absolute -bottom-2 w-1 h-1 bg-blue-600 rounded-full" />}
    </button>
  );

  const Header = ({ title, showBack, rightAction, onBack }: any) => (
    <header className="px-5 pt-8 pb-4 flex items-center justify-between sticky top-0 bg-gray-50/80 backdrop-blur-md z-30">
      <div className="flex items-center gap-4 min-w-0">
        {showBack && (
          <button onClick={onBack || (() => setView('dashboard'))} className="p-2 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-2xl font-black tracking-tight text-gray-900 truncate">{title}</h1>
      </div>
      {rightAction}
    </header>
  );

  const selectedObservation = selectedPinId ? observations.find(o => o.id === selectedPinId) : null;

  if (view === 'projectBrowser') {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col p-6 animate-in fade-in duration-500 pb-24">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Database</p>
            <h1 className="text-4xl font-black tracking-tighter leading-none">Projects</h1>
          </div>
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
             <Database size={24} className="text-gray-400" />
          </div>
        </header>
        <div className="space-y-4">
          <button onClick={createNewProject} className="w-full p-6 bg-blue-600 text-white rounded-[32px] shadow-xl shadow-blue-200 flex items-center justify-center gap-3 active:scale-[0.98] transition group">
            <PlusCircle size={24} className="group-hover:rotate-90 transition-transform" />
            <span className="text-sm font-black uppercase tracking-wider">Start New Inspection</span>
          </button>
          {projectList.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-300 opacity-50">
               <FolderOpen size={48} className="mb-4" />
               <p className="font-bold text-center">No projects yet. Start one above.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Saved Inspections</p>
              {projectList.map(p => (
                <div key={p.id} onClick={() => setActiveProjectId(p.id)} className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition cursor-pointer">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="font-black text-lg text-gray-900 truncate leading-tight">{p.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-gray-400">
                      <div className="flex items-center gap-1 text-[10px] font-bold"><MapPin size={10} className="text-blue-500" /> {p.location}</div>
                      <div className="flex items-center gap-1 text-[10px] font-bold"><ClipboardList size={10} className="text-blue-500" /> {p.findingCount} Findings</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); if(confirm("Are you sure you want to delete this project?")) { const newList = projectList.filter(x => x.id !== p.id); setProjectList(newList); localStorage.setItem('site_project_list', JSON.stringify(newList)); localStorage.removeItem(`site_project_${p.id}_info`); notify("Project Deleted"); } }} className="p-3 text-gray-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 size={20} /></button>
                    <div className="p-3 bg-gray-50 text-gray-400 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition"><ChevronRight size={20} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col relative overflow-x-hidden pb-24 selection:bg-blue-100">
      {!isOnline && (
        <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-2 px-5 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-500 sticky top-0 z-[100]">
          <WifiOff size={14} /> Offline Mode: Work is being saved locally
        </div>
      )}

      <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 pointer-events-none ${showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-10 scale-95'}`}>
        <div className="bg-gray-900 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-3 border border-white/10">
          <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 size={12} className="text-white" /></div>
          {showToast}
        </div>
      </div>

      <div className="flex-1">
        {view === 'dashboard' && (
          <div className="p-5 space-y-6 animate-in fade-in duration-500">
            <header className="flex justify-between items-start">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Project Active</p>
                <h1 className="text-3xl font-black tracking-tighter leading-none truncate">{project.name}</h1>
                <div className="flex items-center gap-3 mt-3 text-gray-500">
                  <div className="flex items-center gap-1 text-xs font-bold truncate"><MapPin size={12} className="text-blue-500 shrink-0" /> {project.location}</div>
                  <div className="h-3 w-px bg-gray-200" />
                  <div className={`flex items-center gap-1 text-[10px] font-black uppercase ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
                    {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />} {isOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
              <button onClick={() => setView('settings')} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100 active:rotate-45 transition-transform shrink-0"><Settings size={22} className="text-gray-400" /></button>
            </header>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => startNewObservation()}
                className="w-full p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-[32px] shadow-xl shadow-blue-200 flex items-center justify-between group active:scale-[0.98] transition"
              >
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-white/10 rounded-2xl"><PlusSquare size={32} /></div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest">Inspection Action</p>
                    <p className="text-xl font-black">Add New Finding</p>
                  </div>
                </div>
                <ChevronRight size={24} className="opacity-50 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {(hasUnsyncedChanges || isSyncing) && (
              <div className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${isSyncing ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                    {isSyncing ? <RefreshCw className="animate-spin" size={20} /> : <CloudUpload size={20} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cloud Sync</p>
                    <p className="text-xs font-bold text-gray-900">{isSyncing ? 'Syncing data...' : 'Unsynced local changes'}</p>
                  </div>
                </div>
                {isOnline && !isSyncing && (
                  <button 
                    onClick={simulateSync}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase active:scale-95 transition"
                  >Sync Now</button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden active:scale-95 transition" onClick={() => setView('observations')}>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observations</span>
                  <p className="text-4xl font-black mt-1 text-gray-900">{observations.length}</p>
                </div>
                <ClipboardList className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12" size={80} />
              </div>
              <div className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden active:scale-95 transition" onClick={() => setView('plans')}>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Floor Plans</span>
                  <p className="text-4xl font-black mt-1 text-gray-900">{plans.length}</p>
                </div>
                <MapIcon className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12" size={80} />
              </div>
              <div className="bg-red-50 p-5 rounded-[32px] border border-red-100 shadow-sm relative overflow-hidden active:scale-95 transition col-span-2" onClick={() => setView('observations')}>
                <div className="flex justify-between items-center relative z-10">
                  <div>
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Critical Issues</span>
                    <p className="text-4xl font-black mt-1 text-red-600">{observations.filter(o => o.priority === 'Critical').length}</p>
                  </div>
                  <AlertTriangle className="text-red-300" size={40} />
                </div>
              </div>
            </div>

            {weather && (
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-[32px] text-white shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Current Weather</p>
                    <p className="text-3xl font-black mt-1">{weather.temp}°F</p>
                  </div>
                  <CloudSun size={28} className="p-1 bg-white/10 rounded-lg" />
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter opacity-80">
                  <span>{weather.condition}</span>
                  <span>Humidity: {weather.humidity}%</span>
                  <span>Wind: {weather.wind} mph</span>
                </div>
              </div>
            )}
            
            <button onClick={generateReport} disabled={isExporting} className="w-full py-5 bg-gray-900 text-white rounded-[28px] font-black text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
              {isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} className="text-blue-400" />} GENERATE SITE REPORT
            </button>
            <button onClick={closeActiveProject} className="w-full py-5 bg-white border border-gray-100 text-gray-400 rounded-[28px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition"><LogOut size={16} /> Save & Exit to Browser</button>
          </div>
        )}

        {view === 'plans' && (
          <div className="animate-in slide-in-from-right duration-300">
            <Header title="Floor Plans" showBack />
            <div className="px-5 pb-2">
              <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Manage Floor Plans</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col items-center justify-center gap-2 p-6 bg-blue-50 text-blue-600 rounded-3xl border-2 border-dashed border-blue-200 active:scale-95 transition cursor-pointer relative">
                    {isProcessingFile && <div className="absolute inset-0 bg-blue-50/80 rounded-3xl flex items-center justify-center z-10"><Loader2 className="animate-spin" size={24} /></div>}
                    <Upload size={24} /><span className="text-[10px] font-bold uppercase">PDF / Image</span><input type="file" accept="image/*,application/pdf" onChange={handleAddPlan} className="hidden" />
                  </label>
                  <label className="flex flex-col items-center justify-center gap-2 p-6 bg-gray-900 text-white rounded-3xl active:scale-95 transition cursor-pointer">
                    <Camera size={24} /><span className="text-[10px] font-bold uppercase">Scan Plan</span><input type="file" accept="image/*" capture="environment" onChange={handleAddPlan} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 pb-40">
              {plans.map(plan => (
                <div key={plan.id} onClick={() => setActivePlanId(plan.id)} className="bg-white p-3 rounded-[32px] border border-gray-100 shadow-sm group active:scale-95 transition relative">
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingPlanId(plan.id); }} className="p-2 bg-white/90 text-gray-600 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition active:scale-90"><Pencil size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); if(confirm("Delete this plan?")) { setPlans(plans.filter(p => p.id !== plan.id)); notify("Plan Deleted"); } }} className="p-2 bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition active:scale-90"><Trash2 size={12} /></button>
                  </div>
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gray-50 mb-3 border border-gray-100 relative">
                    <img src={plan.imageData} className="w-full h-full object-contain bg-gray-100" />
                  </div>
                  {renamingPlanId === plan.id ? (
                    <div className="flex items-center gap-1 px-1">
                      <input autoFocus className="flex-1 text-xs font-black p-1 border-b-2 border-blue-500 outline-none bg-white text-gray-900" defaultValue={plan.name} onBlur={(e) => handleRenamePlan(plan.id, e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') handleRenamePlan(plan.id, (e.target as HTMLInputElement).value); }} onClick={(e) => e.stopPropagation()} />
                      <button className="text-blue-500"><Check size={14} /></button>
                    </div>
                  ) : (
                    <div className="px-1 flex justify-between items-center">
                      <p className="text-xs font-black truncate max-w-[80%] uppercase tracking-tight">{plan.name}</p>
                      <span className="text-[10px] font-black text-blue-500">{observations.filter(o => o.planId === plan.id).length}</span>
                    </div>
                  )}
                </div>
              ))}
              {plans.length === 0 && (
                <div className="col-span-2 py-20 text-center opacity-30 italic flex flex-col items-center gap-4">
                  <ImageIcon size={48} />
                  <p className="text-sm font-bold">No floor plans yet. Upload one above.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'observations' && (
          <div className="animate-in slide-in-from-right duration-300">
            <Header title={isBulkSelectMode ? `Selected (${selectedObsIds.size})` : "All Findings"} showBack={!isBulkSelectMode} onBack={() => setView('dashboard')} rightAction={
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isBulkSelectMode) setSelectedObsIds(new Set()); setIsBulkSelectMode(!isBulkSelectMode); }} className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase transition-all shadow-sm border ${isBulkSelectMode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-blue-600 border-gray-100'}`}>
                  {isBulkSelectMode ? 'Cancel' : 'Select'}
                </button>
                {!isBulkSelectMode && (
                  <>
                    <button onClick={() => startNewObservation()} className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm border border-blue-600 active:scale-95 transition">
                      <Plus size={20} />
                    </button>
                    <button onClick={generateReport} className="p-3 bg-white text-blue-600 rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition">
                      {isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                    </button>
                  </>
                )}
              </div>
            } />
            
            <div className="px-5 pb-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="text" placeholder="Search findings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-sm font-medium outline-none focus:ring-2 ring-blue-500/10 text-gray-900" />
              </div>
            </div>

            <div className="px-5 space-y-4 pb-40">
              {filteredObservations.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-300 opacity-50 text-center">
                   <ClipboardList size={48} className="mb-4" />
                   <p className="font-bold">No findings found matching search.</p>
                </div>
              ) : (
                filteredObservations.map((obs) => {
                  const isSelected = selectedObsIds.has(obs.id);
                  return (
                    <div key={obs.id} onClick={() => { if (isBulkSelectMode) toggleObsSelection(obs.id); else { setEditingObs(obs); setView('editor'); } }} className={`bg-white p-5 rounded-[32px] border shadow-sm space-y-4 active:scale-[0.98] transition group relative overflow-hidden ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/20' : 'border-gray-100'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-wrap gap-2 items-center">
                          {isBulkSelectMode && (
                            <div className={`mr-2 transition-all ${isSelected ? 'text-blue-600 scale-110' : 'text-gray-300'}`}>
                              {isSelected ? <CheckCircle size={22} fill="currentColor" stroke="white" strokeWidth={2} /> : <Circle size={22} />}
                            </div>
                          )}
                          <div className="w-6 h-6 bg-gray-900 text-white rounded-lg flex items-center justify-center text-[10px] font-black">{observations.indexOf(obs) + 1}</div>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${obs.priority === 'Critical' ? 'bg-red-600' : 'bg-blue-600'}`}>{obs.priority}</span>
                        </div>
                        {!isBulkSelectMode && (
                          <button onClick={(e) => { e.stopPropagation(); if(confirm("Permanently delete this finding?")) setObservations(o => o.filter(x => x.id !== obs.id)); }} className="text-gray-200 hover:text-red-500 transition"><Trash2 size={18} /></button>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 leading-relaxed line-clamp-2">{obs.note || "No description provided."}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-gray-50 text-gray-400">
                        <span className="text-[10px] font-black uppercase tracking-tight">{obs.trade || 'General Trade'}</span>
                        <span className="text-[10px] font-black uppercase tracking-tight">{new Date(obs.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isBulkSelectMode && selectedObsIds.size > 0 && (
              <div className="fixed bottom-6 left-6 right-6 bg-gray-900 rounded-[32px] p-6 shadow-2xl z-50 animate-in slide-in-from-bottom duration-300">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-white text-xs font-black uppercase tracking-widest">{selectedObsIds.size} Findings Selected</p>
                    <button onClick={handleBulkDelete} className="flex items-center gap-2 text-red-400 font-black text-[10px] uppercase"><Trash2 size={14} /> Delete</button>
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="space-y-3">
                    <p className="text-white/50 text-[9px] font-black uppercase tracking-widest px-1">Bulk Update Priority</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(['Low', 'Medium', 'High', 'Critical'] as Priority[]).map(p => (
                        <button key={p} onClick={() => handleBulkUpdatePriority(p)} className="py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[8px] font-black uppercase tracking-tighter border border-white/5 transition-colors">{p}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleBulkUpdateParty} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition"><User size={16} /> Set Responsible Party</button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'editor' && editingObs && (
          <div className={`fixed inset-0 z-[120] flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden ${editorDarkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
            {isAnnotating && <PhotoAnnotation imageSrc={isAnnotating.data} onSave={(data) => { const newImages = [...editingObs.images]; newImages[isAnnotating.index] = data; setEditingObs({...editingObs, images: newImages}); setIsAnnotating(null); }} onCancel={() => setIsAnnotating(null)} />}
            <header className={`px-5 pt-8 pb-4 flex items-center justify-between border-b shadow-sm ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
              <div className="flex items-center gap-4">
                <button onClick={() => setView('observations')} className={`p-2 ${editorDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-black tracking-tight">{editingObs.note ? 'Edit Finding' : 'New Finding'}</h2>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setEditorDarkMode(!editorDarkMode)} 
                  className={`p-2.5 rounded-xl transition-all active:scale-95 ${editorDarkMode ? 'bg-gray-800 text-yellow-400 border border-gray-700' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                >
                  {editorDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <button onClick={syncToCloud} className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-black text-xs uppercase shadow-lg shadow-blue-200 active:scale-95 transition">Save</button>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-5 space-y-6 pb-32">
              <section className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Pin on Floor Plan</label>
                {editingObs.planId ? (
                   <div className={`flex flex-col gap-3 p-4 border rounded-3xl shadow-sm ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`p-3 rounded-2xl shrink-0 ${editorDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><MapPinned size={20} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black uppercase truncate">{plans.find(p => p.id === editingObs.planId)?.name}</p>
                          <p className={`text-[10px] font-bold ${editorDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Location pinned on map</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button 
                          onClick={() => setIsSelectingLocation(editingObs.planId)} 
                          className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-500/20 active:scale-95 transition"
                        >
                          <Move size={14} /> Move Pin
                        </button>
                        <button 
                          onClick={() => setEditingObs({...editingObs, planId: null, coords: null})} 
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase active:scale-95 transition ${editorDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                        >
                          <X size={14} /> Change Plan
                        </button>
                      </div>
                   </div>
                ) : (
                  <div className="space-y-3">
                    {plans.length === 0 ? (
                      <p className={`text-[10px] font-bold italic p-5 rounded-3xl border-2 border-dashed ${editorDarkMode ? 'text-gray-500 bg-gray-900 border-gray-800' : 'text-gray-400 bg-gray-100 border-gray-200'}`}>No floor plans available. Please upload floor plans in the "Plans" tab from the home dashboard.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        <p className={`text-[10px] font-bold mb-1 ${editorDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Select a plan to drop a pin:</p>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                          {plans.map(p => (
                            <button 
                              key={p.id} 
                              onClick={() => setIsSelectingLocation(p.id)} 
                              className={`flex shrink-0 items-center gap-3 px-5 py-4 border rounded-full text-[10px] font-black uppercase shadow-sm active:scale-95 transition ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800' : 'bg-gray-100 border-transparent text-gray-900 hover:bg-gray-200'}`}
                            >
                              <Plus size={16} className="text-blue-500" /> {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-3 relative">
                <div className="flex justify-between items-end">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Issue Description</label>
                  <div className="flex gap-2">
                    {editingObs.note && !sharedComments.includes(editingObs.note) && (
                      <button onClick={() => addToLibrary(editingObs.note)} className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase active:scale-95 transition ${editorDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><BookmarkPlus size={12} /> Add to Library</button>
                    )}
                    <button onClick={() => setShowCommentDropdown(!showCommentDropdown)} className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase active:scale-95 transition shadow-lg"><Sparkles size={12} className="text-blue-400" /> Templates <ChevronDown size={10} className={`transition-transform duration-300 ${showCommentDropdown ? 'rotate-180' : ''}`} /></button>
                  </div>
                </div>

                {showCommentDropdown && (
                  <div className={`absolute top-10 right-0 left-0 z-[130] border rounded-[28px] shadow-2xl max-h-64 overflow-y-auto no-scrollbar animate-in zoom-in duration-200 ${editorDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className={`p-4 border-b sticky top-0 backdrop-blur-md flex justify-between items-center ${editorDarkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Global Comment Library</span>
                      <button onClick={() => setShowCommentDropdown(false)}><X size={16} className="text-gray-300" /></button>
                    </div>
                    {sharedComments.length === 0 ? (<div className={`p-8 text-center text-xs italic ${editorDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Library is empty. Add templates in Settings!</div>) : (
                      <div className={`divide-y ${editorDarkMode ? 'divide-gray-800' : 'divide-gray-50'}`}>
                        {sharedComments.map((comment, i) => (
                          <button key={i} onClick={() => useComment(comment)} className={`w-full text-left p-5 text-sm font-semibold transition ${editorDarkMode ? 'text-gray-300 hover:bg-gray-800 active:bg-gray-700' : 'text-gray-700 hover:bg-blue-50 active:bg-blue-100'}`}>{comment}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <textarea 
                  value={editingObs.note} 
                  onChange={e => setEditingObs({...editingObs, note: e.target.value})} 
                  placeholder="Describe the problem here or choose a template..." 
                  className={`w-full h-40 p-5 rounded-3xl border-2 outline-none font-semibold text-sm shadow-inner resize-none transition-colors ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-white focus:border-blue-700' : 'bg-white border-gray-100 text-gray-900 focus:border-blue-500'}`} 
                />
              </section>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Trade</label>
                  <input 
                    value={editingObs.trade} 
                    onChange={e => setEditingObs({...editingObs, trade: e.target.value})} 
                    className={`w-full p-4 border rounded-2xl text-xs font-bold outline-none shadow-sm transition-colors ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-white focus:ring-2 ring-blue-900/20' : 'bg-white border-gray-100 text-gray-900 focus:ring-2 ring-blue-500/10'}`} 
                    placeholder="e.g. Drywall, Electrical" 
                  />
                </div>
                <div className="space-y-2">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Responsible Party</label>
                  <input 
                    value={editingObs.responsibleParty} 
                    onChange={e => setEditingObs({...editingObs, responsibleParty: e.target.value})} 
                    className={`w-full p-4 border rounded-2xl text-xs font-bold outline-none shadow-sm transition-colors ${editorDarkMode ? 'bg-gray-900 border-gray-800 text-white focus:ring-2 ring-blue-900/20' : 'bg-white border-gray-100 text-gray-900 focus:ring-2 ring-blue-500/10'}`} 
                    placeholder="e.g. ABC Painting" 
                  />
                </div>
              </div>

              <section className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Urgency Level</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as Priority[]).map(p => (
                    <button 
                      key={p} 
                      onClick={() => setEditingObs({...editingObs, priority: p})} 
                      className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-tighter border-2 transition-all ${
                        editingObs.priority === p 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg' 
                          : editorDarkMode 
                            ? 'bg-gray-900 border-gray-800 text-gray-500 active:scale-95' 
                            : 'bg-white border-gray-100 text-gray-400 active:scale-95'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${editorDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Evidence Photos</label>
                  <span className="text-[10px] font-bold text-blue-500">{editingObs.images.length}/5</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {editingObs.images.map((img, i) => (
                    <div key={i} className={`group relative aspect-square rounded-[24px] overflow-hidden border shadow-sm ${editorDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-100'}`}>
                      <img src={img} className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setIsAnnotating({index: i, data: img})} className="p-2.5 bg-white text-blue-600 rounded-xl active:scale-95 transition"><Edit3 size={16} /></button>
                        <button onClick={() => setEditingObs({...editingObs, images: editingObs.images.filter((_, idx) => idx !== i)})} className="p-2.5 bg-white text-red-600 rounded-xl active:scale-95 transition"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {editingObs.images.length < 5 && (
                    <label className={`flex flex-col items-center justify-center gap-2 aspect-square border-2 border-dashed rounded-[24px] cursor-pointer shadow-sm transition-all active:scale-95 ${editorDarkMode ? 'bg-gray-900 border-gray-700 text-gray-600 hover:border-blue-800' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'}`}>
                      <Camera size={24} /><span className="text-[8px] font-black uppercase tracking-widest">Capture</span><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => { const files = Array.from(e.target.files || []); files.forEach(file => { const reader = new FileReader(); reader.onloadend = () => setEditingObs(prev => prev ? ({ ...prev, images: [...prev.images, reader.result as string] }) : null); reader.readAsDataURL(file); }); }} className="hidden" />
                    </label>
                  )}
                </div>
              </section>
            </main>
          </div>
        )}

        {view === 'manageTemplates' && (
          <div className="animate-in slide-in-from-bottom duration-300 min-h-screen bg-white z-[200] fixed inset-0 flex flex-col">
             <Header title="Manage Library" showBack onBack={() => setView('settings')} />
             <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-24">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Create New Template</label>
                   <div className="flex flex-col gap-2">
                     <textarea value={newTemplateInput} onChange={e => setNewTemplateInput(e.target.value)} placeholder="Enter a common comment that repeats often..." className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold outline-none focus:ring-2 ring-blue-500/20 resize-none h-24 shadow-inner text-gray-900" />
                     <button onClick={() => { if(newTemplateInput.trim()) { addToLibrary(newTemplateInput.trim()); setNewTemplateInput(''); } }} className="w-full py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition shadow-lg shadow-blue-200">Save to Global Library</button>
                   </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-gray-100">
                   <div className="flex justify-between items-center"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Current Library ({sharedComments.length})</label><p className="text-[10px] font-bold text-gray-400">Shared across all projects</p></div>
                   <div className="space-y-2">
                      {sharedComments.map((comment, i) => (
                        <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group active:bg-gray-50 transition">
                          <p className="text-sm font-semibold text-gray-700 flex-1 pr-4">{comment}</p>
                          <button onClick={() => removeFromLibrary(comment)} className="text-red-400 p-2 hover:bg-red-50 rounded-xl transition shrink-0 active:scale-90"><Trash2 size={20} /></button>
                        </div>
                      ))}
                      {sharedComments.length === 0 && <p className="text-center py-10 text-gray-300 italic text-sm">Library is currently empty.</p>}
                   </div>
                </div>
             </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="animate-in slide-in-from-right duration-300">
            <Header title="Project Settings" showBack />
            <div className="p-5 space-y-6">
               <div className="space-y-4">
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Inspection Name</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><LayoutDashboard className="text-blue-500 mr-4 shrink-0" size={20} /><input value={project.name} onChange={e => setProject({...project, name: e.target.value})} className="flex-1 text-sm font-bold outline-none truncate bg-white text-gray-900" /></div></div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Project Location</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><MapPinIcon className="text-red-500 mr-4 shrink-0" size={20} /><input value={project.location} onChange={e => setProject({...project, location: e.target.value})} className="flex-1 text-sm font-bold outline-none truncate bg-white text-gray-900" /></div></div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Lead Inspector</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><User className="text-purple-500 mr-4 shrink-0" size={20} /><input value={project.inspector} onChange={e => setProject({...project, inspector: e.target.value})} className="flex-1 text-sm font-bold outline-none truncate bg-white text-gray-900" /></div></div>
               </div>
               <div className="space-y-3 pt-6 border-t border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Resources</p>
                  <button onClick={() => setView('manageTemplates')} className="w-full py-5 bg-white border-2 border-dashed border-blue-100 text-gray-600 rounded-[28px] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition hover:bg-blue-50"><ListPlus size={18} className="text-blue-500" /> Manage Comment Library</button>
               </div>
               <div className="space-y-3 pt-6 border-t border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Project Management</p>
                  <button onClick={closeActiveProject} className="w-full py-5 bg-gray-100 text-gray-600 rounded-[28px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition"><LogOut size={16} /> Save & Exit Project</button>
               </div>
            </div>
          </div>
        )}
      </div>

      {(activePlanId || isSelectingLocation) && (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col animate-in zoom-in duration-300">
          <div className="p-6 flex justify-between items-center bg-black/80 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl"><MapIcon size={18} className="text-blue-400" /></div>
              <div className="min-w-0 pr-4">
                <h3 className="text-white font-black uppercase text-xs tracking-widest truncate">{plans.find(p => p.id === (activePlanId || isSelectingLocation))?.name}</h3>
                <p className="text-[9px] text-white/50 font-bold uppercase tracking-tighter">
                  {isRepositioningId ? 'Select new position for finding' : 'Tap exactly where you found the issue'}
                </p>
              </div>
            </div>
            <button onClick={() => {setActivePlanId(null); setIsSelectingLocation(null); setSelectedPinId(null); setIsRepositioningId(null);}} className="p-2 text-white/50 hover:text-white"><X size={28} /></button>
          </div>

          <div className="flex-1 relative overflow-auto bg-gray-900 flex items-center justify-center p-4">
            <div className="relative inline-block rounded-2xl overflow-hidden shadow-2xl border border-white/5">
              <img 
                src={plans.find(p => p.id === (activePlanId || isSelectingLocation))?.imageData} 
                className="max-w-full h-auto select-none object-contain block"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  
                  if (isRepositioningId) {
                    setObservations(observations.map(o => o.id === isRepositioningId ? { ...o, coords: { x, y } } : o));
                    setIsRepositioningId(null);
                    setSelectedPinId(isRepositioningId);
                    notify("Pin Repositioned");
                  } else if (isSelectingLocation && editingObs) {
                    setEditingObs({...editingObs, planId: isSelectingLocation, coords: {x, y}});
                    setIsSelectingLocation(null);
                  } else {
                    startNewObservation(activePlanId!, { x, y });
                  }
                }}
              />
              {observations.filter(o => o.planId === (activePlanId || isSelectingLocation)).map(o => {
                const isCurrentlyEditingThis = editingObs?.id === o.id;
                return (
                  <div 
                    key={o.id}
                    className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-2xl transition-all cursor-pointer ${
                      (selectedPinId === o.id || isCurrentlyEditingThis) ? 'ring-4 ring-blue-400 scale-125 z-20' : 'z-10'
                    } ${
                      isCurrentlyEditingThis ? 'animate-pulse' : ''
                    } ${
                      o.priority === 'Critical' ? 'bg-red-600' : o.priority === 'High' ? 'bg-orange-500' : 'bg-blue-600'
                    }`}
                    style={{ left: `${o.coords?.x}%`, top: `${o.coords?.y}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPinId(o.id === selectedPinId ? null : o.id);
                    }}
                  >
                    {observations.indexOf(o) + 1}
                  </div>
                );
              })}
              
              {isSelectingLocation && editingObs?.coords && editingObs.planId === isSelectingLocation && (
                <div 
                  className="absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-4 border-white bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shadow-2xl z-30 animate-pulse ring-4 ring-blue-400/50"
                  style={{ left: `${editingObs.coords.x}%`, top: `${editingObs.coords.y}%` }}
                >
                    <MapPinned size={20} />
                </div>
              )}
            </div>
          </div>

          {selectedObservation && (
            <div className="absolute bottom-28 left-6 right-6 p-6 bg-white rounded-[32px] shadow-2xl animate-in slide-in-from-bottom duration-300 z-[110] border border-gray-100">
              <div className="flex gap-4 items-center mb-5">
                {selectedObservation.images.length > 0 ? (
                  <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-gray-100 shadow-sm bg-gray-50">
                    <img src={selectedObservation.images[0]} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 border border-gray-50 ${
                    selectedObservation.priority === 'Critical' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                  }`}>
                    <AlertTriangle size={32} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-white ${
                      selectedObservation.priority === 'Critical' ? 'bg-red-600' : 'bg-blue-600'
                    }`}>{selectedObservation.priority}</span>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{selectedObservation.trade || 'General'}</span>
                  </div>
                  <p className="text-sm font-black text-gray-900 leading-tight mb-1 line-clamp-2">{selectedObservation.note || "No description provided."}</p>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 truncate uppercase tracking-tighter">
                    <User size={10} className="text-blue-500" /> {selectedObservation.responsibleParty || 'Not assigned'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => {setEditingObs(selectedObservation); setView('editor'); setActivePlanId(null); setSelectedPinId(null);}} className="py-4 bg-gray-900 text-white text-[10px] font-black uppercase rounded-2xl active:scale-95 transition flex items-center justify-center gap-2 shadow-lg"><Edit3 size={14} /> Edit</button>
                  <button onClick={() => {setIsRepositioningId(selectedObservation.id); setSelectedPinId(null);}} className="py-4 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-2xl active:scale-95 transition flex items-center justify-center gap-2"><Move size={14} /> Move</button>
                  <button onClick={() => {if(confirm("Permanently delete this finding?")) { setObservations(observations.filter(o => o.id !== selectedObservation.id)); setSelectedPinId(null); notify("Finding Deleted"); }}} className="py-4 bg-red-50 text-red-600 text-[10px] font-black uppercase rounded-2xl active:scale-95 transition flex items-center justify-center gap-2"><Trash2 size={14} /> Delete</button>
              </div>
              <button onClick={() => setSelectedPinId(null)} className="w-full mt-3 py-2 text-gray-300 text-[9px] font-black uppercase tracking-widest active:text-gray-400">Dismiss View</button>
            </div>
          )}
        </div>
      )}

      {!isBulkSelectMode && view !== 'editor' && !isSelectingLocation && view !== 'manageTemplates' && !activePlanId && (
        <nav className="fixed bottom-6 left-6 right-6 h-20 bg-gray-900/90 backdrop-blur-2xl rounded-[40px] flex items-center justify-around px-6 shadow-2xl z-[90] border border-white/10 ring-1 ring-white/10">
          <NavItem icon={LayoutDashboard} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavItem icon={MapIcon} label="Plans" active={view === 'plans'} onClick={() => setView('plans')} />
          <div className="relative h-20 flex items-center justify-center"><button onClick={() => startNewObservation()} className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-blue-500/40 border-4 border-gray-900/50 -mt-16 transition-transform active:scale-110 active:-translate-y-1"><Plus size={32} strokeWidth={3} /></button></div>
          <NavItem icon={ClipboardList} label="Findings" active={view === 'observations'} onClick={() => setView('observations')} />
          <NavItem icon={Settings} label="Setup" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>
      )}
    </div>
  );
};

export default App;
