
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, Map as MapIcon, ClipboardList, Send, Plus, Trash2, 
  ChevronRight, ArrowLeft, Edit3, Search, CloudSun, AlertTriangle,
  LayoutDashboard, Download, CheckCircle2, Settings, X, 
  Info, Bell, MapPin, Calendar, User, Save, FileText, Upload, Loader2,
  Maximize2, Eye, FolderOpen, LogOut, PlusCircle, Database, BookmarkPlus, Sparkles,
  Map as MapPinIcon
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

  // --- UI State ---
  const [view, setView] = useState<'projectBrowser' | 'dashboard' | 'plans' | 'observations' | 'editor' | 'settings'>('projectBrowser');
  const [editingObs, setEditingObs] = useState<Observation | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isSelectingLocation, setIsSelectingLocation] = useState<string | null>(null); // Plan ID being used for location selection
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState<{index: number, data: string} | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Defined filteredObservations to enable search functionality
  const filteredObservations = useMemo(() => {
    return observations.filter(obs => {
      const query = searchQuery.toLowerCase();
      return (
        obs.note.toLowerCase().includes(query) ||
        obs.trade.toLowerCase().includes(query) ||
        obs.responsibleParty.toLowerCase().includes(query) ||
        obs.priority.toLowerCase().includes(query)
      );
    });
  }, [observations, searchQuery]);

  // --- Persistence Logic ---
  
  useEffect(() => {
    localStorage.setItem('site_shared_comments', JSON.stringify(sharedComments));
  }, [sharedComments]);

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
    }
  }, [project, plans, observations]);

  // --- Logic ---
  const notify = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
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
          
          // Draw Glow
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
      
      doc.setFontSize(22);
      doc.setTextColor(33, 33, 33);
      doc.text("SITE INSPECTION REPORT", 105, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 28, { align: "center" });

      doc.setDrawColor(200, 200, 200);
      doc.line(20, 35, 190, 35);
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("PROJECT DETAILS", 20, 45);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Project Name: ${project.name}`, 20, 52);
      doc.text(`Location: ${project.location}`, 20, 58);
      doc.text(`Inspector: ${project.inspector}`, 20, 64);
      doc.text(`Total Findings: ${observations.length}`, 20, 70);

      const tableData = observations.map((obs, index) => [
        index + 1,
        new Date(obs.timestamp).toLocaleDateString(),
        obs.priority,
        obs.trade || "N/A",
        obs.note.substring(0, 50) + (obs.note.length > 50 ? "..." : ""),
        obs.responsibleParty || "GC"
      ]);

      (doc as any).autoTable({
        startY: 80,
        head: [['#', 'Date', 'Priority', 'Trade', 'Description', 'Responsible']],
        body: tableData,
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 4: { cellWidth: 50 } },
      });

      // --- Floor Plan Maps Section ---
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
        const pdfMaxHeight = 220;
        let pdfWidth = pdfMaxWidth;
        let pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        if (pdfHeight > pdfMaxHeight) {
          pdfHeight = pdfMaxHeight;
          pdfWidth = (imgProps.width * pdfHeight) / imgProps.height;
        }

        const startX = 20 + (pdfMaxWidth - pdfWidth) / 2;
        doc.addImage(mappedPlanImg, 'JPEG', startX, 30, pdfWidth, pdfHeight);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text("Pins indicate location and match finding numbers in detailed section.", 105, 30 + pdfHeight + 10, { align: "center" });
      }

      // --- Detailed Findings Section ---
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("DETAILED FINDINGS", 20, 20);

      let currentY = 30;
      for (const obs of observations) {
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }
        doc.setDrawColor(230, 230, 230);
        doc.line(20, currentY, 190, currentY);
        currentY += 10;

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`Finding #${observations.indexOf(obs) + 1}`, 20, currentY);
        const priorityColor = obs.priority === 'Critical' ? [220, 38, 38] : obs.priority === 'High' ? [249, 115, 22] : [37, 99, 235];
        doc.setTextColor(priorityColor[0], priorityColor[1], priorityColor[2]);
        doc.text(obs.priority.toUpperCase(), 190, currentY, { align: 'right' });
        doc.setTextColor(0, 0, 0);

        currentY += 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const planName = plans.find(p => p.id === obs.planId)?.name || "Unassigned";
        doc.text(`Location: ${planName}`, 20, currentY);
        currentY += 6;
        doc.setFont("helvetica", "bold");
        doc.text(`Trade: ${obs.trade || 'N/A'}`, 20, currentY);
        doc.text(`Responsible: ${obs.responsibleParty || 'N/A'}`, 190, currentY, { align: 'right' });
        currentY += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const splitNote = doc.splitTextToSize(`Description: ${obs.note}`, 170);
        doc.text(splitNote, 20, currentY);
        currentY += (splitNote.length * 5) + 10;

        if (obs.images.length > 0) {
          const maxImgHeight = 50;
          let currentX = 20;
          for (const [imgIdx, imgData] of obs.images.entries()) {
            const imgProps = doc.getImageProperties(imgData);
            let pdfHeight = maxImgHeight;
            let pdfWidth = (imgProps.width * pdfHeight) / imgProps.height;
            if (pdfWidth > 80) {
              pdfWidth = 80;
              pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            }
            if (currentY + pdfHeight + 10 > 280) {
              doc.addPage();
              currentY = 20;
              currentX = 20;
            }
            if (currentX + pdfWidth > 190) {
              currentX = 20;
              currentY += maxImgHeight + 10;
            }
            doc.addImage(imgData, 'JPEG', currentX, currentY, pdfWidth, pdfHeight);
            doc.setFontSize(8);
            doc.text(`Photo ${imgIdx + 1}`, currentX + (pdfWidth / 2), currentY + pdfHeight + 4, { align: 'center' });
            currentX += pdfWidth + 5;
          }
          currentY += maxImgHeight + 20;
        } else {
          currentY += 5;
        }
      }

      doc.save(`${project.name.replace(/\s+/g, '_')}_SiteReport.pdf`);
      notify("Report Generated Successfully");
    } catch (err) {
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
      responsibleParty: '',
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
    notify("Project Saved & Closed");
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

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project and all its data?")) {
      const newList = projectList.filter(p => p.id !== id);
      setProjectList(newList);
      localStorage.setItem('site_project_list', JSON.stringify(newList));
      localStorage.removeItem(`site_project_${id}_info`);
      localStorage.removeItem(`site_project_${id}_plans`);
      localStorage.removeItem(`site_project_${id}_obs`);
      if (activeProjectId === id) {
        setActiveProjectId(null);
        localStorage.removeItem('site_active_project_id');
      }
      notify("Project Deleted");
    }
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
      <div className="flex items-center gap-4">
        {showBack && (
          <button onClick={onBack || (() => setView('dashboard'))} className="p-2 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-2xl font-black tracking-tight text-gray-900">{title}</h1>
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
               <FolderOpen size={64} className="mb-4" />
               <p className="font-bold">No saved projects found</p>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Existing Inspections</p>
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
                    <button onClick={(e) => deleteProject(p.id, e)} className="p-3 text-gray-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 size={20} /></button>
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
      <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 pointer-events-none ${showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-10 scale-95'}`}>
        <div className="bg-gray-900 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-3 border border-white/10">
          <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 size={12} className="text-white" /></div>
          {showToast}
        </div>
      </div>

      <div className="flex-1">
        {view === 'dashboard' && (
          <div className="p-5 space-y-6 animate-in fade-in duration-500">
            <header className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Project Active</p>
                <h1 className="text-3xl font-black tracking-tighter leading-none">{project.name}</h1>
                <div className="flex items-center gap-3 mt-3 text-gray-500">
                  <div className="flex items-center gap-1 text-xs font-bold"><MapPin size={12} className="text-blue-500" /> {project.location}</div>
                </div>
              </div>
              <button onClick={() => setView('settings')} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100 active:rotate-45 transition-transform"><Settings size={22} className="text-gray-400" /></button>
            </header>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden active:scale-95 transition" onClick={() => setView('observations')}>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observations</span>
                  <p className="text-4xl font-black mt-1 text-gray-900">{observations.length}</p>
                </div>
                <ClipboardList className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12" size={80} />
              </div>
              <div className="bg-red-50 p-5 rounded-[32px] border border-red-100 shadow-sm relative overflow-hidden active:scale-95 transition" onClick={() => setView('observations')}>
                <div className="relative z-10">
                  <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Critical Issues</span>
                  <p className="text-4xl font-black mt-1 text-red-600">{observations.filter(o => o.priority === 'Critical').length}</p>
                </div>
                <AlertTriangle className="absolute -right-4 -bottom-4 opacity-[0.05] -rotate-12" size={80} />
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
            <button onClick={closeActiveProject} className="w-full py-5 bg-white border border-gray-100 text-gray-400 rounded-[28px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition"><LogOut size={16} /> Save & Exit to Projects</button>
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
            <div className="p-5 grid grid-cols-2 gap-4">
              {plans.map(plan => (
                <div key={plan.id} onClick={() => setActivePlanId(plan.id)} className="bg-white p-3 rounded-[32px] border border-gray-100 shadow-sm group active:scale-95 transition relative">
                  <button onClick={(e) => { e.stopPropagation(); setPlans(plans.filter(p => p.id !== plan.id)); notify("Plan Deleted"); }} className="absolute -top-1 -right-1 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-10 shadow-lg"><X size={12} /></button>
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-gray-50 mb-3 border border-gray-100 relative">
                    <img src={plan.imageData} className="w-full h-full object-contain bg-gray-100" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"><Maximize2 className="text-white" /></div>
                  </div>
                  <div className="px-1 flex justify-between items-center"><p className="text-xs font-black truncate max-w-[80%] uppercase tracking-tight">{plan.name}</p><span className="text-[10px] font-black text-blue-500">{observations.filter(o => o.planId === plan.id).length}</span></div>
                </div>
              ))}
            </div>

            {(activePlanId || isSelectingLocation) && (
              <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in zoom-in duration-300">
                <div className="p-6 flex justify-between items-center bg-black/60 backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-xl"><MapIcon size={18} className="text-blue-400" /></div>
                    <div>
                      <h3 className="text-white font-black uppercase text-xs tracking-widest">{plans.find(p => p.id === (activePlanId || isSelectingLocation))?.name}</h3>
                      <p className="text-[9px] text-white/50 font-bold uppercase tracking-tighter">Tap to drop finding pin</p>
                    </div>
                  </div>
                  <button onClick={() => {setActivePlanId(null); setIsSelectingLocation(null); setSelectedPinId(null);}} className="p-2 text-white/50 hover:text-white"><X size={28} /></button>
                </div>

                <div className="flex-1 relative overflow-auto bg-gray-900 flex items-center justify-center p-4">
                  <div className="relative inline-block rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                    <img 
                      src={plans.find(p => p.id === (activePlanId || isSelectingLocation))?.imageData} 
                      className="max-w-full h-auto select-none object-contain"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        if (isSelectingLocation && editingObs) {
                          setEditingObs({...editingObs, planId: isSelectingLocation, coords: {x, y}});
                          setIsSelectingLocation(null);
                        } else {
                          startNewObservation(activePlanId!, { x, y });
                        }
                      }}
                    />
                    {observations.filter(o => o.planId === (activePlanId || isSelectingLocation)).map(o => (
                      <div 
                        key={o.id}
                        className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-2xl transform transition-all hover:scale-125 ${
                          selectedPinId === o.id ? 'ring-4 ring-white ring-offset-2 ring-offset-transparent scale-110' : ''
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
                    ))}
                    {/* Ghost pin for the one currently being edited in "Location Selection" mode */}
                    {isSelectingLocation && editingObs?.coords && (
                       <div 
                        className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-dashed border-white bg-blue-500/50 flex items-center justify-center text-[10px] font-black text-white shadow-2xl animate-pulse"
                        style={{ left: `${editingObs.coords.x}%`, top: `${editingObs.coords.y}%` }}
                      >?</div>
                    )}
                  </div>
                </div>

                {selectedObservation && (
                  <div className="absolute bottom-28 left-6 right-6 p-5 bg-white rounded-[32px] shadow-2xl animate-in slide-in-from-bottom duration-300 flex gap-4 items-start">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      selectedObservation.priority === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{selectedObservation.trade || 'General'}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-white ${
                          selectedObservation.priority === 'Critical' ? 'bg-red-600' : 'bg-blue-600'
                        }`}>{selectedObservation.priority}</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 leading-tight mb-3 line-clamp-2">{selectedObservation.note}</p>
                      <div className="flex gap-2">
                         <button 
                           onClick={() => {setEditingObs(selectedObservation); setView('editor'); setActivePlanId(null); setSelectedPinId(null);}}
                           className="flex-1 py-2 bg-gray-900 text-white text-[10px] font-black uppercase rounded-xl"
                         >Edit Details</button>
                         <button 
                           onClick={() => setSelectedPinId(null)}
                           className="px-4 py-2 bg-gray-100 text-gray-400 text-[10px] font-black uppercase rounded-xl"
                         >Close</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'observations' && (
          <div className="animate-in slide-in-from-right duration-300">
            <Header title="Findings" showBack rightAction={<button onClick={generateReport} className="p-3 bg-white text-blue-600 rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition">{isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}</button>} />
            <div className="px-5 pb-4"><div className="relative group"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Search by trade or note..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-sm font-medium outline-none" /></div></div>
            <div className="px-5 space-y-4">
              {filteredObservations.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-gray-300 opacity-50">
                   <ClipboardList size={48} className="mb-4" />
                   <p className="font-bold">No findings match search</p>
                </div>
              ) : (
                filteredObservations.map((obs) => (
                  <div key={obs.id} onClick={() => { setEditingObs(obs); setView('editor'); }} className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm space-y-4 active:scale-[0.98] transition group">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-2">
                        <div className="w-6 h-6 bg-gray-900 text-white rounded-lg flex items-center justify-center text-[10px] font-black">{observations.indexOf(obs) + 1}</div>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${obs.priority === 'Critical' ? 'bg-red-600' : 'bg-blue-600'}`}>{obs.priority}</span>
                        {obs.planId && <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><MapPinIcon size={10} /> Plan</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setObservations(o => o.filter(x => x.id !== obs.id)); }} className="text-gray-200 hover:text-red-500"><Trash2 size={18} /></button>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 leading-relaxed line-clamp-2">{obs.note || "No description provided"}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-gray-50 text-gray-400">
                      <span className="text-[10px] font-black uppercase">{obs.trade || 'General'}</span>
                      <span className="text-[10px] font-black uppercase">{new Date(obs.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'editor' && editingObs && (
          <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col animate-in slide-in-from-bottom duration-500">
            {isAnnotating && <PhotoAnnotation imageSrc={isAnnotating.data} onSave={(data) => { const newImages = [...editingObs.images]; newImages[isAnnotating.index] = data; setEditingObs({...editingObs, images: newImages}); setIsAnnotating(null); }} onCancel={() => setIsAnnotating(null)} />}
            <header className="px-5 pt-8 pb-4 flex items-center justify-between bg-white border-b border-gray-100">
              <div className="flex items-center gap-4"><button onClick={() => setView('observations')} className="p-2 text-gray-400"><ArrowLeft size={24} /></button><h2 className="text-xl font-black tracking-tight">{editingObs.note ? 'Edit Finding' : 'New Finding'}</h2></div>
              <button onClick={syncToCloud} className="px-6 py-2.5 bg-blue-600 text-white rounded-full font-black text-xs uppercase shadow-lg shadow-blue-200">Save</button>
            </header>
            <main className="flex-1 overflow-y-auto p-5 space-y-6 pb-32">
              {/* Location Section */}
              <section className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Pin Location</label>
                {editingObs.planId ? (
                   <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><MapPinIcon size={20} /></div>
                        <div>
                          <p className="text-xs font-black uppercase">{plans.find(p => p.id === editingObs.planId)?.name}</p>
                          <p className="text-[10px] font-bold text-gray-400">Coordinates: {Math.round(editingObs.coords?.x || 0)}%, {Math.round(editingObs.coords?.y || 0)}%</p>
                        </div>
                      </div>
                      <button onClick={() => setIsSelectingLocation(editingObs.planId)} className="text-blue-500 font-black text-[10px] uppercase">Re-pin</button>
                   </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {plans.length === 0 ? (
                      <p className="text-[10px] font-bold text-gray-400 italic">No floor plans uploaded. Upload in "Plans" tab to enable pinning.</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                        {plans.map(p => (
                          <button 
                            key={p.id}
                            onClick={() => setIsSelectingLocation(p.id)}
                            className="flex shrink-0 items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-600 shadow-sm active:scale-95 transition"
                          >
                            <Plus size={14} className="text-blue-500" /> {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Description</label>
                  {editingObs.note && !sharedComments.includes(editingObs.note) && (
                    <button onClick={() => addToLibrary(editingObs.note)} className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase active:scale-95 transition"><BookmarkPlus size={12} /> Save to Library</button>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {sharedComments.map((comment, i) => (
                    <div key={i} className="flex shrink-0 items-center">
                      <button onClick={() => useComment(comment)} className="px-4 py-2 bg-white border border-gray-100 rounded-full text-[10px] font-bold text-gray-600 shadow-sm active:bg-blue-600 active:text-white transition whitespace-nowrap">{comment.length > 25 ? comment.substring(0, 25) + '...' : comment}</button>
                      <button onClick={() => removeFromLibrary(comment)} className="ml-[-10px] p-1 bg-red-500 text-white rounded-full z-10 border-2 border-white active:scale-90 transition"><X size={8} /></button>
                    </div>
                  ))}
                </div>
                <textarea 
                  value={editingObs.note} 
                  onChange={e => setEditingObs({...editingObs, note: e.target.value})} 
                  placeholder="Describe the issue..."
                  className="w-full h-40 p-5 rounded-3xl border-2 border-gray-100 focus:border-blue-500 outline-none font-semibold text-sm"
                />
              </section>

              <section className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Assignment</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 ml-1">Trade</span>
                    <input value={editingObs.trade} onChange={e => setEditingObs({...editingObs, trade: e.target.value})} className="w-full p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold outline-none" placeholder="Electrical" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 ml-1">Responsible Party</span>
                    <input value={editingObs.responsibleParty} onChange={e => setEditingObs({...editingObs, responsibleParty: e.target.value})} className="w-full p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold outline-none" placeholder="Subcontractor" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Urgency</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as Priority[]).map(p => (
                    <button key={p} onClick={() => setEditingObs({...editingObs, priority: p})} className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-tighter border-2 ${editingObs.priority === p ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-gray-100 text-gray-400'}`}>{p}</button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex justify-between items-center"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Photos</label><span className="text-[10px] font-bold text-blue-500">{editingObs.images.length}/5</span></div>
                <div className="grid grid-cols-3 gap-3">
                  {editingObs.images.map((img, i) => (
                    <div key={i} className="group relative aspect-square rounded-[24px] overflow-hidden border border-gray-100 bg-gray-50">
                      <img src={img} className="w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setIsAnnotating({index: i, data: img})} className="p-2.5 bg-white text-blue-600 rounded-xl"><Edit3 size={16} /></button>
                        <button onClick={() => setEditingObs({...editingObs, images: editingObs.images.filter((_, idx) => idx !== i)})} className="p-2.5 bg-white text-red-600 rounded-xl"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {editingObs.images.length < 5 && (
                    <label className="flex flex-col items-center justify-center gap-2 aspect-square bg-white border-2 border-dashed border-gray-200 rounded-[24px] text-gray-400 cursor-pointer">
                      <Camera size={24} /><span className="text-[8px] font-black uppercase tracking-widest">Capture</span><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => { const files = Array.from(e.target.files || []); files.forEach(file => { const reader = new FileReader(); reader.onloadend = () => setEditingObs(prev => prev ? ({ ...prev, images: [...prev.images, reader.result as string] }) : null); reader.readAsDataURL(file); }); }} className="hidden" />
                    </label>
                  )}
                </div>
              </section>
            </main>
          </div>
        )}

        {view === 'settings' && (
          <div className="animate-in slide-in-from-right duration-300">
            <Header title="Settings" showBack />
            <div className="p-5 space-y-6">
               <div className="space-y-4">
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Project Name</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><LayoutDashboard className="text-blue-500 mr-4" size={20} /><input value={project.name} onChange={e => setProject({...project, name: e.target.value})} className="flex-1 text-sm font-bold outline-none" /></div></div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Location</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><MapPinIcon className="text-red-500 mr-4" size={20} /><input value={project.location} onChange={e => setProject({...project, location: e.target.value})} className="flex-1 text-sm font-bold outline-none" /></div></div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Inspector</label><div className="flex items-center bg-white rounded-3xl border border-gray-100 p-4 shadow-sm"><User className="text-purple-500 mr-4" size={20} /><input value={project.inspector} onChange={e => setProject({...project, inspector: e.target.value})} className="flex-1 text-sm font-bold outline-none" /></div></div>
               </div>
               <div className="space-y-3 pt-6 border-t border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Database Management</p>
                  <button onClick={closeActiveProject} className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"><LogOut size={16} /> Save & Exit to Projects</button>
               </div>
            </div>
          </div>
        )}
      </div>

      {view !== 'editor' && !isSelectingLocation && (
        <nav className="fixed bottom-6 left-6 right-6 h-20 bg-gray-900/90 backdrop-blur-2xl rounded-[40px] flex items-center justify-around px-6 shadow-2xl z-40 border border-white/10 ring-1 ring-white/10">
          <NavItem icon={LayoutDashboard} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavItem icon={MapIcon} label="Plans" active={view === 'plans'} onClick={() => setView('plans')} />
          <div className="relative h-20 flex items-center justify-center"><button onClick={() => startNewObservation()} className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-blue-500/40 border-4 border-gray-900/50 -mt-16"><Plus size={32} strokeWidth={3} /></button></div>
          <NavItem icon={ClipboardList} label="Findings" active={view === 'observations'} onClick={() => setView('observations')} />
          <NavItem icon={Settings} label="Setup" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>
      )}
    </div>
  );
};

export default App;
