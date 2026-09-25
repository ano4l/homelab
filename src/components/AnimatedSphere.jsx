import { useEffect, useRef } from 'react';

const MAX_DPR = 1.5;
const PARTICLE_CHARACTERS = '.,:;+=xX$#';

export default function AnimatedSphere({ className = '', particleColor = '18, 18, 22', intensity = 1, interactive = false }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const timeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, inside: false, pulse: 0 });

  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    let width = 0; let height = 0; let active = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateSize = () => { const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR); width = rect.width; height = rect.height; canvas.width = Math.max(1, Math.floor(width * dpr)); canvas.height = Math.max(1, Math.floor(height * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const drawFrame = () => {
      if (!width || !height) return;
      const pointer = pointerRef.current; pointer.x += (pointer.targetX - pointer.x) * .055; pointer.y += (pointer.targetY - pointer.y) * .055; pointer.pulse *= .935;
      ctx.clearRect(0, 0, width, height); const centerX = width / 2; const centerY = height / 2; const radius = Math.min(width, height) * (.45 + pointer.pulse * .025); const time = timeRef.current; const points = [];
      ctx.font = `${Math.max(10, Math.min(14, width / 30))}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let phi = 0; phi < Math.PI * 2; phi += .18) for (let theta = 0; theta < Math.PI; theta += .18) {
        const x = Math.sin(theta) * Math.cos(phi + time); const y = Math.sin(theta) * Math.sin(phi + time); const z = Math.cos(theta);
        const rotY = time * .26 + pointer.x * .58; const rotatedX = x * Math.cos(rotY) - z * Math.sin(rotY); const rotatedZ = x * Math.sin(rotY) + z * Math.cos(rotY);
        const rotX = time * .13 - pointer.y * .46; const rotatedY = y * Math.cos(rotX) - rotatedZ * Math.sin(rotX); const finalZ = y * Math.sin(rotX) + rotatedZ * Math.cos(rotX); const depth = (finalZ + 1) / 2;
        points.push({ x: centerX + rotatedX * radius, y: centerY + rotatedY * radius, z: finalZ, char: PARTICLE_CHARACTERS[Math.floor(depth * (PARTICLE_CHARACTERS.length - 1))] });
      }
      points.sort((a, b) => a.z - b.z); points.forEach((point) => { const alpha = .16 + (point.z + 1) * .39; ctx.fillStyle = `rgba(${particleColor}, ${alpha})`; ctx.fillText(point.char, point.x, point.y); });
      if (active && !reduced.matches) timeRef.current += .00135 * Math.max(.45, intensity);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { updateSize(); drawFrame(); }) : null;
    observer?.observe(canvas); window.addEventListener('resize', updateSize); updateSize(); drawFrame();
    const loop = () => { drawFrame(); if (active && !reduced.matches) frameRef.current = requestAnimationFrame(loop); };
    frameRef.current = requestAnimationFrame(loop);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', updateSize); cancelAnimationFrame(frameRef.current); };
  }, [particleColor, intensity]);

  function move(event) { if (!interactive) return; const rect = event.currentTarget.getBoundingClientRect(); pointerRef.current.targetX = ((event.clientX - rect.left) / rect.width - .5) * 2; pointerRef.current.targetY = ((event.clientY - rect.top) / rect.height - .5) * 2; pointerRef.current.inside = true; }
  function leave() { pointerRef.current.targetX = 0; pointerRef.current.targetY = 0; pointerRef.current.inside = false; }
  function pulse() { if (interactive) pointerRef.current.pulse = 1; }

  return <canvas ref={canvasRef} className={className} style={{ display: 'block' }} aria-label="Interactive VK intelligence sphere" onPointerMove={move} onPointerLeave={leave} onPointerDown={pulse} />;
}
