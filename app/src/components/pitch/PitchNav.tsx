"use client";

import { useEffect, useState } from "react";

export type PitchSlide = { id: string; label: string };

// Deck controls: highlights the slide in view and moves between slides with the keyboard,
// so the page can be driven with a presenter clicker (arrow / page keys).
export function PitchNav({ slides }: { slides: PitchSlide[] }) {
  const [active, setActive] = useState(slides[0]?.id);

  useEffect(() => {
    const els = slides.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { threshold: 0.55 },
    );
    els.forEach((el) => io.observe(el));

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const next = ["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key);
      const prev = ["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key);
      if (!next && !prev) return;
      e.preventDefault();
      const i = els.findIndex((el) => el.getBoundingClientRect().top > -window.innerHeight / 2);
      const cur = i === -1 ? els.length - 1 : i;
      const target = els[Math.min(els.length - 1, Math.max(0, cur + (next ? 1 : -1)))];
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    };
    window.addEventListener("keydown", onKey);

    return () => {
      io.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [slides]);

  return (
    <nav className="pitch-tabs" aria-label="Slides">
      {slides.map((s) => (
        <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
