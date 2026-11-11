import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link href="/" className="underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
