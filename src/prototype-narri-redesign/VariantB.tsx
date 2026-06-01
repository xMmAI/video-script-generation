// PROTOTYPE — Variant B. Throwaway. Delete this folder when a variant is chosen.
// Layout: "Dark Navy Studio" — full dark navy background throughout, gold + pink accents.
// Cinematic feel. Logo in sidebar-style left column. Job cards in right main area.

'use client';

const MOCK_JOBS = [
  { id: '1', title: 'Onboarding Flow v3.mov', status: 'review', created_at: '2026-05-30T10:00:00Z', segments: 12 },
  { id: '2', title: 'Feature Demo - Search.mp4', status: 'done', created_at: '2026-05-29T14:22:00Z', segments: 8 },
  { id: '3', title: 'Bug Repro Screen.mov', status: 'pending', created_at: '2026-05-28T09:11:00Z', segments: 0 },
  { id: '4', title: 'Release Notes Walkthrough.mp4', status: 'failed', created_at: '2026-05-27T16:45:00Z', segments: 5 },
];

const STATUS_DOT: Record<string, string> = {
  pending: '#e8a020', review: '#e87fa0', done: '#4ade80',
  rendered: '#4ade80', failed: '#f87171', transcribing: '#60a5fa',
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_DOT[status] ?? '#9ca3af';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}22`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

export function VariantB() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#0d1035', fontFamily: 'var(--font-geist-sans, system-ui)' }}>

      {/* Left sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r px-6 py-8" style={{ borderColor: '#2a2f6e', backgroundColor: '#111540' }}>
        <div className="flex flex-col items-center text-center">
          <img src="/cat-white.png" alt="Narri" className="h-24 w-24 object-contain drop-shadow-lg" />
          <h1 className="mt-3 text-2xl font-bold text-white">Narri</h1>
          <p className="mt-0.5 text-xs font-medium" style={{ color: '#e8a020' }}>Script &amp; Audio Generator</p>
        </div>

        <div className="mt-10 space-y-1">
          {[
            { label: 'Dashboard', active: true },
            { label: 'All Jobs', active: false },
            { label: 'Settings', active: false },
          ].map((item) => (
            <button
              key={item.label}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition"
              style={item.active
                ? { backgroundColor: '#e8a02022', color: '#e8a020' }
                : { color: '#8890c0' }
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-auto">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
            style={{ backgroundColor: '#e8a020', color: '#0d1035' }}
          >
            <span>+</span> Upload video
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-8">

        {/* Page heading */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Dashboard</h2>
            <p className="text-sm" style={{ color: '#8890c0' }}>Your recent video projects</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border px-4 py-2 text-sm text-white" style={{ borderColor: '#2a2f6e' }}>
              Scan files
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: 'Total Jobs', value: '4' },
            { label: 'In Review', value: '1', accent: '#e87fa0' },
            { label: 'Completed', value: '1', accent: '#4ade80' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl p-4" style={{ backgroundColor: '#1a1f5e' }}>
              <p className="text-2xl font-bold" style={{ color: stat.accent ?? 'white' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: '#8890c0' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Drop zone */}
        <div className="mb-6 rounded-xl border-2 border-dashed p-8 text-center" style={{ borderColor: '#2a2f6e' }}>
          <p className="text-sm text-white">Drop a .MOV or .MP4 here</p>
          <p className="mt-1 text-xs" style={{ color: '#8890c0' }}>or click to choose</p>
          <button className="mt-3 rounded-lg px-4 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#1a1f5e', color: '#e8a020', border: '1px solid #e8a020' }}>
            Choose file
          </button>
        </div>

        {/* Job cards */}
        <div className="space-y-3">
          {MOCK_JOBS.map((job) => (
            <div key={job.id} className="flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: '#1a1f5e' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: '#0d1035' }}>
                  <svg className="h-5 w-5" style={{ color: '#e8a020' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{job.title}</p>
                  <p className="text-xs" style={{ color: '#8890c0' }}>
                    {new Date(job.created_at).toLocaleDateString()}
                    {job.segments > 0 && ` · ${job.segments} segments`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 ml-4">
                <StatusPill status={job.status} />
                <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: '#0d1035' }}>
                  View →
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}