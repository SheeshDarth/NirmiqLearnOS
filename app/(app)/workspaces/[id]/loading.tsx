/**
 * Loading skeleton for a workspace and its sub-tabs. Shown while the server
 * component fetches the workspace + its analysis artifacts, so navigating
 * between workspace tabs never flashes a blank pane.
 */
export default function WorkspaceLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-pulse">
      {/* Header: title + subtitle */}
      <div className="space-y-2">
        <div className="h-7 bg-zinc-800 rounded w-64" />
        <div className="h-3 bg-zinc-800 rounded w-80" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 bg-zinc-800 rounded-md w-24" />
        ))}
      </div>

      {/* Primary content card */}
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5 space-y-3">
        <div className="h-4 bg-zinc-800 rounded w-48" />
        <div className="h-3 bg-zinc-800 rounded w-full" />
        <div className="h-3 bg-zinc-800 rounded w-11/12" />
        <div className="h-3 bg-zinc-800 rounded w-3/4" />
      </div>

      {/* Secondary grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-[#0d1117] border border-zinc-800 rounded-lg p-4 space-y-2"
          >
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-6 bg-zinc-800 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
