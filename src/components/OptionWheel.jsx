import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './OptionWheel.css';

const OptionWheel = ({
  items = [], defaultSelected = 0, onChange, onSelect, textColor = '#a6a6a6', activeColor = '#ffffff',
  side = 'left', fontSize = 3, spacing = 1.4, curve = 1, tilt = 6, blur = 2, fade = 0.25,
  minOpacity = 0.05, smoothing = 200, inset = 80, loop = false, draggable = true, className = ''
}) => {
  const rootRef = useRef(null); const itemRefs = useRef([]); const posRef = useRef(defaultSelected);
  const targetRef = useRef(defaultSelected); const rafRef = useRef(null); const lastRef = useRef(0);
  const cfgRef = useRef({}); const onChangeRef = useRef(onChange); const onSelectRef = useRef(onSelect); const selectedRef = useRef(defaultSelected);
  const wheelTimerRef = useRef(null); const dragRef = useRef(null); const dragMovedRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(defaultSelected); const [isDragging, setIsDragging] = useState(false);
  const [nativeScroll, setNativeScroll] = useState(() => window.matchMedia('(max-width: 780px), (pointer: coarse)').matches);
  const scrollFrameRef = useRef(null);
  const optionId = useId();
  const remPx = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;
  cfgRef.current = { count: items.length, items, rowH: Math.max(fontSize * spacing * remPx, 1), curve, tilt, blur, fade, minOpacity, side, loop, smoothing, draggable };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 780px), (pointer: coarse)');
    const change = () => setNativeScroll(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  const scrollToIndex = useCallback((index, smooth = true) => {
    const root = rootRef.current;
    if (!root || !items.length) return;
    const next = Math.max(0, Math.min(index, items.length - 1));
    const item = itemRefs.current[next];
    if (!item) return;
    root.scrollTo({ top: item.offsetTop - (root.clientHeight - item.offsetHeight) / 2,
      behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }, [items.length]);

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current != null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const root = rootRef.current;
      if (!root || !items.length) return;
      const center = root.scrollTop + root.clientHeight / 2;
      let nearest = 0, distance = Infinity;
      itemRefs.current.slice(0, items.length).forEach((item, index) => {
        if (!item) return;
        const delta = Math.abs(item.offsetTop + item.offsetHeight / 2 - center);
        if (delta < distance) { nearest = index; distance = delta; }
      });
      if (nearest !== selectedRef.current) {
        selectedRef.current = nearest;
        targetRef.current = posRef.current = nearest;
        setSelectedIndex(nearest);
        onChangeRef.current?.(nearest, items[nearest]);
      }
    });
  }, [items]);

  useEffect(() => {
    if (!nativeScroll) return;
    const root = rootRef.current;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    itemRefs.current.forEach(item => item?.removeAttribute('style'));
    const resize = new ResizeObserver(() => {
      root.style.setProperty('--ow-padding', `${Math.max(0, (root.clientHeight - 64) / 2)}px`);
      scrollToIndex(selectedRef.current, false);
    });
    resize.observe(root);
    scrollToIndex(selectedRef.current, false);
    return () => { resize.disconnect(); if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current); scrollFrameRef.current = null; };
  }, [nativeScroll, scrollToIndex]);

  const runFrame = useCallback((now) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05); lastRef.current = now;
    const cfg = cfgRef.current; const k = 1 - Math.exp(-dt / (Math.max(cfg.smoothing, 1) / 1000));
    const target = targetRef.current; let next = posRef.current + (target - posRef.current) * k;
    const settled = Math.abs(target - next) < 0.001; if (settled) next = target; posRef.current = next;
    const mirror = cfg.side === 'right' ? -1 : 1; const tiltRad = (cfg.tilt * Math.PI) / 180;
    const R = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
    for (let i = 0; i < cfg.count; i += 1) {
      const el = itemRefs.current[i]; if (!el) continue; let d = i - next;
      if (cfg.loop && cfg.count > 1) { d = ((d % cfg.count) + cfg.count) % cfg.count; if (d > cfg.count / 2) d -= cfg.count; }
      const dist = Math.abs(d); let x = 0; let y = d * cfg.rowH; let rot = 0;
      if (R > 0) { const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad)); y = R * Math.sin(ang); x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve; rot = mirror * ang * 180 / Math.PI; }
      el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`;
      el.style.opacity = String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade)); el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : 'none';
      el.style.setProperty('--ow-p', Math.max(0, 1 - Math.min(dist, 1)).toFixed(4));
    }
    rafRef.current = settled ? null : requestAnimationFrame(runFrame);
  }, []);
  const startLoop = useCallback(() => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); lastRef.current = performance.now(); rafRef.current = requestAnimationFrame(runFrame); }, [runFrame]);
  const applyTarget = useCallback((value, snap) => {
    const cfg = cfgRef.current; let v = value; if (!cfg.loop) v = Math.min(Math.max(v, 0), Math.max(cfg.count - 1, 0)); if (snap) v = Math.round(v);
    targetRef.current = v; const idx = ((Math.round(v) % cfg.count) + cfg.count) % cfg.count;
    if (idx !== selectedRef.current) { selectedRef.current = idx; setSelectedIndex(idx); onChangeRef.current?.(idx, cfg.items[idx]); }
    startLoop();
  }, [startLoop]);
  useEffect(() => {
    if (nativeScroll) return;
    const el = rootRef.current; if (!el) return;
    const onWheel = (event) => { event.preventDefault(); const cfg = cfgRef.current; const delta = event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY; const step = Math.max(-1, Math.min(1, delta / cfg.rowH)); applyTarget(targetRef.current + step, false); if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current); wheelTimerRef.current = setTimeout(() => applyTarget(targetRef.current, true), 140); };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => { el.removeEventListener('wheel', onWheel); if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current); };
  }, [applyTarget, nativeScroll]);
  const handlePointerDown = useCallback((event) => { if (!cfgRef.current.draggable) return; dragRef.current = { y: event.clientY, start: targetRef.current, id: event.pointerId }; dragMovedRef.current = false; setIsDragging(true); }, []);
  const handlePointerMove = useCallback((event) => { const drag = dragRef.current; if (!drag) return; const dy = event.clientY - drag.y; if (!dragMovedRef.current && Math.abs(dy) > 4) { dragMovedRef.current = true; rootRef.current?.setPointerCapture(drag.id); } if (dragMovedRef.current) applyTarget(drag.start - dy / cfgRef.current.rowH, false); }, [applyTarget]);
  const handlePointerEnd = useCallback(() => { if (!dragRef.current) return; dragRef.current = null; setIsDragging(false); if (dragMovedRef.current) applyTarget(targetRef.current, true); }, [applyTarget]);
  const handleItemClick = useCallback((index) => { if (dragMovedRef.current) return; const cfg = cfgRef.current; const cur = targetRef.current; let d = index - (((cur % cfg.count) + cfg.count) % cfg.count); if (cfg.loop && cfg.count > 1) { if (d > cfg.count / 2) d -= cfg.count; else if (d < -cfg.count / 2) d += cfg.count; } applyTarget(cur + d, true); onSelectRef.current?.(index, cfg.items[index]); }, [applyTarget]);
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const cfg = cfgRef.current; const index = selectedRef.current; onSelectRef.current?.(index, cfg.items[index]); return; }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const index = event.key === 'Home' ? 0 : items.length - 1; if (nativeScroll) scrollToIndex(index); else applyTarget(index, true); return; }
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : null;
    if (delta == null) return; event.preventDefault(); applyTarget(Math.round(targetRef.current) + delta, true);
    if (nativeScroll) { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; scrollToIndex(Math.round(targetRef.current)); }
  }, [applyTarget, nativeScroll, scrollToIndex, items.length]);
  useEffect(() => {
    if (!nativeScroll) { rootRef.current.scrollTop = 0; applyTarget(targetRef.current, false); }
  }, [nativeScroll, items, fontSize, spacing, curve, tilt, blur, fade, minOpacity, side, loop, smoothing, applyTarget]);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  return <div className={`option-wheel-shell${nativeScroll ? ' option-wheel-shell--native' : ''}`}>
    {nativeScroll && <div className="option-wheel__selection-band" aria-hidden="true"/>}
    <div ref={rootRef} role="listbox" tabIndex={0} aria-label="VK command menu" aria-activedescendant={`${optionId}-${selectedIndex}`} className={`option-wheel${nativeScroll ? ' option-wheel--native' : ''}${side === 'right' ? ' option-wheel--right' : ''}${isDragging ? ' option-wheel--dragging' : ''}${className ? ` ${className}` : ''}`} style={{ '--ow-text-color': textColor, '--ow-active-color': activeColor, '--ow-font-size': `${fontSize}rem`, '--ow-inset': `${inset}px` }} onScroll={nativeScroll ? handleScroll : undefined} onPointerDown={nativeScroll ? undefined : handlePointerDown} onPointerMove={nativeScroll ? undefined : handlePointerMove} onPointerUp={nativeScroll ? undefined : handlePointerEnd} onPointerCancel={nativeScroll ? undefined : handlePointerEnd} onKeyDown={handleKeyDown}>
      {items.map((label, index) => <div id={`${optionId}-${index}`} key={`${label}-${index}`} ref={(el) => { itemRefs.current[index] = el; }} role="option" aria-selected={selectedIndex === index} className={`option-wheel__item${selectedIndex === index ? ' option-wheel__item--selected' : ''}`} onClick={() => nativeScroll ? onSelectRef.current?.(index, items[index]) : handleItemClick(index)}>{label}</div>)}
    </div>
    {nativeScroll && <button className="option-wheel__open" onClick={() => onSelectRef.current?.(selectedRef.current, items[selectedRef.current])}>Open {items[selectedIndex]} <span aria-hidden="true">→</span></button>}
  </div>;
};

export default OptionWheel;
