"use client";

import Image from "next/image";

interface RecipeImageProps {
  src?: string;
  alt: string;
  className: string;
}

export function RecipeImage({ src, alt, className }: RecipeImageProps) {
  return (
    <Image
      src={src || "/recipe-placeholder.svg"}
      alt={alt}
      width={1024}
      height={768}
      className={className}
      unoptimized
    />
  );
}
