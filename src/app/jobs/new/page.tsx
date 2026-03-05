import Link from 'next/link';

export default function NewJobPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">New Job</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Drop .MOV files into the <code className="rounded bg-muted px-1">/input</code> folder, then use
        &quot;Scan for new videos&quot; on the dashboard.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
        ← Back to dashboard
      </Link>
    </main>
  );
}
