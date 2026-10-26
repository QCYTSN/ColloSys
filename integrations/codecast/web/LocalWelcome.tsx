import Link from 'next/link';
import { Button } from '../components/ui/button';
export function LocalWelcome() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 text-sol-text">
      <h2 className="text-lg font-medium">Your team's work, in one place</h2>
      <p className="text-sm text-sol-text-muted">Open a project to connect your local directory.</p>
      <Button asChild>
        <Link href="/projects">Open projects</Link>
      </Button>
    </div>
  );
}
