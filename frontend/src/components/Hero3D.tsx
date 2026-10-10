import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Tilts the element towards the pointer. Writes CSS variables only, so React never re-renders. */
export function useTilt<T extends HTMLElement>(max = 10) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--rx', `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${(x * max).toFixed(2)}deg`);
      });
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
    };
    const leave = () => set(0, 0);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [max]);
  return ref;
}

/** Adds `is-visible` once the element scrolls into view (falls back to visible at once). */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: {
  children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      el.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { el.classList.add('is-visible'); io.disconnect(); } }),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const style = { '--delay': `${delay}ms` } as CSSProperties;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`reveal-3d ${className}`} style={style}><div className="reveal-inner">{children}</div></Tag>
  );
}

/** Card that tilts on hover (used for the "How it works" steps). */
export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useTilt<HTMLDivElement>(8);
  return <div ref={ref} className={`tilt-3d ${className}`}>{children}</div>;
}
