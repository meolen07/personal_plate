import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CamlsLogo } from "./CamlsLogo";
import { Button } from "./Button";
import { SignOutButton } from "./SignOutButton";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/fridge", label: "Fridge" },
  { href: "/recommend", label: "Recommend" },
  { href: "/history", label: "History" },
];

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bg-usf-green text-white shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href={user ? "/dashboard" : "/"}
          className="group flex items-center gap-3"
        >
          <CamlsLogo height={30} pill className="hidden shrink-0 sm:block" />
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              PersonalPlate
            </h1>
            <p className="text-xs text-usf-gold sm:text-sm">
              Personalized recipe guidance for safer favorite meals
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          {user ? (
            <>
              <div className="hidden items-center gap-1 md:flex">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-dark-green hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login">
              <Button variant="gold" size="sm">
                Sign In
              </Button>
            </Link>
          )}
        </nav>
      </div>

      {user && (
        <nav className="flex gap-1 overflow-x-auto border-t border-dark-green px-4 py-2 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-white/90 hover:bg-dark-green"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
