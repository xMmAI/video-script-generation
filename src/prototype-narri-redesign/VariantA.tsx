// PROTOTYPE — Variant A. Throwaway. Delete this folder when a variant is chosen.
// Layout: "Cozy Studio" — warm cream background, sticky navy header with logo + wordmark, gold CTAs.
// Logo sits top-left, very readable. Clean list dashboard.

'use client';

const MOCK_JOBS = [
  { id: '1', title: 'Onboarding Flow v3.mov', status: 'review', created_at: '2026-05-30T10:00:00Z' },
  { id: '2', title: 'Feature Demo - Search.mp4', status: 'done', created_at: '2026-05-29T14:22:00Z' },
  { id: '3', title: 'Bug Repro Screen.mov', status: 'pending', created_at: '2026-05-28T09:11:00Z' },
  { id: '4', title: 'Release Notes Walkthrough.mp4', status: 'failed', created_at: '2026-05-27T16:45:00Z' },
];

const STATUS_CFG: Record<string, { bg: string; text: string; dot: string }> = {
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  review:      { bg: 'bg-pink-50',    text: 'text-pink-700',    dot: 'bg-pink-400' },
  done:        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rendered:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed:      { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-400' },
  transcribing:{ bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

export function VariantA() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#faf8f2' }}>

      {/* Sticky nav */}
      <header className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: '#1a1f5e' }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img src="/cat-white.png" alt="" className="h-10 w-10 object-contain" />
            <div className="leading-tight">
              <p className="text-lg font-bold text-white">Narri</p>
              <p className="text-xs font-medium" style={{ color: '#e8a020' }}>Script &amp; Audio Generator</p>
            </div>
          </div>
          <button className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: '#e8a020' }}>
            + Upload
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">

        {/* Drop zone */}
        <div className="mb-8 rounded-2xl border-2 border-dashed p-10 text-center" style={{ borderColor: '#c8b89a', backgroundColor: '#f0ebdf' }}>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#1a1f5e' }}>
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="font-semibold" style={{ color: '#1a1f5e' }}>Drop a .MOV or .MP4 here</p>
          <p className="mt-1 text-sm" style={{ color: '#7a6e5e' }}>or click to choose a file</p>
          <button className="mt-4 rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ backgroundColor: '#1a1f5e' }}>
            Choose file
          </button>
        </div>

        {/* Jobs header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#1a1f5e' }}>Your videos</h2>
          <button className="text-xs underline" style={{ color: '#7a6e5e' }}>Scan for new files</button>
        </div>

        {/* Job rows */}
        <div className="space-y-2">
          {MOCK_JOBS.map((job) => (
            <div key={job.id} className="flex items-center justify-between rounded-xl border bg-white px-5 py-4 shadow-sm" style={{ borderColor: '#e8e0d0' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: '#f0ebdf' }}>
                  <svg className="h-4 w-4" style={{ color: '#1a1f5e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: '#1a1f5e' }}>{job.title}</p>
                  <p className="text-xs" style={{ color: '#9a8e7e' }}>{new Date(job.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 ml-4">
                <StatusBadge status={job.status} />
                <button className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: '#1a1f5e', color: '#1a1f5e' }}>
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