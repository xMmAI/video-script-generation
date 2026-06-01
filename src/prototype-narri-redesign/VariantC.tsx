// PROTOTYPE — Variant C. Throwaway. Delete this folder when a variant is chosen.
// Layout: "Branded Hero" — large navy gradient hero banner with logo + tagline centered,
// then warm cream job grid below. Most editorial / product-y of the three.

'use client';

const MOCK_JOBS = [
  { id: '1', title: 'Onboarding Flow v3.mov', status: 'review', created_at: '2026-05-30T10:00:00Z' },
  { id: '2', title: 'Feature Demo - Search.mp4', status: 'done', created_at: '2026-05-29T14:22:00Z' },
  { id: '3', title: 'Bug Repro Screen.mov', status: 'pending', created_at: '2026-05-28T09:11:00Z' },
  { id: '4', title: 'Release Notes Walkthrough.mp4', status: 'failed', created_at: '2026-05-27T16:45:00Z' },
];

const STATUS_CFG: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#fef3c7', text: '#92400e' },
  review:      { bg: '#fce7f3', text: '#9d174d' },
  done:        { bg: '#d1fae5', text: '#065f46' },
  rendered:    { bg: '#d1fae5', text: '#065f46' },
  failed:      { bg: '#fee2e2', text: '#991b1b' },
  transcribing:{ bg: '#dbeafe', text: '#1e40af' },
};

function Chip({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

export function VariantC() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#faf8f2', fontFamily: 'var(--font-geist-sans, system-ui)' }}>

      {/* Hero banner */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0d1035 0%, #1a1f6e 60%, #2a1f5e 100%)' }}
      >
        {/* Decorative stars */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              backgroundColor: i % 4 === 0 ? '#e87fa0' : '#e8a020',
              opacity: 0.4 + (i % 3) * 0.2,
              top: `${10 + (i * 37) % 80}%`,
              left: `${5 + (i * 61) % 90}%`,
            }}
          />
        ))}

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 py-14 text-center">
          <img src="/cat-white.png" alt="Narri" className="h-28 w-28 object-contain drop-shadow-2xl" />
          <h1 className="mt-4 text-4xl font-bold text-white">Narri</h1>
          <p className="mt-2 text-base" style={{ color: '#e8a020' }}>
            Turn silent screen recordings into narrated videos
          </p>

          {/* Upload CTA */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              className="rounded-xl px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
              style={{ backgroundColor: '#e87fa0' }}
            >
              + Upload a video
            </button>
            <p className="text-xs" style={{ color: '#8890c0' }}>or drop a .MOV / .MP4 anywhere</p>
          </div>
        </div>
      </div>

      {/* Content area */}
      <main className="mx-auto max-w-4xl px-6 py-8">

        {/* Drop zone (secondary, after hero CTA) */}
        <div className="mb-8 rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: '#c8b89a', backgroundColor: '#f0ebdf' }}>
          <p className="text-sm font-medium" style={{ color: '#1a1f5e' }}>Or drag &amp; drop a video here</p>
          <p className="mt-0.5 text-xs" style={{ color: '#9a8e7e' }}>.MOV or .MP4 files accepted</p>
        </div>

        {/* Jobs section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: '#1a1f5e' }}>Recent projects</h2>
          <button className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: '#c8b89a', color: '#7a6e5e' }}>
            Scan files
          </button>
        </div>

        {/* 2-column grid of job cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MOCK_JOBS.map((job) => (
            <div
              key={job.id}
              className="flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md"
              style={{ borderColor: '#e8e0d0' }}
            >
              {/* Thumbnail placeholder */}
              <div className="mb-4 flex h-24 w-full items-center justify-center rounded-xl" style={{ backgroundColor: '#f0ebdf' }}>
                <svg className="h-8 w-8" style={{ color: '#1a1f5e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z" />
                </svg>
              </div>
              <p className="flex-1 truncate text-sm font-semibold" style={{ color: '#1a1f5e' }}>{job.title}</p>
              <p className="mt-0.5 text-xs" style={{ color: '#9a8e7e' }}>{new Date(job.created_at).toLocaleDateString()}</p>
              <div className="mt-3 flex items-center justify-between">
                <Chip status={job.status} />
                <button className="text-xs font-medium underline" style={{ color: '#1a1f5e' }}>View →</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}