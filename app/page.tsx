export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-cover px-6 py-10 text-bg">
        <p className="font-display text-lg italic text-bg/90">Pejastip Handal</p>
        <p className="mt-6 text-sm text-bg/70">Scaffold siap</p>
      </div>
      <div className="flex-1 bg-bg px-6 py-10 text-ink">
        <p className="max-w-prose text-sm text-ink-muted">
          Halaman ini akan diisi sesuai <code>docs/02-pages.md</code> (Home) pada
          milestone berikutnya — lihat <code>README.md</code> §Rencana eksekusi.
        </p>
      </div>
    </div>
  );
}
