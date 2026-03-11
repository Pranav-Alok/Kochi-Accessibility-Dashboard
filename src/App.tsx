/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, ChangeEvent } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend
} from 'recharts';
import { 
  Map as MapIcon, 
  BarChart3, 
  Info, 
  ChevronRight, 
  ChevronDown,
  Bus, 
  Footprints, 
  Link as LinkIcon,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BookOpen,
  Activity,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Upload,
  RefreshCcw,
  FileJson,
  Database,
  MousePointerClick
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { KOCHI_WARDS_GEOJSON as INITIAL_DATA } from './data/kochi-wards';
import { scaleSequential } from 'd3-scale';
import { interpolateYlGnBu } from 'd3-scale-chromatic';
import { GoogleGenAI } from "@google/genai";
import shp from 'shpjs';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Indicator = 'bus_access' | 'walkability' | 'last_mile' | 'composite';
type Section = 'context' | 'map' | 'diagnostics' | 'inequality' | 'policy' | 'methodology' | 'comparison' | 'coverage' | 'about' | 'limitations';

const INDICATORS: { id: Indicator; label: string; icon: any; color: string; description: string }[] = [
  { 
    id: 'bus_access', 
    label: 'Bus Stop Access', 
    icon: Bus, 
    color: '#3b82f6',
    description: 'Proximity to public transit nodes and frequency of service.'
  },
  { 
    id: 'walkability', 
    label: 'Walkability', 
    icon: Footprints, 
    color: '#10b981',
    description: 'Quality of pedestrian infrastructure and safety.'
  },
  { 
    id: 'last_mile', 
    label: 'Last Mile Connectivity', 
    icon: LinkIcon, 
    color: '#f59e0b',
    description: 'Ease of reaching final destinations from transit hubs.'
  },
  { 
    id: 'composite', 
    label: 'Composite Mobility Score', 
    icon: Activity, 
    color: '#8b5cf6',
    description: 'Overall urban mobility performance combining all indicators.'
  },
];

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'about', label: 'About Project', icon: Info },
  { id: 'context', label: 'Mobility Context', icon: BookOpen },
  { id: 'map', label: 'Accessibility Map', icon: MapIcon },
  { id: 'diagnostics', label: 'Ward Diagnostics', icon: Activity },
  { id: 'comparison', label: 'Ward Comparison', icon: BarChart3 },
  { id: 'inequality', label: 'Inequality Analysis', icon: AlertCircle },
  { id: 'policy', label: 'Policy Insights', icon: Lightbulb },
  { id: 'limitations', label: 'Data & Limitations', icon: AlertCircle },
  { id: 'methodology', label: 'Methodology', icon: Database },
  { id: 'coverage', label: 'Data Coverage', icon: Search },
];

const METHODOLOGY_DATA = {
  bus_access: {
    objective: "Measure the accessibility of public transport stops within each ward.",
    variables: [
      "Number of bus stops within ward",
      "Ward population",
      "Spatial distribution of stops",
      "Distance to nearest stop"
    ],
    interpretation: "Higher values indicate better access to public transport infrastructure.",
    policyRelevance: "Helps identify transit deserts and areas requiring improved bus stop coverage.",
    references: [
      "Sustainable Urban Transport Indicators (World Bank)",
      "Transit Accessibility Metrics (ITDP)",
      "UN Sustainable Development Goal 11.2"
    ]
  },
  walkability: {
    objective: "Measure the pedestrian friendliness and accessibility of urban areas.",
    variables: [
      "Intersection density",
      "Road network connectivity",
      "Block length",
      "Pedestrian route availability"
    ],
    interpretation: "Higher values indicate environments that support walking and short-distance mobility.",
    policyRelevance: "Supports planning for non-motorized transport and pedestrian infrastructure.",
    references: [
      "Walk Score methodology",
      "ITDP Walkability Framework",
      "Global Street Design Guide"
    ]
  },
  last_mile: {
    objective: "Measure how easily residents can reach major public transport corridors from their location.",
    variables: [
      "Distance to transit stops",
      "Network connectivity",
      "Availability of feeder routes",
      "Street accessibility"
    ],
    interpretation: "Higher values indicate stronger integration between neighborhoods and public transport systems.",
    policyRelevance: "Helps planners identify areas where last-mile connectivity interventions are required.",
    references: [
      "ITDP TOD Standard",
      "World Bank Urban Mobility Indicators",
      "Transit-Oriented Development literature"
    ]
  },
  composite: {
    objective: "Provide a holistic overview of urban mobility performance by aggregating access, walkability, and connectivity.",
    variables: [
      "Bus Stop Access Index",
      "Walkability Index",
      "Last Mile Connectivity Index"
    ],
    interpretation: "Higher values indicate a well-integrated, accessible, and pedestrian-friendly urban environment.",
    policyRelevance: "Serves as a primary KPI for city-wide mobility benchmarking and resource allocation.",
    references: [
      "Sustainable Development Goals (SDG 11)",
      "Global Urban Monitoring Framework",
      "Kochi Smart City Mobility Plan"
    ]
  }
};

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>('about');
  const [selectedIndicator, setSelectedIndicator] = useState<Indicator>('bus_access');
  const [selectedWard, setSelectedWard] = useState<any>(null);
  const [comparisonWard, setComparisonWard] = useState<any>(null);
  const [hoveredWard, setHoveredWard] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Helper to calculate composite scores for a FeatureCollection
  const calculateCompositeScores = (data: any) => {
    return {
      ...data,
      features: data.features.map((f: any) => {
        const p = f.properties;
        const bus = p.bus_access ?? null;
        const walk = p.walkability ?? null;
        const last = p.last_mile ?? null;
        let composite = p.composite ?? null;
        
        if (composite === null && bus !== null && walk !== null && last !== null) {
          composite = (bus + walk + last) / 3;
        }
        
        return {
          ...f,
          properties: { ...p, composite }
        };
      })
    };
  };

  const [geoJsonData, setGeoJsonData] = useState<any>(() => calculateCompositeScores(INITIAL_DATA));
  const [dataTimestamp, setDataTimestamp] = useState(Date.now());
  const [expandedMethodology, setExpandedMethodology] = useState<Indicator | null>('bus_access');
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch real boundaries from GitHub Shapefile
  useEffect(() => {
    async function fetchRealBoundaries() {
      setLoading(true);
      try {
        // Fetch shapefile from GitHub
        const baseUrl = 'https://raw.githubusercontent.com/Pranav-Alok/kochi-mobility-dashboard/main/spatial/kochi_wards/kochi_wards';
        
        const [shpBuffer, dbfBuffer, prjBuffer, cpgBuffer] = await Promise.all([
          fetch(`${baseUrl}.shp`).then(res => res.arrayBuffer()),
          fetch(`${baseUrl}.dbf`).then(res => res.arrayBuffer()),
          fetch(`${baseUrl}.prj`).then(res => res.arrayBuffer()),
          fetch(`${baseUrl}.cpg`).then(res => res.arrayBuffer())
        ]);

        const geojson = await shp.combine([
          shp.parseShp(shpBuffer, Buffer.from(prjBuffer)),
          shp.parseDbf(dbfBuffer, Buffer.from(cpgBuffer))
        ]);

        processAndSetGeoJson(geojson);
      } catch (error) {
        console.error("Failed to fetch shapefile boundaries:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchRealBoundaries();
  }, []);

  const processAndSetGeoJson = (geojson: any) => {
    // shpjs can return an array of FeatureCollections if the zip contains multiple layers
    const actualGeojson = Array.isArray(geojson) ? geojson[0] : geojson;

    if (!actualGeojson || !actualGeojson.features) {
      console.error("Invalid GeoJSON structure received:", actualGeojson);
      return;
    }

    // Helper to normalize names for comparison
    const normalize = (name: string) => {
      if (!name) return "";
      
      let n = name.toUpperCase();
      
      // Manual mapping for specific mismatches
      const manualMapping: Record<string, string> = {
        "KARUVELIPPADY": "KARAUVELIPADY",
        "PUTHUKKALAVATTAM": "PUTHUKALAVATTOM",
        "NAZRETH": "NAZARAT",
        "ELAMKULAM": "ELAMKUALAM",
        "KATHRIKADAVU": "KATHRUKADAVU",
        "MUNDAMVELLY": "MUNDAMVELI",
        "PERUMANUR": "PERUMANOOR",
        "PADIVATTAM": "PALARIVATTOM",
        "KADEBHAGAM": "KADAVANTHRA",
        "THAREBHAGAM": "ELAMAKKARA"
      };

      if (manualMapping[n]) {
        n = manualMapping[n];
      }

      return n.toLowerCase()
        .replace(/ward/g, "") // remove "ward"
        .replace(/[^a-z0-9]/g, "") // remove non-alphanumeric
        .trim();
    };

    const enrichedFeatures = actualGeojson.features.map((f: any) => {
      const props = f.properties || {};
      
      // 1. Try known name keys (case-insensitive search)
      const nameKeys = ['WARD_NAME', 'WARDNAME', 'WardName', 'name', 'NAME', 'Ward_Name', 'LABEL', 'Label', 'TITLE', 'Title', 'WARD'];
      let wardName = null;
      
      for (const key of nameKeys) {
        if (props[key]) {
          wardName = props[key];
          break;
        }
      }

      // 2. Try numeric IDs if no name found
      if (!wardName) {
        const idKeys = ['WARD_NO', 'WARDNO', 'ward_no', 'ID', 'id', 'OBJECTID', 'FID'];
        for (const key of idKeys) {
          if (props[key] !== undefined && props[key] !== null) {
            wardName = `Ward ${props[key]}`;
            break;
          }
        }
      }

      // 3. Fallback: Find the first string property that isn't a common metadata key
      if (!wardName) {
        const stringKey = Object.keys(props).find(key => {
          const val = props[key];
          const k = key.toLowerCase();
          return typeof val === 'string' && 
                 val.length > 0 &&
                 !['id', 'color', 'style', 'type', 'layer'].includes(k);
        });
        if (stringKey) wardName = props[stringKey];
      }

      wardName = wardName || "Unknown Ward";

      // Check if this ward exists in our initial data to get mobility scores
      // Use normalized comparison to handle minor name mismatches
      const normalizedUploadedName = normalize(wardName);
      const initialWard = INITIAL_DATA.features.find(
        (iw: any) => normalize(iw.properties.name) === normalizedUploadedName
      );

      const bus_access = props.bus_access || initialWard?.properties.bus_access || null;
      const walkability = props.walkability || initialWard?.properties.walkability || null;
      const last_mile = props.last_mile || initialWard?.properties.last_mile || null;

      // Calculate composite score if all components exist
      let composite = null;
      if (bus_access !== null && walkability !== null && last_mile !== null) {
        composite = (bus_access + walkability + last_mile) / 3;
      }

      return {
        ...f,
        properties: {
          ...props,
          name: wardName,
          bus_access,
          walkability,
          last_mile,
          composite
        }
      };
    });

    setGeoJsonData({
      type: 'FeatureCollection',
      features: enrichedFeatures
    });
    setDataTimestamp(Date.now());
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setUploadError(null);

    try {
      let geojson: any;

      if (files.length === 1 && files[0].name.endsWith('.zip')) {
        // Handle ZIP file
        const buffer = await files[0].arrayBuffer();
        geojson = await shp(buffer);
      } else {
        // Handle individual files
        const fileMap: Record<string, ArrayBuffer> = {};
        for (let i = 0; i < files.length; i++) {
          const ext = files[i].name.split('.').pop()?.toLowerCase();
          if (ext) fileMap[ext] = await files[i].arrayBuffer();
        }

        if (!fileMap.shp || !fileMap.dbf) {
          throw new Error("Missing .shp or .dbf file");
        }

        geojson = await shp.combine([
          shp.parseShp(fileMap.shp, fileMap.prj ? Buffer.from(fileMap.prj) : undefined),
          shp.parseDbf(fileMap.dbf, fileMap.cpg ? Buffer.from(fileMap.cpg) : undefined)
        ]);
      }

      processAndSetGeoJson(geojson);
      setActiveSection('map');
    } catch (error: any) {
      console.error("Upload failed:", error);
      setUploadError(error.message || "Failed to parse shapefile. Ensure you upload .shp and .dbf files.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetToDefault = () => {
    setGeoJsonData(calculateCompositeScores(INITIAL_DATA));
    setSelectedWard(null);
    setComparisonWard(null);
  };

  // Color scale for choropleth
  const colorScale = useMemo(() => {
    return scaleSequential(interpolateYlGnBu).domain([0.3, 1.0]);
  }, []);

  const getStyle = (feature: any) => {
    const value = feature.properties[selectedIndicator];
    const isSelected = selectedWard?.name === feature.properties.name;
    const isComparison = comparisonWard?.name === feature.properties.name;
    const hasData = value !== null && value !== undefined;

    return {
      fillColor: hasData ? colorScale(value) : '#2d2d2d',
      weight: (isSelected || isComparison) ? 4 : 1.5,
      opacity: 1,
      color: isSelected ? '#4f46e5' : (isComparison ? '#f59e0b' : 'white'),
      fillOpacity: (isSelected || isComparison) ? 0.9 : (hasData ? 0.7 : 0.4),
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 3,
          color: '#6366f1',
          fillOpacity: 0.9,
        });
        setHoveredWard(feature.properties);
      },
      mousemove: (e) => {
        setMousePos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle(getStyle(feature));
        setHoveredWard(null);
      },
      click: () => {
        if (activeSection === 'comparison') {
          if (!selectedWard) {
            setSelectedWard(feature.properties);
          } else if (selectedWard.name === feature.properties.name) {
            setSelectedWard(null);
          } else if (comparisonWard?.name === feature.properties.name) {
            setComparisonWard(null);
          } else {
            setComparisonWard(feature.properties);
          }
        } else {
          setSelectedWard(feature.properties);
          setActiveSection('diagnostics');
        }
      },
    });
  };

  const radarData = useMemo(() => {
    if (!selectedWard) return [];
    return [
      { subject: 'Bus Access', value: (selectedWard.bus_access || 0) * 100 },
      { subject: 'Walkability', value: (selectedWard.walkability || 0) * 100 },
      { subject: 'Last Mile', value: (selectedWard.last_mile || 0) * 100 },
      { subject: 'Composite', value: (selectedWard.composite || 0) * 100 },
    ];
  }, [selectedWard]);

  const comparisonData = useMemo(() => {
    if (!selectedWard || !comparisonWard) return [];
    return [
      { 
        subject: 'Bus Access', 
        A: (selectedWard.bus_access || 0) * 100,
        B: (comparisonWard.bus_access || 0) * 100 
      },
      { 
        subject: 'Walkability', 
        A: (selectedWard.walkability || 0) * 100,
        B: (comparisonWard.walkability || 0) * 100 
      },
      { 
        subject: 'Last Mile', 
        A: (selectedWard.last_mile || 0) * 100,
        B: (comparisonWard.last_mile || 0) * 100 
      },
      { 
        subject: 'Composite', 
        A: (selectedWard.composite || 0) * 100,
        B: (comparisonWard.composite || 0) * 100 
      },
    ];
  }, [selectedWard, comparisonWard]);

  const sortedWards = useMemo(() => {
    return [...geoJsonData.features]
      .map(f => f.properties)
      .filter(p => p[selectedIndicator] !== null && p[selectedIndicator] !== undefined)
      .sort((a, b) => b[selectedIndicator] - a[selectedIndicator]);
  }, [selectedIndicator, geoJsonData]);

  const inequalityData = useMemo(() => {
    return sortedWards.map(w => ({
      name: w.name,
      score: w[selectedIndicator] * 100
    }));
  }, [sortedWards, selectedIndicator]);

  const policyInsights = useMemo(() => {
    if (sortedWards.length === 0) return [];
    const avg = sortedWards.reduce((acc, w) => acc + w[selectedIndicator], 0) / sortedWards.length;
    const lowWards = sortedWards.filter(w => w[selectedIndicator] < 0.5).length;
    const topWards = sortedWards.slice(0, 5).map(w => w.name).join(', ');
    
    const spatialPattern = avg < 0.4 ? "Fragmented Accessibility" : (avg > 0.7 ? "Integrated Core" : "Developing Corridor");

    const baseInsights = [];

    if (selectedIndicator === 'bus_access') {
      baseInsights.push(
        { 
          title: "Public Transit Saturation", 
          text: `Spatial analysis shows a 'Core-Periphery' gap. While central wards like ${topWards} have high access, ${lowWards} peripheral wards lack adequate bus frequency, hindering the 'Kochi Smart City' goal of 15-minute city access.` 
        },
        { 
          title: "UMTA Integration", 
          text: "Aligning with the Unified Metropolitan Transport Authority (UMTA) Kochi, there is a critical need to synchronize private and KSRTC bus schedules to eliminate service overlaps in high-scoring zones." 
        }
      );
    } else if (selectedIndicator === 'walkability') {
      baseInsights.push(
        { 
          title: "Pedestrian Safety Mission", 
          text: `The 'Rebuild Kerala Initiative' emphasizes resilient urban design. Wards with low walkability scores require immediate intervention through the 'Kochi Junction Improvement' project to reduce pedestrian fatalities.` 
        },
        { 
          title: "Water Metro Synergy", 
          text: "Wards near Water Metro terminals (e.g., Vyttila, Kakkanad) must prioritize high-quality sidewalks to ensure the success of Kochi's integrated water-land transport vision." 
        }
      );
    } else if (selectedIndicator === 'last_mile') {
      baseInsights.push(
        { 
          title: "Metro Phase 2 Feeder Strategy", 
          text: `With the Kakkanad extension (Phase 2) underway, wards along the Seaport-Airport road must improve last-mile scores to maximize Metro ridership and reduce private vehicle dependency.` 
        },
        { 
          title: "E-Mobility Transition", 
          text: "Kerala's E-Mobility Policy suggests deploying shared electric rickshaws in wards scoring below 0.6 to bridge the 'Last Mile' gap between transit hubs and residential clusters." 
        }
      );
    } else {
      baseInsights.push(
        { 
          title: "Integrated Mobility Index", 
          text: `The city-wide average of ${(avg * 100).toFixed(1)}% reflects a '${spatialPattern}' pattern. Strategic focus must shift from siloed projects to a 'Network-First' approach as envisioned in the Kochi Comprehensive Mobility Plan (CMP).` 
        },
        { 
          title: "Climate Resilient Transport", 
          text: "Low-scoring wards in the composite index are often flood-prone. Future mobility investments must align with the 'Kochi Climate Action Plan' to ensure year-round accessibility." 
        }
      );
    }

    return baseInsights;
  }, [selectedIndicator, sortedWards]);

  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const generateCitySummary = async () => {
    if (!geoJsonData || isGeneratingSummary) return;
    setIsGeneratingSummary(true);
    setAiSummary('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const stats = INDICATORS.map(ind => {
        const scores = geoJsonData.features.map((f: any) => f.properties[ind.id]).filter((v: any) => v !== null);
        const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        return `${ind.label}: ${(avg * 100).toFixed(1)}%`;
      }).join(', ');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `As an urban mobility expert, provide a concise 2-sentence policy summary for Kochi based on these average scores: ${stats}. Mention specific Kochi missions like Water Metro or UMTA where relevant.`,
      });
      setAiSummary(response.text || '');
    } catch (error) {
      console.error("Failed to generate summary:", error);
      setAiSummary("Unable to generate AI summary at this time.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'policy' && !aiSummary) {
      generateCitySummary();
    }
  }, [activeSection]);

  useEffect(() => {
    setAiSummary('');
  }, [geoJsonData]);

  const coverageStats = useMemo(() => {
    const TOTAL_CITY_WARDS = 74;
    return INDICATORS.map(ind => {
      const withData = geoJsonData.features.filter((f: any) => f.properties[ind.id] !== null && f.properties[ind.id] !== undefined).length;
      return {
        id: ind.id,
        label: ind.label,
        icon: ind.icon,
        withData,
        withoutData: TOTAL_CITY_WARDS - withData,
        percentage: (withData / TOTAL_CITY_WARDS) * 100
      };
    });
  }, [geoJsonData]);

  const filteredWards = useMemo(() => {
    if (!searchQuery) return [];
    return geoJsonData.features
      .map((f: any) => f.properties)
      .filter((w: any) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [searchQuery, geoJsonData]);

  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans text-slate-300">
      {/* Navigation Rail */}
      <nav className="w-20 bg-black border-r border-white/5 flex flex-col items-center py-8 gap-10 z-30">
        <div className="p-3 bg-white/5 rounded-2xl text-indigo-500 border border-white/10 shadow-2xl shadow-indigo-500/10">
          <MapIcon size={24} />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "p-4 rounded-2xl transition-all duration-500 relative group",
                activeSection === section.id 
                  ? "bg-white/5 text-white" 
                  : "text-slate-600 hover:text-slate-300 hover:bg-white/5"
              )}
              title={section.label}
            >
              <section.icon size={20} className={cn("transition-transform duration-500 group-hover:scale-110", activeSection === section.id && "text-indigo-400")} />
              {activeSection === section.id && (
                <motion.div 
                  layoutId="active-rail"
                  className="absolute left-0 top-1/3 bottom-1/3 w-0.5 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Narrative Sidebar */}
      <aside className="w-[420px] bg-[#050505] border-r border-white/5 flex flex-col z-20 overflow-hidden">
        <div className="p-8 border-b border-white/5 bg-black/20 backdrop-blur-md">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
            Kochi <span className="text-indigo-400">Accessibility</span>
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em]">
              Observatory v2.0
            </p>
            <div className="h-px flex-1 bg-white/5" />
          </div>
        </div>

        <div ref={sidebarRef} className="flex-1 overflow-y-auto p-8 space-y-12 scroll-smooth">
          <AnimatePresence mode="wait">
            {activeSection === 'context' && (
              <motion.div
                key="context"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-12"
              >
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                      <BookOpen className="text-indigo-400" size={20} />
                      Urban Context
                    </h2>
                    <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
                      <p>
                        Kochi, the commercial capital of Kerala, faces unique mobility challenges stemming from its complex geography of islands and backwaters.
                      </p>
                      <ul className="space-y-4">
                        <li className="flex gap-4">
                          <div className="w-1 h-1 rounded-full bg-indigo-500/50 mt-2 shrink-0" />
                          <span className="text-[13px]"><strong className="text-slate-200 font-medium">Fragmented Transit:</strong> A mix of private buses, KSRTC, and water metros that often lack integrated scheduling.</span>
                        </li>
                        <li className="flex gap-4">
                          <div className="w-1 h-1 rounded-full bg-indigo-500/50 mt-2 shrink-0" />
                          <span className="text-[13px]"><strong className="text-slate-200 font-medium">First/Last Mile Gaps:</strong> Trunk lines are often inaccessible due to poor pedestrian infrastructure.</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em]">Motivation</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="p-5 glass-panel rounded-2xl">
                        <h4 className="text-xs font-bold text-white mb-2 tracking-tight">Evidence-Based Planning</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Identify specific wards where transit investment will yield the highest social return.</p>
                      </div>
                      <div className="p-5 glass-panel rounded-2xl">
                        <h4 className="text-xs font-bold text-white mb-2 tracking-tight">Equity & Inclusion</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Measure how effectively the transport network serves low-income communities.</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl space-y-4">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Key References</h4>
                    <ul className="space-y-3">
                      <li className="text-[11px] text-slate-300 leading-normal">
                        <span className="block font-bold text-white mb-0.5">Comprehensive Mobility Plan (CMP) 2024</span>
                        Kochi Municipal Corporation & KMRL Strategic Framework.
                      </li>
                      <li className="text-[11px] text-slate-300 leading-normal">
                        <span className="block font-bold text-white mb-0.5">National Urban Transport Policy (NUTP)</span>
                        Ministry of Housing and Urban Affairs (MoHUA) Guidelines.
                      </li>
                      <li className="text-[11px] text-slate-300 leading-normal">
                        <span className="block font-bold text-white mb-0.5">WRI India: Transit Oriented Development</span>
                        Assessment of Kochi's Metro corridors and station influence areas.
                      </li>
                    </ul>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Indicator Overview</h3>
                  <div className="grid grid-cols-1 gap-4">
                  {INDICATORS.map(ind => (
                    <div key={ind.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                          <ind.icon size={18} />
                        </div>
                        <h3 className="font-bold text-sm">{ind.label}</h3>
                      </div>
                      <p className="text-xs text-slate-500">{ind.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <RefreshCcw size={12} />
                    Data Configuration
                  </h3>
                  
                  <div className="space-y-3">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl transition-all flex items-center gap-4 group"
                    >
                      <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <Upload size={20} />
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-sm text-white">Upload Shapefile</span>
                        <span className="block text-[10px] text-slate-500">Supports .zip or .shp + .dbf</span>
                      </div>
                    </button>
                    
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      multiple
                      accept=".shp,.dbf,.prj,.cpg,.zip"
                      onChange={handleFileUpload}
                    />

                    {uploadError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                        <AlertCircle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-rose-400 leading-normal">{uploadError}</p>
                      </div>
                    )}

                    <button 
                      onClick={resetToDefault}
                      className="w-full py-2 text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors flex items-center justify-center gap-2"
                    >
                      <FileJson size={12} />
                      RESET TO DEFAULT DATA
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => setActiveSection('map')}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group"
                >
                  Explore the Map
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            )}

            {activeSection === 'map' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-10"
              >
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <MapIcon className="text-indigo-400" size={20} />
                    Accessibility Map
                  </h2>
                  <p className="text-slate-400 text-[13px] leading-relaxed">
                    Visualize the spatial distribution of mobility scores across the city. Darker areas indicate higher accessibility.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em]">Active Indicator</label>
                  <div className="flex flex-col gap-2">
                    {INDICATORS.map((indicator) => (
                      <button
                        key={indicator.id}
                        onClick={() => setSelectedIndicator(indicator.id)}
                        className={cn(
                          "p-4 rounded-2xl transition-all duration-500 text-left border flex items-center gap-4 group",
                          selectedIndicator === indicator.id
                            ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                            : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
                        )}
                      >
                        <div className={cn(
                          "p-2.5 rounded-xl transition-colors duration-500",
                          selectedIndicator === indicator.id ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-500"
                        )}>
                          <indicator.icon size={18} />
                        </div>
                        <div className="flex-1">
                          <span className="block font-bold text-xs tracking-tight">{indicator.label}</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5 group-hover:text-slate-400 transition-colors">{indicator.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Find a ward..."
                    className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {filteredWards.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden">
                      {filteredWards.map((w: any) => (
                        <button
                          key={w.name}
                          onClick={() => {
                            setSelectedWard(w);
                            setActiveSection('diagnostics');
                            setSearchQuery('');
                          }}
                          className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 transition-colors flex justify-between items-center"
                        >
                          <span>{w.name}</span>
                          <ArrowRight size={14} className="text-slate-600" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeSection === 'diagnostics' && (
              <motion.div
                key="diagnostics"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-10"
              >
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Activity className="text-indigo-400" size={20} />
                    Ward Diagnostics
                  </h2>
                  <p className="text-slate-400 text-[13px] leading-relaxed">
                    Select a ward on the map to view granular performance metrics and infrastructure quality scores.
                  </p>
                </div>

                {!selectedWard ? (
                  <div className="p-10 glass-panel rounded-[2rem] border-dashed border-white/10 flex flex-col items-center text-center gap-4">
                    <div className="p-4 bg-white/5 rounded-full text-slate-600">
                      <MousePointerClick size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-1 tracking-tight">No Ward Selected</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Click any ward on the map to analyze its mobility profile.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="p-6 glass-panel rounded-[2rem] border-indigo-500/20 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4">
                        <div className="px-2 py-1 bg-indigo-500/20 rounded text-[9px] font-mono text-indigo-400 border border-indigo-500/30">
                          SELECTED
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-1">{selectedWard.name}</h3>
                      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Kochi Municipal Ward</p>
                      
                      <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Composite Score</p>
                          <p className="text-3xl font-bold text-white">
                            {(selectedWard.composite * 100).toFixed(1)}
                            <span className="text-xs text-slate-500 ml-1 font-sans font-normal">%</span>
                          </p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Rank</p>
                          <p className="text-3xl font-bold text-white">
                            #{sortedWards.findIndex(w => w.name === selectedWard.name) + 1}
                          </p>
                        </div>
                      </div>
                    </div>

                      {selectedWard.bus_access === null && selectedWard.walkability === null && selectedWard.last_mile === null ? (
                        <div className="p-8 bg-white/5 rounded-2xl border border-dashed border-white/10 text-center">
                          <AlertCircle className="mx-auto text-slate-600 mb-3" size={32} />
                          <p className="text-slate-500 text-sm">No mobility data available for this ward yet.</p>
                        </div>
                      ) : (
                        <>
                          <div className="h-64 w-full bg-white/5 rounded-2xl p-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Radar
                                  name="Score"
                                  dataKey="value"
                                  stroke="#818cf8"
                                  fill="#818cf8"
                                  fillOpacity={0.5}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            {INDICATORS.map(ind => (
                              <div key={ind.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3">
                                  <ind.icon size={16} className="text-slate-500" />
                                  <span className="text-sm text-slate-400">{ind.label}</span>
                                </div>
                                <span className="font-mono font-bold text-indigo-400">
                                  {selectedWard[ind.id] !== null 
                                    ? `${(selectedWard[ind.id] * 100).toFixed(0)}%` 
                                    : 'N/A'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                )}
              </motion.div>
            )}

            {activeSection === 'comparison' && (
              <motion.div
                key="comparison"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <BarChart3 className="text-indigo-500" size={20} />
                    Ward Comparison
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Select two wards to compare their mobility performance across all indicators.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Selection Controls */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ward A</label>
                        {selectedWard && (
                          <button onClick={() => setSelectedWard(null)} className="text-[9px] text-rose-500 font-bold hover:underline">CLEAR</button>
                        )}
                      </div>
                      <div className={cn(
                        "p-3 rounded-xl border text-sm font-bold truncate",
                        selectedWard ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-white/5 border-white/5 text-slate-600"
                      )}>
                        {selectedWard?.name || 'Select on Map'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ward B</label>
                        {comparisonWard && (
                          <button onClick={() => setComparisonWard(null)} className="text-[9px] text-rose-500 font-bold hover:underline">CLEAR</button>
                        )}
                      </div>
                      <div className={cn(
                        "p-3 rounded-xl border text-sm font-bold truncate",
                        comparisonWard ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-white/5 border-white/5 text-slate-600"
                      )}>
                        {comparisonWard?.name || 'Search below'}
                      </div>
                    </div>
                  </div>

                  {/* Search for Ward B */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      type="text"
                      placeholder="Search for Ward B..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                    {filteredWards.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                        {filteredWards.map((w: any) => (
                          <button
                            key={w.name}
                            onClick={() => {
                              setComparisonWard(w);
                              setSearchQuery('');
                            }}
                            className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center justify-between group"
                          >
                            <span>{w.name}</span>
                            <ArrowRight size={14} className="text-slate-600 group-hover:text-indigo-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Comparison Chart */}
                  {selectedWard && comparisonWard ? (
                    <div className="space-y-8">
                      <div className="h-72 w-full bg-white/5 rounded-2xl p-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={comparisonData}>
                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <Radar
                              name={selectedWard.name}
                              dataKey="A"
                              stroke="#818cf8"
                              fill="#818cf8"
                              fillOpacity={0.5}
                            />
                            <Radar
                              name={comparisonWard.name}
                              dataKey="B"
                              stroke="#f59e0b"
                              fill="#f59e0b"
                              fillOpacity={0.5}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {INDICATORS.map(ind => {
                          const valA = selectedWard[ind.id] || 0;
                          const valB = comparisonWard[ind.id] || 0;
                          const diff = (valA - valB) * 100;
                          
                          return (
                            <div key={ind.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ind.icon size={14} className="text-slate-500" />
                                  <span className="text-xs font-bold text-white">{ind.label}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-bold">
                                  <span className="text-indigo-400">{(valA * 100).toFixed(0)}%</span>
                                  <span className="text-slate-600">vs</span>
                                  <span className="text-amber-400">{(valB * 100).toFixed(0)}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-indigo-500/50" style={{ width: `${valA * 100}%` }} />
                                <div className="h-full bg-amber-500/50" style={{ width: `${valB * 100}%` }} />
                              </div>
                              <p className={cn(
                                "text-[10px] font-bold",
                                diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-slate-500"
                              )}>
                                {diff > 0 ? `+${diff.toFixed(1)}% Advantage A` : diff < 0 ? `${diff.toFixed(1)}% Advantage B` : 'Equal Performance'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                        <BarChart3 size={32} className="text-slate-600" />
                      </div>
                      <p className="text-slate-500 text-sm">Select two wards to begin comparison.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeSection === 'inequality' && (
              <motion.div
                key="inequality"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <Activity className="text-indigo-500" size={20} />
                    Inequality Analysis
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Comparing all wards reveals the "Mobility Gap". The chart below shows the distribution of scores for <span className="text-white font-bold">{INDICATORS.find(i => i.id === selectedIndicator)?.label}</span>.
                  </p>
                </div>

                {inequalityData.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
                    <AlertCircle className="mx-auto text-slate-600 mb-3" size={32} />
                    <p className="text-slate-500 text-sm">No mobility data available for comparison.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="h-64 w-full bg-white/5 rounded-2xl p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={inequalityData.slice(0, 15)} layout="vertical">
                          <XAxis type="number" hide domain={[0, 100]} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            tick={{ fill: '#94a3b8', fontSize: 10 }} 
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                          />
                          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                            {inequalityData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={colorScale(entry.score / 100)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Ward Ranking</h3>
                      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                        {sortedWards.map((w, i) => (
                          <div key={w.name} className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-sm border border-white/5">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold text-slate-600 w-6">{i + 1}</span>
                              <span className="font-medium text-slate-300">{w.name}</span>
                            </div>
                            <span className="font-mono font-bold" style={{ color: colorScale(w[selectedIndicator]) }}>
                              {(w[selectedIndicator] * 100).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === 'policy' && (
              <motion.div
                key="policy"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <Activity className="text-indigo-500" size={20} />
                    Policy Insights
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Strategic recommendations aligned with Kochi's urban mobility missions.
                  </p>
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <Activity size={18} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Spatial Pattern Observed</h4>
                    <p className="text-sm font-bold text-white">
                      {sortedWards.length > 0 
                        ? (sortedWards.reduce((acc, w) => acc + w[selectedIndicator], 0) / sortedWards.length < 0.4 ? "Fragmented Accessibility" : (sortedWards.reduce((acc, w) => acc + w[selectedIndicator], 0) / sortedWards.length > 0.7 ? "Integrated Core" : "Developing Corridor"))
                        : "Insufficient Data"}
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">City-Wide AI Summary</h3>
                    <div className="flex items-center gap-2">
                      {isGeneratingSummary && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                      <button 
                        onClick={generateCitySummary}
                        disabled={isGeneratingSummary}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
                      >
                        <RefreshCcw size={12} />
                      </button>
                    </div>
                  </div>
                  {aiSummary ? (
                    <p className="text-sm text-slate-300 leading-relaxed">
                      "{aiSummary}"
                    </p>
                  ) : (
                    <div className="h-12 flex items-center justify-center">
                      <p className="text-[10px] text-slate-600">Generating observatory summary...</p>
                    </div>
                  )}
                </div>

                {policyInsights.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
                    <AlertCircle className="mx-auto text-slate-600 mb-3" size={32} />
                    <p className="text-slate-500 text-sm">Insufficient data to generate policy insights.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {policyInsights.map((insight, i) => (
                      <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-sm">
                            {i + 1}
                          </div>
                          <h3 className="font-bold text-white">{insight.title}</h3>
                        </div>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          {insight.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Strategic Alignment</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: "Kochi Water Metro", status: "In Progress", color: "text-emerald-400", bg: "bg-emerald-500/10" },
                      { name: "UMTA Kochi Act", status: "Enacted", color: "text-blue-400", bg: "bg-blue-500/10" },
                      { name: "Metro Phase 2 (Kakkanad)", status: "Planned", color: "text-amber-400", bg: "bg-amber-500/10" },
                      { name: "Rebuild Kerala Initiative", status: "Active", color: "text-indigo-400", bg: "bg-indigo-500/10" }
                    ].map((mission) => (
                      <div key={mission.name} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <span className="text-xs font-medium text-slate-300">{mission.name}</span>
                        <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", mission.bg, mission.color)}>{mission.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl">
                  <h4 className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest mb-2">Strategic Goal</h4>
                  <p className="text-white text-sm font-bold leading-relaxed">
                    "To achieve a minimum mobility score of 70% across all 74 wards by 2030 through targeted infrastructure investment."
                  </p>
                </div>
              </motion.div>
            )}

            {activeSection === 'methodology' && (
              <motion.div
                key="methodology"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <BookOpen className="text-indigo-500" size={20} />
                    Methodology
                  </h2>
                  <p className="text-slate-400 text-sm">
                    The observatory uses three composite indices to evaluate urban mobility at the ward level.
                  </p>
                </div>

                <div className="space-y-3">
                  {INDICATORS.map((indicator) => {
                    const data = METHODOLOGY_DATA[indicator.id];
                    const isExpanded = expandedMethodology === indicator.id;
                    const Icon = indicator.icon;

                    return (
                      <div 
                        key={indicator.id} 
                        className={cn(
                          "rounded-2xl transition-all duration-300 overflow-hidden border",
                          isExpanded ? "bg-white/5 border-white/10" : "bg-transparent border-white/5"
                        )}
                      >
                        <button
                          onClick={() => setExpandedMethodology(isExpanded ? null : indicator.id)}
                          className="w-full p-5 flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-white/5 text-slate-500" style={{ color: isExpanded ? indicator.color : undefined }}>
                              <Icon size={20} />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white">{indicator.label}</h3>
                              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{indicator.id.replace('_', ' ')}</p>
                            </div>
                          </div>
                          <ChevronDown 
                            size={16} 
                            className={cn("text-slate-600 transition-transform", isExpanded && "rotate-180")} 
                          />
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="px-5 pb-5 space-y-6"
                            >
                              <div className="h-px bg-white/5 w-full" />
                              
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Objective</h4>
                                <p className="text-slate-300 text-xs leading-relaxed">{data.objective}</p>
                              </div>

                              <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Variables</h4>
                                <ul className="grid grid-cols-1 gap-2">
                                  {data.variables.map((v, i) => (
                                    <li key={i} className="flex items-center gap-2 text-slate-400 text-xs p-2 bg-white/5 rounded-lg">
                                      <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                                      {v}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Interpretation</h4>
                                  <p className="text-slate-400 text-[10px] leading-relaxed">{data.interpretation}</p>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Policy Relevance</h4>
                                  <p className="text-slate-400 text-[10px] leading-relaxed">{data.policyRelevance}</p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">References</h4>
                                <div className="flex flex-wrap gap-2">
                                  {data.references.map((ref, i) => (
                                    <span key={i} className="px-2 py-1 bg-white/5 rounded text-[9px] font-mono text-slate-500 border border-white/10">
                                      {ref}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <BookOpen size={16} />
                    <h4 className="font-bold text-xs uppercase tracking-widest">Methodological Note</h4>
                  </div>
                  <p className="text-white text-xs leading-relaxed">
                    All indicators are normalized on a scale of 0-100, where 100 represents the optimal accessibility benchmark defined by international standards (e.g., 400m walking distance to transit). Data is updated quarterly using open-source spatial datasets and municipal records.
                  </p>
                </div>
              </motion.div>
            )}

            {activeSection === 'coverage' && (
              <motion.div
                key="coverage"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <Activity className="text-indigo-500" size={20} />
                    Data Coverage
                  </h2>
                  <p className="text-slate-400 text-sm">
                    Overview of data availability across Kochi's 74 wards.
                  </p>
                </div>

                <div className="space-y-4">
                  {coverageStats.map((stat) => (
                    <div key={stat.id} className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/5 text-indigo-400">
                            <stat.icon size={18} />
                          </div>
                          <h3 className="font-bold text-white text-sm">{stat.label}</h3>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded uppercase tracking-widest">
                          {stat.percentage.toFixed(0)}%
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>Wards with Data</span>
                          <span>{stat.withData} / 74</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${stat.percentage}%` }}
                            className="h-full bg-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Available</p>
                          <p className="text-xl font-bold text-emerald-400">{stat.withData}</p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Missing</p>
                          <p className="text-xl font-bold text-rose-400">{stat.withoutData}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {activeSection === 'limitations' && (
              <motion.div
                key="limitations"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-10"
              >
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-white leading-tight">
                      Data Sources, <span className="text-indigo-400">Assumptions</span> & Limitations
                    </h2>
                    
                    <p className="text-slate-400 text-[13px] leading-relaxed">
                      This dashboard evaluates spatial accessibility to urban transport infrastructure in Kochi using three primary indicators:
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {['Bus Stop Access Index', 'Walkability Index', 'Last Mile Connectivity Index'].map(tag => (
                        <span key={tag} className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-widest">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-10">
                      <section className="space-y-4">
                        <h3 className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                          <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                          1. Data Sources
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            { label: 'Kochi Ward Boundaries', desc: 'Administrative boundaries for spatial aggregation.' },
                            { label: 'OpenStreetMap Road Network', desc: 'Street-level connectivity and pedestrian paths.' },
                            { label: 'Public Transport Stop Data', desc: 'Locations of bus stops and transit nodes.' }
                          ].map(item => (
                            <div key={item.label} className="p-5 glass-panel rounded-2xl border border-white/5 group hover:border-indigo-500/30 transition-all">
                              <p className="text-xs font-bold text-white mb-1 tracking-tight">{item.label}</p>
                              <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                          <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                          2. Analytical Scope
                        </h3>
                        <div className="p-6 glass-panel rounded-2xl border border-white/5">
                          <p className="text-slate-400 text-[13px] leading-relaxed">
                            The analysis measures <span className="text-white font-medium">accessibility to mobility infrastructure</span> rather than complete mobility performance. It focuses on the physical availability and spatial distribution of assets.
                          </p>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                          <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                          3. Key Assumptions
                        </h3>
                        <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                          <p className="text-slate-300 text-[13px] leading-relaxed">
                            "Accessibility improves when infrastructure is physically closer to residents and better connected through a high-quality street network."
                          </p>
                        </div>
                      </section>

                      <section className="space-y-4">
                        <h3 className="text-[9px] font-mono font-medium text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                          <div className="w-1 h-1 bg-indigo-500 rounded-full" />
                          4. Limitations
                        </h3>
                        <div className="space-y-4">
                          <p className="text-slate-400 text-[13px] leading-relaxed">
                            While comprehensive, this spatial analysis has specific boundaries:
                          </p>
                          <ul className="grid grid-cols-2 gap-3">
                            {['Travel Time', 'Congestion', 'Transit Frequency', 'Demand Patterns'].map(limit => (
                              <li key={limit} className="flex items-center gap-3 text-[11px] font-mono text-slate-500 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="w-1 h-1 bg-slate-700 rounded-full" />
                                {limit}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-slate-600 mt-2">
                            * These factors are excluded to maintain a focus on long-term infrastructure planning.
                          </p>
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {activeSection === 'about' && (
              <motion.div
                key="about"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-10"
              >
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">
                      Kochi Accessibility Observatory
                    </h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      A data-driven platform for analyzing and improving urban mobility infrastructure in Kochi, Kerala.
                    </p>
                  </div>

                  <div className="space-y-8">
                    <section className="space-y-3">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Project Mission</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        The observatory aims to provide urban planners, researchers, and citizens with a transparent view of how accessible transport infrastructure is across different municipal wards.
                      </p>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Indicators Used</h3>
                      <div className="space-y-3">
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-xs font-bold text-white mb-1">Bus Stop Access</p>
                          <p className="text-[11px] text-slate-500">Measures spatial proximity to the bus network, considering stop density and service frequency.</p>
                        </div>
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-xs font-bold text-white mb-1">Walkability Index</p>
                          <p className="text-[11px] text-slate-500">Evaluates the quality of the pedestrian environment, including sidewalk availability and safety.</p>
                        </div>
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-xs font-bold text-white mb-1">Last Mile Connectivity</p>
                          <p className="text-[11px] text-slate-500">Assesses the ease of completing the final leg of a journey from major transit hubs.</p>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="pt-8 border-t border-white/5 space-y-8">
                    <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Developed By</h4>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                            PA
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Pranav Alok</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Sources</h4>
                        <div className="flex flex-wrap gap-2">
                          {['Field Survey', 'OpenStreetMap', 'Kochi Ward Boundaries'].map(source => (
                            <span key={source} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contact</h4>
                        <a 
                          href="mailto:pranavalok108@gmail.com" 
                          className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-xs font-bold"
                        >
                          pranavalok108@gmail.com
                          <ArrowUpRight size={14} />
                        </a>
                      </div>
                    </div>

                    <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        "This observatory is an ongoing urban analytics project aimed at improving the quality of life in Kochi through data-driven mobility planning."
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Map Area */}
      <main className="flex-1 relative bg-[#111]">
        <MapContainer 
          center={[9.98, 76.28]} 
          zoom={12} 
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <GeoJSON 
            key={`${selectedIndicator}-${selectedWard?.name}-${dataTimestamp}`}
            data={geoJsonData as any} 
            style={getStyle}
            onEachFeature={onEachFeature}
          />
          
          {/* Map Overlay UI */}
          <div className="absolute top-8 right-8 flex flex-col gap-4 z-[1000]">
            {loading && (
              <div className="bg-indigo-600 text-white px-4 py-2 rounded-full text-[10px] font-bold tracking-widest flex items-center gap-2 shadow-2xl">
                <Loader2 size={12} className="animate-spin" />
                SYNCHRONIZING REAL-TIME DATA
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="absolute bottom-8 right-8 bg-[#1a1a1a]/80 backdrop-blur-xl p-6 rounded-2xl shadow-2xl border border-white/5 z-[1000] min-w-[240px]">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">
              {INDICATORS.find(i => i.id === selectedIndicator)?.label}
            </h4>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-[#ffffd9] via-[#7fcdbb] to-[#081d58]" />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-slate-500">
              <span>LOW ACCESS</span>
              <span>HIGH ACCESS</span>
            </div>
          </div>

          {/* Hover Tooltip */}
          <AnimatePresence>
            {hoveredWard && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                style={{ 
                  position: 'fixed',
                  left: mousePos.x + 20,
                  top: mousePos.y + 20,
                  pointerEvents: 'none'
                }}
                className="bg-[#1a1a1a]/95 backdrop-blur-2xl text-white p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 z-[2000] min-w-[200px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">Ward Profile</span>
                  <div className="px-2 py-0.5 bg-indigo-500/20 rounded text-[9px] font-bold text-indigo-400 border border-indigo-500/20">
                    LIVE DATA
                  </div>
                </div>
                
                <h3 className="font-bold text-lg mb-4 leading-tight">{hoveredWard.name}</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]",
                        hoveredWard[selectedIndicator] !== null ? "bg-indigo-500" : "bg-slate-600"
                      )} />
                      <span className="text-xs text-slate-400">{INDICATORS.find(i => i.id === selectedIndicator)?.label}</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {hoveredWard[selectedIndicator] !== null 
                        ? `${(hoveredWard[selectedIndicator] * 100).toFixed(1)}%` 
                        : 'No Data'}
                    </span>
                  </div>
                  
                  {hoveredWard[selectedIndicator] !== null ? (
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${hoveredWard[selectedIndicator] * 100}%` }}
                        className="h-full bg-gradient-to-r from-indigo-600 to-violet-400"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-1 bg-white/10 rounded-full" />
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-slate-500 font-medium">Click to view diagnostics</span>
                  <ArrowUpRight size={12} className="text-slate-600" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </MapContainer>
      </main>
    </div>
  );
}
