import { useEffect, useRef } from 'react';

/**
 * Decorative 3D "voice orb": a sphere of glowing particles that ripples like a sound wave,
 * rotates slowly and leans towards the pointer. Plain canvas 2D, no WebGL or libraries.
 * Draws a single still frame when the visitor prefers reduced motion.
 */
export function VoiceOrb({ className = '', count = 1600 }: { className?: string; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return; // jsdom / very old browsers

    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Points evenly spread on a unit sphere (Fibonacci lattice).
    const pts: { x: number; y: number; z: number; lat: number; lon: number }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      pts.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, lat: Math.asin(y), lon: t });
    }
    // Two tilted orbit rings.
    const rings = [0, 1].map((k) => Array.from({ length: 140 }, (_, i) => (i / 140) * Math.PI * 2 + k));

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    let tx = 0, ty = 0, mx = 0, my = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 0.6;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);

    let visible = true;
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) loop(performance.now()); })
      : null;
    io?.observe(canvas);

    let raf = 0;
    const draw = (time: number) => {
      const t = time / 1000;
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      const rotY = t * 0.18 + mx;
      const rotX = -0.35 + my;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const R = Math.min(w, h) * 0.34;
      const ox = w / 2, oy = h / 2;
      const persp = 3.2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // core glow
      const g = ctx.createRadialGradient(ox, oy, R * 0.1, ox, oy, R * 1.6);
      g.addColorStop(0, 'rgba(67,170,178,0.35)');
      g.addColorStop(0.45, 'rgba(27,143,151,0.12)');
      g.addColorStop(1, 'rgba(5,7,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';

      // "voice" level: a slow pulse with faster syllable-like bursts
      const level = 0.55 + 0.45 * Math.sin(t * 1.3) * Math.sin(t * 3.7 + 1);

      for (const p of pts) {
        // radial displacement: travelling waves over latitude/longitude
        const wave =
          Math.sin(p.lat * 6 + t * 2.4) * 0.05 +
          Math.sin(p.lon * 3 + t * 1.7) * Math.cos(p.lat * 2) * 0.06 * level +
          Math.sin(p.lat * 14 - t * 5) * 0.015 * level;
        const s = 1 + wave;
        let x = p.x * s, y = p.y * s, z = p.z * s;
        // rotate Y then X
        const x1 = x * cy - z * sy; const z1 = x * sy + z * cy;
        const y1 = y * cx - z1 * sx; const z2 = y * sx + z1 * cx;
        x = x1; y = y1; z = z2;
        const k = persp / (persp - z);
        const px = ox + x * R * k, py = oy + y * R * k;
        const depth = (z + 1) / 2; // 0 back → 1 front
        const size = (0.6 + depth * 1.6) * k;
        // colour: teal at back → mint → lime at the front crest
        const crest = Math.max(0, wave * 9);
        const r = Math.round(40 + depth * 80 + crest * 120);
        const gg = Math.round(150 + depth * 90);
        const b = Math.round(170 - depth * 90 - crest * 60);
        ctx.fillStyle = `rgba(${r},${gg},${Math.max(40, b)},${0.12 + depth * 0.75})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // orbit rings
      rings.forEach((ring, k) => {
        const tilt = k ? 1.15 : -0.5;
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const rr = k ? 1.45 : 1.3;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]! + t * (k ? -0.25 : 0.35);
          let x = Math.cos(a) * rr, y = 0, z = Math.sin(a) * rr;
          const y0 = y * ct - z * st; z = y * st + z * ct; y = y0;
          const x1 = x * cy - z * sy; const z1 = x * sy + z * cy;
          const y1 = y * cx - z1 * sx; const z2 = y * sx + z1 * cx;
          const kk = persp / (persp - z2);
          const depth = (z2 / rr + 1) / 2;
          ctx.fillStyle = k ? `rgba(212,255,58,${0.08 + depth * 0.5})` : `rgba(120,197,203,${0.06 + depth * 0.45})`;
          ctx.beginPath();
          ctx.arc(ox + x1 * R * kk, oy + y1 * R * kk, (0.5 + depth) * kk, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (time: number) => {
      cancelAnimationFrame(raf);
      draw(time);
      if (!reduce && visible) raf = requestAnimationFrame(loop);
    };
    loop(performance.now());

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [count]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
