/**
 * Always-on notice. The brief for this project requires that the simulated
 * nature of the app is visible on every screen, so this sits above the header
 * rather than inside a dismissible toast.
 */
export function DemoBanner() {
  return (
    <div role="note" className="border-b border-warning/30 bg-warning/10 text-warning">
      <p className="mx-auto max-w-[1400px] px-4 py-2 text-center text-xs font-medium sm:text-sm">
        <span aria-hidden="true" className="mr-1.5">&#9888;</span>
        Portfolio Demo &mdash; Simulated data only. Not connected to any real system.
      </p>
    </div>
  );
}
