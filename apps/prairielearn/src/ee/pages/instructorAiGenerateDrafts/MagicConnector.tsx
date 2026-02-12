import { useEffect, useRef, useSyncExternalStore } from 'react';

function subscribeToPrefersReducedMotion(callback: () => void) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getPrefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MagicConnector() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToPrefersReducedMotion,
    getPrefersReducedMotion,
    () => false,
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const particles: {
      x: number;
      y: number;
      speed: number;
      size: number;
      opacity: number;
      wobbleOffset: number;
      wobbleSpeed: number;
    }[] = [];

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Mark as hidden so the animation loop pauses and we know to
        // reposition particles when the accordion re-expands.
        canvas.width = 0;
        canvas.height = 0;
        return;
      }

      const wasHidden = canvas.width === 0 || canvas.height === 0;
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      // When becoming visible (initial open or re-expand), distribute
      // particles near center so they're immediately visible.
      if (wasHidden) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        for (let i = 0; i < particles.length; i++) {
          particles[i].x = w / 2 + (Math.random() - 0.5) * 40;
          particles[i].y = (h * i) / particles.length;
        }
      }
    };

    resize();

    // Use ResizeObserver so the canvas initializes when the accordion expands.
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: 0,
        y: 0,
        speed: 0.3 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 2.5,
        opacity: 0.2 + Math.random() * 0.5,
        wobbleOffset: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
      });
    }

    let time = 0;

    const animate = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;

      // Don't update while the accordion is still animating open.
      if (canvas.width === 0 || canvas.height === 0) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      time += 1;

      // Draw flowing line
      ctx.beginPath();
      for (let y = 0; y <= h; y += 2) {
        const wobble = Math.sin(y * 0.03 + time * 0.02) * 8;
        if (y === 0) {
          ctx.moveTo(w / 2 + wobble, 0);
        } else {
          ctx.lineTo(w / 2 + wobble, y);
        }
      }
      ctx.strokeStyle = 'hsl(217, 91%, 50%)';
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Animate particles flowing downward
      for (const p of particles) {
        p.y += p.speed;
        p.wobbleOffset += p.wobbleSpeed;
        const wobble = Math.sin(p.wobbleOffset) * 12;

        if (p.y > h) {
          p.y = -4;
          p.x = w / 2 + (Math.random() - 0.5) * 40;
        }

        const centerDist = Math.abs(p.x + wobble - w / 2);
        const fadeAtEdge = Math.max(0, 1 - centerDist / 40);

        ctx.beginPath();
        ctx.arc(p.x + wobble, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(217, 91%, 60%)';
        ctx.globalAlpha = p.opacity * fadeAtEdge;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="position-relative d-flex flex-column align-items-center justify-content-center py-2"
      style={{ height: 72 }}
      aria-hidden="true"
    >
      {prefersReducedMotion ? (
        <div className="d-flex flex-column align-items-center gap-1">
          <div style={{ height: 16, width: 1 }} className="bg-primary opacity-25" />
          <i className="bi bi-stars text-primary opacity-50" />
          <div style={{ height: 16, width: 1 }} className="bg-primary opacity-25" />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="position-absolute top-0 start-0 w-100 h-100 border-0"
          style={{ width: '100%', height: '100%' }}
        />
      )}
      <div
        className="position-relative d-flex align-items-center gap-1 rounded-pill border bg-white px-3 py-1"
        style={{ zIndex: 1, borderColor: 'rgba(var(--bs-primary-rgb), 0.2)' }}
      >
        <i className="bi bi-stars text-primary" style={{ fontSize: '0.75rem' }} />
        <span className="small fw-medium">AI generates</span>
      </div>
    </div>
  );
}
