"use client";

interface TopbarProps {
  activeWorkspace?: string | null;
}

export default function Topbar({ activeWorkspace }: TopbarProps) {
  return (
    <header className="h-12 bg-[#0d1117] border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0">
      {/* Active workspace indicator */}
      <div className="flex items-center gap-2 flex-1">
        {activeWorkspace ? (
          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
            {activeWorkspace}
          </span>
        ) : (
          <span className="text-xs text-zinc-600 font-mono">
            no active workspace
          </span>
        )}
      </div>
    </header>
  );
}
