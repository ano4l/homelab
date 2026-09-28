import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './OptionWheel.css';

const clampIndex = (index, count) => Math.max(0, Math.min(Math.round(index), count - 1));

export default function OptionWheel({
  items = [], defaultSelected = 0, onChange, onSelect,
  textColor = '#68686e', activeColor = '#121216', side = 'right',
  fontSize = 2.1, spacing = 1.4, curve = 1, tilt = 6, fade = .14,
  minOpacity = .28, inset = 40, loop = false, draggable = true, className = '',
}) {
  const initialIndex = clampIndex(defaultSelected, items.length);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null), itemRefs = useRef([]);
  const selectedRef = useRef(initialIndex), rowHeightRef = useRef(72);
  const layoutRef = useRef({ height: 0, rowHeight: 0 });
  const frameRef = useRef(null), pointerRef = useRef(null), suppressClickRef = useRef(0);
  const changeRef = useRef(onChange), selectRef = useRef(onSelect);
  const id = useId();
  changeRef.current = onChange;
  selectRef.current = onSelect;

  const selectIndex = useCallback(index => {
    if (!items.length) return;
    const next = clampIndex(index, items.length);
    if (selectedRef.current !== next) {
      selectedRef.current = next;
      setSelectedIndex(next);
      changeRef.current?.(next, items[next]);
    }
  }, [items]);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root || !items.length) return;
    // A resize can make scroll-snap emit a scroll before ResizeObserver runs.
    // Keep the current choice until the spacers and row size are updated.
    if (root.clientHeight !== layoutRef.current.height || itemRefs.current[0]?.offsetHeight !== layoutRef.current.rowHeight) return;
    // The two spacers center both end items. Scroll offsets therefore map
    // directly to rows, without mixing offset-parent and viewport coordinates.
    const position = root.scrollTop / rowHeightRef.current;
    selectIndex(position);
    itemRefs.current.slice(0, items.length).forEach((item, index) => {
      if (!item) return;
      const distance = index - position;
      item.style.setProperty('--ow-distance', Math.min(Math.abs(distance), 4));
      item.style.setProperty('--ow-opacity', Math.max(minOpacity, 1 - Math.abs(distance) * fade));
      item.style.setProperty('--ow-curve-x', `${Math.min(100, distance * distance * 6 * curve) * (side === 'right' ? 1 : -1)}px`);
      item.style.setProperty('--ow-rotation', `${Math.max(-24, Math.min(24, distance * tilt)) * (side === 'right' ? -1 : 1)}deg`);
    });
  }, [items.length, selectIndex, minOpacity, fade, curve, side, tilt]);

  const onScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint();
    });
  }, [paint]);

  const scrollToIndex = useCallback(index => {
    const root = rootRef.current;
    if (!root || !items.length) return;
    const next = clampIndex(index, items.length);
    root.scrollTo({ top: next * rowHeightRef.current, behavior: 'instant' });
    selectIndex(next);
    paint();
  }, [items.length, selectIndex, paint]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const resize = () => {
      rowHeightRef.current = itemRefs.current[0]?.offsetHeight || 72;
      layoutRef.current = { height: root.clientHeight, rowHeight: rowHeightRef.current };
      root.style.scrollSnapType = 'none';
      root.style.setProperty('--ow-padding', `${Math.max(0, (root.clientHeight - rowHeightRef.current) / 2)}px`);
      scrollToIndex(selectedRef.current);
      root.style.scrollSnapType = '';
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    if (itemRefs.current[0]) observer.observe(itemRefs.current[0]);
    resize();
    return () => observer.disconnect();
  }, [scrollToIndex]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  function pointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    pointerRef.current = { id: event.pointerId, type: event.pointerType, y: event.clientY, top: rootRef.current.scrollTop, moved: false };
  }
  function pointerMove(event) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = event.clientY - pointer.y;
    if (Math.abs(delta) > 6) pointer.moved = true;
    if (pointer.moved && pointer.type === 'mouse' && draggable) {
      rootRef.current.setPointerCapture(pointer.id);
      setDragging(true);
      // Only mouse dragging is implemented here. Touch scrolling and inertia
      // belong to the browser and must never be cancelled.
      rootRef.current.scrollTop = pointer.top - delta;
    }
  }
  function pointerEnd(event) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.moved) {
      suppressClickRef.current = performance.now() + 300;
      if (pointer.type === 'mouse') scrollToIndex(rootRef.current.scrollTop / rowHeightRef.current);
    }
    if (rootRef.current.hasPointerCapture(pointer.id)) rootRef.current.releasePointerCapture(pointer.id);
    pointerRef.current = null;
    setDragging(false);
  }
  function openIndex(index) {
    if (!items.length || performance.now() < suppressClickRef.current) return;
    selectIndex(index);
    selectRef.current?.(index, items[index]);
  }
  function keyDown(event) {
    if (!items.length) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); openIndex(selectedRef.current); return;
    }
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = selectedRef.current - 1;
    else if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = selectedRef.current + 1;
    else if (event.key === 'PageUp') next = selectedRef.current - 3;
    else if (event.key === 'PageDown') next = selectedRef.current + 3;
    else return;
    event.preventDefault();
    if (loop) next = (next + items.length) % items.length;
    scrollToIndex(next);
  }

  return <div className={`option-wheel-shell${className ? ` ${className}` : ''}`} style={{
    '--ow-text-color': textColor, '--ow-active-color': activeColor,
    '--ow-font-size': `${fontSize}rem`, '--ow-inset': `${inset}px`,
    '--ow-row-height': `${Math.max(72, fontSize * spacing * 16)}px`,
  }}>
    <div className="option-wheel__viewport">
      <div className="option-wheel__selection-band" aria-hidden="true"><span>→</span></div>
      <div ref={rootRef} role="listbox" tabIndex={0} aria-label="VK command menu"
        aria-activedescendant={items.length ? `${id}-${selectedIndex}` : undefined}
        className={`option-wheel option-wheel--${side}${dragging ? ' option-wheel--dragging' : ''}`}
        onScroll={onScroll} onKeyDown={keyDown} onPointerDown={pointerDown}
        onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
        <div className="option-wheel__spacer" aria-hidden="true"/>
        {items.map((label, index) => <div id={`${id}-${index}`} key={`${label}-${index}`}
          ref={element => { itemRefs.current[index] = element; }} role="option"
          aria-selected={selectedIndex === index} aria-posinset={index + 1} aria-setsize={items.length}
          className={`option-wheel__item${selectedIndex === index ? ' option-wheel__item--selected' : ''}`}
          onClick={() => openIndex(index)}><span>{label}</span></div>)}
        <div className="option-wheel__spacer" aria-hidden="true"/>
      </div>
    </div>
    <div className="option-wheel__footer">
      <span className="option-wheel__position" aria-hidden="true">{String(selectedIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
      <button className="option-wheel__open" disabled={!items.length} onClick={() => openIndex(selectedRef.current)}>Open {items[selectedIndex]} <span aria-hidden="true">→</span></button>
    </div>
  </div>;
}
