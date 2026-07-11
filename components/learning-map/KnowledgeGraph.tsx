"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Crosshair, Network, Search, X } from "lucide-react";
import type {
  KnowledgeGraphData,
  GraphNode,
  GraphNodeType,
} from "@/lib/services/knowledge-graph.service";
import {
  buildAdjacency,
  endpointId,
  matchNodes,
  neighborhood,
} from "@/components/learning-map/graph-utils";

// Fallback colors when a node carries no explicit (layer) color
const TYPE_COLOR: Record<GraphNodeType, string> = {
  project: "#22d3ee",
  layer: "#38bdf8",
  module: "#a78bfa",
  concept: "#34d399",
  file: "#94a3b8",
};

const TYPE_LABEL: Record<GraphNodeType, string> = {
  project: "Project",
  layer: "Layer",
  module: "Module",
  concept: "Concept",
  file: "File",
};

const colorOf = (n: GraphNode) => n.color ?? TYPE_COLOR[n.type] ?? "#9ca3af";

/** Dim a hex color to a translucent rgba (used for non-neighbor fading). */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

// Runtime-enriched shapes the force libs add
type RNode = GraphNode & { x?: number; y?: number; z?: number };
type RLink = {
  kind?: "contains" | "imports" | "flow" | "cycle";
  source?: unknown;
  target?: unknown;
};

const LINK_STYLE = {
  flow: { color: "rgba(244,114,182,0.75)", width: 2.2, arrow: 4, particles: 4 },
  imports: { color: "rgba(148,163,184,0.30)", width: 1, arrow: 2.5, particles: 0 },
  contains: { color: "rgba(148,163,184,0.12)", width: 0.6, arrow: 0, particles: 0 },
  cycle: { color: "rgba(251,191,36,0.70)", width: 1.5, arrow: 2.5, particles: 0 },
} as const;
const linkStyle = (l: RLink) => LINK_STYLE[l.kind ?? "contains"];

interface ForceGraphInstance {
  width(w: number): ForceGraphInstance;
  height(h: number): ForceGraphInstance;
  backgroundColor(c: string): ForceGraphInstance;
  graphData(d: KnowledgeGraphData): ForceGraphInstance;
  nodeLabel(fn: (n: RNode) => string): ForceGraphInstance;
  nodeColor(fn: (n: RNode) => string): ForceGraphInstance;
  nodeVal(fn: (n: RNode) => number): ForceGraphInstance;
  nodeRelSize(n: number): ForceGraphInstance;
  nodeVisibility(fn: (n: RNode) => boolean): ForceGraphInstance;
  linkColor(fn: (l: RLink) => string): ForceGraphInstance;
  linkWidth(fn: (l: RLink) => number): ForceGraphInstance;
  linkVisibility(fn: (l: RLink) => boolean): ForceGraphInstance;
  linkDirectionalArrowLength(fn: (l: RLink) => number): ForceGraphInstance;
  linkDirectionalArrowRelPos(n: number): ForceGraphInstance;
  linkDirectionalParticles(fn: (l: RLink) => number): ForceGraphInstance;
  linkDirectionalParticleWidth(n: number): ForceGraphInstance;
  onNodeClick(fn: (n: RNode) => void): ForceGraphInstance;
  onNodeHover(fn: (n: RNode | null) => void): ForceGraphInstance;
  nodeCanvasObjectMode(fn: () => string): ForceGraphInstance;
  nodeCanvasObject(
    fn: (n: RNode, ctx: CanvasRenderingContext2D, scale: number) => void
  ): ForceGraphInstance;
  // 2D-only camera controls
  centerAt?(x: number, y: number, ms?: number): ForceGraphInstance;
  zoom?(k: number, ms?: number): ForceGraphInstance;
  // 3D-only camera control
  cameraPosition?(
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number
  ): ForceGraphInstance;
  // Physics (both libs expose the d3 simulation forces)
  d3Force?(name: string): { strength?: (n: number) => void } | undefined;
  d3ReheatSimulation?(): ForceGraphInstance;
  _destructor(): void;
}

type ForceGraphCtor = new (el: HTMLElement) => ForceGraphInstance;

/** Center the camera on a node (2D pan+zoom, 3D dolly). */
function focusNode(g: ForceGraphInstance, n: RNode, mode: "2d" | "3d") {
  if (mode === "2d" && g.centerAt && g.zoom) {
    if (n.x !== undefined && n.y !== undefined) {
      g.centerAt(n.x, n.y, 600);
      g.zoom(2.2, 600);
    }
  } else if (mode === "3d" && g.cameraPosition) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const z = n.z ?? 0;
    const dist = Math.hypot(x, y, z) || 1;
    const ratio = 1 + 80 / dist;
    g.cameraPosition(
      { x: x * ratio, y: y * ratio, z: z * ratio },
      { x, y, z },
      1000
    );
  }
}

export default function KnowledgeGraph({ data }: { data: KnowledgeGraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ForceGraphInstance | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchCount, setSearchCount] = useState<number | null>(null);
  const [hiddenColors, setHiddenColors] = useState<Set<string>>(new Set());
  const [egoDepth, setEgoDepth] = useState<0 | 1 | 2>(0);
  const [physics, setPhysics] = useState<"tight" | "default" | "spread">("default");

  // Interaction state read by the paint accessors (refs — no re-init on change)
  const hoverSetRef = useRef<Set<string> | null>(null);
  const searchSetRef = useRef<Set<string> | null>(null);
  const runtimeNodesRef = useRef<RNode[]>([]);
  const nodeByIdRef = useRef<Map<string, RNode>>(new Map());
  const repaintRef = useRef<(() => void) | null>(null);

  // Undirected adjacency over the ORIGINAL (string-id) links
  const adjacency = useMemo(() => buildAdjacency(data.links), [data]);

  // Legend: layer nodes (with their colors) + edge kinds present
  const legend = useMemo(() => {
    const layers = new Map<string, string>();
    for (const n of data.nodes) {
      if (n.type === "layer") layers.set(n.label, colorOf(n));
    }
    // Fallback graph (no layers): show node types instead
    if (layers.size === 0) {
      for (const n of data.nodes) layers.set(TYPE_LABEL[n.type], colorOf(n));
    }
    const kinds = new Set((data.links as RLink[]).map((l) => l.kind ?? "contains"));
    return {
      layers: [...layers.entries()],
      hasFlow: kinds.has("flow"),
      hasImports: kinds.has("imports"),
      hasCycle: kinds.has("cycle"),
    };
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return;

    const destroy = () => {
      if (instanceRef.current) {
        try {
          instanceRef.current._destructor();
        } catch {
          /* noop */
        }
        instanceRef.current = null;
      }
      el.innerHTML = "";
    };

    async function init() {
      setLoading(true);
      destroy();
      hoverSetRef.current = null;

      const width = el!.clientWidth || 640;
      const height = 520;
      const graphData: KnowledgeGraphData = {
        nodes: data.nodes.map((n) => ({ ...n })),
        links: data.links.map((l) => ({ ...l })),
      };
      runtimeNodesRef.current = graphData.nodes as RNode[];
      nodeByIdRef.current = new Map(
        (graphData.nodes as RNode[]).map((n) => [n.id, n])
      );

      const mod =
        mode === "3d" ? await import("3d-force-graph") : await import("force-graph");
      if (cancelled) return;

      // Dim everything outside the hover-neighborhood (or search matches)
      const nodeColorFn = (n: RNode): string => {
        const hover = hoverSetRef.current;
        if (hover) return hover.has(n.id) ? colorOf(n) : withAlpha(colorOf(n), 0.12);
        const srch = searchSetRef.current;
        if (srch && srch.size > 0 && !srch.has(n.id)) {
          return withAlpha(colorOf(n), 0.12);
        }
        return colorOf(n);
      };
      const linkColorFn = (l: RLink): string => {
        const hover = hoverSetRef.current;
        if (hover) {
          const s = endpointId(l.source);
          const t = endpointId(l.target);
          if (!hover.has(s) || !hover.has(t)) return "rgba(148,163,184,0.04)";
        }
        return linkStyle(l).color;
      };

      const Ctor = (mod.default ?? mod) as unknown as ForceGraphCtor;
      const g = new Ctor(el!)
        .width(width)
        .height(height)
        .backgroundColor("#0a0c10")
        .graphData(graphData)
        .nodeLabel((n) => `${n.label} · ${TYPE_LABEL[n.type]}`)
        .nodeColor(nodeColorFn)
        .nodeVal((n) => n.val)
        .nodeRelSize(4)
        .linkColor(linkColorFn)
        .linkWidth((l) => linkStyle(l).width)
        .linkDirectionalArrowLength((l) => linkStyle(l).arrow)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles((l) => linkStyle(l).particles)
        .linkDirectionalParticleWidth(2)
        .onNodeHover((n) => {
          hoverSetRef.current = n ? neighborhood(adjacency, n.id, 1) : null;
          // Re-assigning the accessors forces both libs to re-evaluate colors
          g.nodeColor(nodeColorFn).linkColor(linkColorFn);
        })
        .onNodeClick((n) => {
          setSelected({
            id: n.id,
            label: n.label,
            type: n.type,
            val: n.val,
            color: n.color,
            summary: n.summary,
          });
          focusNode(g, n, mode);
        });

      repaintRef.current = () => {
        g.nodeColor(nodeColorFn).linkColor(linkColorFn);
      };

      // 2D: always-label project + layers; label files/concepts only when zoomed in
      if (mode === "2d") {
        g.nodeCanvasObjectMode(() => "after").nodeCanvasObject((n, ctx, scale) => {
          if (n.x === undefined || n.y === undefined) return;
          const important = n.type === "project" || n.type === "layer";
          if (!important && scale < 1.6) return;
          const fontSize = important ? Math.max(13 / scale, 2) : Math.max(10 / scale, 1.5);
          ctx.font = `${important ? 600 : 400} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = important ? "rgba(244,244,245,0.95)" : "rgba(212,212,216,0.8)";
          const r = Math.sqrt(Math.max(n.val, 1)) * 4;
          ctx.fillText(n.label, n.x, n.y + r + 1.5);
        });
      }

      instanceRef.current = g;
      setLoading(false);
    }

    init();

    const onResize = () => {
      if (instanceRef.current && el) instanceRef.current.width(el.clientWidth);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      repaintRef.current = null;
      destroy();
    };
  }, [data, mode, adjacency]);

  // Search: debounce, highlight matches, report count
  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim();
      if (!q) {
        searchSetRef.current = null;
        setSearchCount(null);
      } else {
        const matches = matchNodes(data.nodes, q);
        searchSetRef.current = new Set(matches.map((m) => m.id));
        setSearchCount(matches.length);
      }
      repaintRef.current?.();
    }, 200);
    return () => clearTimeout(t);
  }, [search, data]);

  // Visibility: interactive legend (hidden groups) + ego/local view
  useEffect(() => {
    const g = instanceRef.current;
    if (!g || loading) return;
    const ego =
      selected && egoDepth > 0
        ? neighborhood(adjacency, selected.id, egoDepth)
        : null;
    const nodeVisible = (n: RNode): boolean => {
      if (n.type !== "project" && hiddenColors.has(colorOf(n))) return false;
      if (ego && !ego.has(n.id)) return false;
      return true;
    };
    g.nodeVisibility(nodeVisible);
    g.linkVisibility((l) => {
      const s = nodeByIdRef.current.get(endpointId(l.source));
      const t = nodeByIdRef.current.get(endpointId(l.target));
      return !!s && !!t && nodeVisible(s) && nodeVisible(t);
    });
  }, [hiddenColors, egoDepth, selected, loading, adjacency]);

  // Physics presets: charge strength
  useEffect(() => {
    const g = instanceRef.current;
    if (!g || loading || !g.d3Force) return;
    const strength = physics === "tight" ? -30 : physics === "spread" ? -120 : -60;
    g.d3Force("charge")?.strength?.(strength);
    g.d3ReheatSimulation?.();
  }, [physics, loading]);

  const focusFirstMatch = () => {
    const g = instanceRef.current;
    const q = search.trim();
    if (!g || !q) return;
    const matches = matchNodes(data.nodes, q);
    if (matches.length === 0) return;
    const node = runtimeNodesRef.current.find((n) => n.id === matches[0].id);
    if (node) focusNode(g, node, mode);
  };

  const toggleGroup = (color: string) => {
    setHiddenColors((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  };

  const isEmpty = data.nodes.length <= 1;
  if (isEmpty) {
    return (
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-6 text-center">
        <Network size={18} className="text-zinc-600 mx-auto mb-2" />
        <p className="text-xs text-zinc-500">
          The architecture graph appears once this workspace has been analyzed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          <Network size={14} className="text-cyan-400" />
          <span className="text-sm font-medium text-zinc-200">
            Architecture &amp; Workflow Map
          </span>
          {loading && <span className="text-xs text-zinc-600 animate-pulse">rendering…</span>}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1">
          <Search size={11} className="text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") focusFirstMatch();
              if (e.key === "Escape") setSearch("");
            }}
            placeholder="Search nodes…"
            className="bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none w-32"
          />
          {searchCount !== null && (
            <span className="text-[10px] text-zinc-500 tabular-nums">{searchCount}</span>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-zinc-600 hover:text-zinc-300"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Ego / local view (needs a selected node) */}
        <div
          className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800"
          title={selected ? `Local view around “${selected.label}”` : "Click a node first"}
        >
          <Crosshair size={11} className={selected ? "text-zinc-400 ml-1" : "text-zinc-700 ml-1"} />
          {([0, 1, 2] as const).map((d) => (
            <button
              key={d}
              type="button"
              disabled={!selected && d > 0}
              onClick={() => setEgoDepth(d)}
              className={`text-xs px-1.5 py-1 rounded transition-colors disabled:opacity-40 ${
                egoDepth === d
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {d === 0 ? "All" : `${d}°`}
            </button>
          ))}
        </div>

        {/* Physics preset */}
        <select
          value={physics}
          onChange={(e) => setPhysics(e.target.value as typeof physics)}
          className="bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-400 px-2 py-1.5 outline-none"
          title="Layout spread"
        >
          <option value="tight">Tight</option>
          <option value="default">Default</option>
          <option value="spread">Spread</option>
        </select>

        {/* 2D / 3D */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
          <button
            type="button"
            onClick={() => setMode("2d")}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              mode === "2d" ? "bg-cyan-500/15 text-cyan-300" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Network size={11} /> 2D
          </button>
          <button
            type="button"
            onClick={() => setMode("3d")}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              mode === "3d" ? "bg-violet-500/15 text-violet-300" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Box size={11} /> 3D
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative">
        <div ref={containerRef} style={{ height: 520 }} className="w-full" />

        {selected && (
          <div className="absolute top-3 left-3 max-w-xs bg-zinc-950/95 border border-zinc-700 rounded-lg p-3 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: colorOf(selected) }}
                />
                <span className="text-xs font-semibold text-zinc-100">{selected.label}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setEgoDepth(0);
                }}
                className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
              {TYPE_LABEL[selected.type]}
            </p>
            {selected.summary && (
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line max-h-44 overflow-y-auto font-mono">
                {selected.summary}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend — interactive: click a group to hide/show it */}
      <div className="flex items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t border-zinc-800 flex-wrap">
        {legend.layers.map(([label, color]) => {
          const hidden = hiddenColors.has(color);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleGroup(color)}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${
                hidden ? "text-zinc-700 opacity-50 line-through" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={hidden ? `Show ${label}` : `Hide ${label}`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </button>
          );
        })}
        <span className="w-px h-3 bg-zinc-800 mx-1" />
        {legend.hasImports && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-4 h-px bg-slate-400/50" /> imports
          </span>
        )}
        {legend.hasFlow && (
          <span className="flex items-center gap-1.5 text-xs text-pink-400/80">
            <span className="w-4 h-px bg-pink-400/70" /> workflow →
          </span>
        )}
        {legend.hasCycle && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <span className="w-4 h-px bg-amber-400/70" /> circular import
          </span>
        )}
        <span className="text-xs text-zinc-700 ml-auto">
          hover to highlight · click to focus · legend toggles groups
        </span>
      </div>
    </div>
  );
}
