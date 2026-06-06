import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Local storage, export options, and preferences.
        </p>
      </div>

      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {/* Storage */}
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">Storage Location</p>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              data/nirmiqlearn.db
            </p>
          </div>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
            local
          </span>
        </div>

        {/* Export */}
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">Export Format</p>
            <p className="text-xs text-zinc-500 mt-0.5">Markdown — use the Export button on any workspace</p>
          </div>
          <span className="text-xs text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">
            available
          </span>
        </div>

        {/* AI Provider */}
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">AI Provider</p>
            <p className="text-xs text-zinc-500 mt-0.5">Local LLM support — planned for later phases</p>
          </div>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
            coming soon
          </span>
        </div>

        {/* Theme */}
        <div className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">Theme</p>
            <p className="text-xs text-zinc-500 mt-0.5">Nirmiq Cognitive Graph — dark mode</p>
          </div>
          <Settings size={14} className="text-zinc-600" />
        </div>
      </div>
    </div>
  );
}
