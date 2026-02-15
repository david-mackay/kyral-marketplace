"use client";

export function LoadingDots({
  sizeClassName = "h-1.5 w-1.5",
}: {
  sizeClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${sizeClassName} rounded-full bg-current animate-pulse`}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
