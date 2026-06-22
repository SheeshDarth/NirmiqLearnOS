"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Network, X } from "lucide-react";
import type {
  KnowledgeGraphData,
  GraphNode,
  GraphNodeType,
} from "@/lib/services/knowledge-graph.service";

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

// Runtime-enriched shapes the force libs add
type RNode = GraphNode & { x?: number; y?: number };
type RLink = { kind?: "contains" | "imports" | "flow" | "cycle" };

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
  linkColor(fn: (l: RLink) => string): ForceGraphInstance;
  linkWidth(fn: (l: RLink) => number): ForceGraphInstance;
  linkDirectionalArrowLength(fn: (l: RLink) => number): ForceGraphInstance;
  linkDirectionalArrowRelPos(n: number): ForceGraphInstance;
  linkDirectionalParticles(fn: (l: RLink) => number): ForceGraphInstance;
  linkDirectionalParticleWidth(n: number): ForceGraphInstance;
  onNodeClick(fn: (n: RNode) => void): ForceGraphInstance;
  nodeCanvasObjectMode(fn: () => string): ForceGraphInstance;
  nodeCanvasObject(
    fn: (n: RNode, ctx: CanvasRenderingContext2D, scale: number) => void
  ): ForceGraphInstance;
  _destructor(): void;
}

type ForceGraphCtor = new (el: HTMLElement) => ForceGraphInstance;

export default function KnowledgeGraph({ data }: { data: KnowledgeGraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ForceGraphInstance | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);

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
    return { layers: [...layers.entries()], hasFlow: kinds.has("flow"), hasImports: kinds.has("imports"), hasCycle: kinds.has("cycle") };
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

      const width = el!.clientWidth || 640;
      const height = 520;
      const graphData: KnowledgeGraphData = {
        nodes: data.nodes.map((n) => ({ ...n })),
        links: data.links.map((l) => ({ ...l })),
      };

      const mod =
        mode === "3d" ? await import("3d-force-graph") : await import("force-graph");
      if (cancelled) return;

      const Ctor = (mod.default ?? mod) as unknown as ForceGraphCtor;
      const g = new Ctor(el!)
        .width(width)
        .height(height)
        .backgroundColor("#0a0c10")
        .graphData(graphData)
        .nodeLabel((n) => `${n.label} · ${TYPE_LABEL[n.type]}`)
        .nodeColor(colorOf)
        .nodeVal((n) => n.val)
        .nodeRelSize(4)
        .linkColor((l) => linkStyle(l).color)
        .linkWidth((l) => linkStyle(l).width)
        .linkDirectionalArrowLength((l) => linkStyle(l).arrow)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles((l) => linkStyle(l).particles)
        .linkDirectionalParticleWidth(2)
        .onNodeClick((n) =>
          setSelected({
            id: n.id,
            label: n.label,
            type: n.type,
            val: n.val,
            color: n.color,
            summary: n.summary,
          })
        );

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
      destroy();
    };
  }, [data, mode]);

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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-cyan-400" />
          <span className="text-sm font-medium text-zinc-200">
            Architecture &amp; Workflow Map
          </span>
          {loading && <span className="text-xs text-zinc-600 animate-pulse">rendering…</span>}
        </div>
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
                onClick={() => setSelected(null)}
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

      {/* Legend */}
      <div className="flex items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-zinc-800 flex-wrap">
        {legend.layers.map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
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
          drag · scroll to zoom · click a node
        </span>
      </div>
    </div>
  );
}
