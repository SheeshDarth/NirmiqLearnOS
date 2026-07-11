/**
 * Pure graph helpers for the interactive knowledge graph.
 * No DOM, no "use client" — safe to unit-test under node:test.
 */

import type { GraphNode } from "@/lib/services/knowledge-graph.service";

/** force-graph mutates link endpoints from string ids into node objects. */
export function endpointId(endpoint: unknown): string {
  if (typeof endpoint === "string") return endpoint;
  if (endpoint && typeof endpoint === "object" && "id" in endpoint) {
    return String((endpoint as { id: unknown }).id);
  }
  return "";
}

export type Adjacency = Map<string, Set<string>>;

export function buildAdjacency(
  links: Array<{ source: unknown; target: unknown }>
): Adjacency {
  const adj: Adjacency = new Map();
  const add = (a: string, b: string) => {
    if (!a || !b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const l of links) {
    const s = endpointId(l.source);
    const t = endpointId(l.target);
    add(s, t);
    add(t, s);
  }
  return adj;
}

/** BFS neighborhood of rootId up to `depth` hops — includes the root itself. */
export function neighborhood(
  adj: Adjacency,
  rootId: string,
  depth: number
): Set<string> {
  const visible = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!visible.has(nb)) {
          visible.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return visible;
}

/** Case-insensitive substring match on node label or id. */
export function matchNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return nodes.filter(
    (n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
  );
}
