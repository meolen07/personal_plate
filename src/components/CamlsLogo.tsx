import Image from "next/image";
import { cn } from "@/lib/utils";

interface CamlsLogoProps {
  className?: string;
  height?: number;
  /** Cream pill background — good on green header */
  pill?: boolean;
}

export function CamlsLogo({ className, height = 40, pill = false }: CamlsLogoProps) {
  const image = (
    <Image
      src="/logo.png"
      alt="CAMLS"
      width={Math.round(height * 4.2)}
      height={height}
      className={cn("h-auto w-auto object-contain", className)}
      priority
    />
  );

  if (pill) {
    return (
      <span className="inline-flex rounded-md bg-[#F5F5EB] px-2 py-1">
        {image}
      </span>
    );
  }

  return image;
}
