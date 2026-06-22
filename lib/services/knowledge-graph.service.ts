/**
 * NirmiqLearn OS — Knowledge Graph Builder
 *
 * Pure function (no DB, no client libs) that turns a workspace's learning map
 * + concept links into a node/edge graph for the interactive visualization.
 * Runs on the server inside the learning-map page; the resulting plain object
 * is passed to the client <KnowledgeGraph> component.
 */

import type { LearningMap } from "@/lib/services/learning-map.service";

export type GraphNodeType = "project" | "layer" | "module" | "concept" | "file";

export type GraphLinkKind = "contains" | "imports" | "flow" | "cycle";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  val: number; // relative size
  summary?: string; // shown when the node is clicked
  color?: string; // explicit color (e.g. by architecture layer)
}

export interface GraphLink {
  source: string;
  target: string;
  kind?: GraphLinkKind;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  readingOrder?: string[];   // topologically sorted file paths
  cycles?: string[][];       // each sub-array = one detected import cycle
  stats?: {
    fileCount: number;
    importEdgeCount: number;
    hubFiles: string[];
  };
}

interface ConceptLinkLike {
  conceptName: string;
  conceptType?: string | null;
  explanation?: string | null;
  projectFeature?: string | null;
}

export function buildKnowledgeGraph(
  projectTitle: string,
  map: LearningMap | null,
  conceptLinks: ConceptLinkLike[]
): KnowledgeGraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();

  const addNode = (n: GraphNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  const ROOT = "project";
  addNode({
    id: ROOT,
    label: projectTitle,
    type: "project",
    val: 14,
    summary: map?.summary ?? undefined,
  });

  if (map) {
    for (const m of map.modules) {
      const mid = `mod:${m.id}`;
      addNode({ id: mid, label: m.title, type: "module", val: 8, summary: m.summary });
      links.push({ source: ROOT, target: mid });

      for (const c of m.concepts) {
        const cid = `concept:${c.toLowerCase()}`;
        addNode({ id: cid, label: c, type: "concept", val: 4 });
        links.push({ source: mid, target: cid });
      }
      for (const f of m.files) {
        const fid = `file:${f.toLowerCase()}`;
        addNode({ id: fid, label: f, type: "file", val: 3 });
        links.push({ source: mid, target: fid });
      }
    }
  }

  // DSA concept links → concept nodes (deduped with module concepts by name)
  for (const cl of conceptLinks) {
    const cid = `concept:${cl.conceptName.toLowerCase()}`;
    const summary =
      [cl.projectFeature, cl.explanation].filter(Boolean).join(" — ") || undefined;
    if (seen.has(cid)) {
      const existing = nodes.find((n) => n.id === cid);
      if (existing && !existing.summary && summary) existing.summary = summary;
    } else {
      addNode({ id: cid, label: cl.conceptName, type: "concept", val: 4, summary });
    }
    links.push({ source: ROOT, target: cid });
  }

  return { nodes, links };
}
