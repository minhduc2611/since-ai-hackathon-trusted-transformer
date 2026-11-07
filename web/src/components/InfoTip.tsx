import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const BUBBLE_W = 280;
const BUBBLE_PAD = 8;

/** Hover/focus ⓘ tip rendered in a fixed portal above the layout. */
export function InfoTip({ text, children }: { text: string; children?: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const width = Math.min(BUBBLE_W, window.innerWidth - BUBBLE_PAD * 2);
    let left = r.right - width;
    left = Math.max(BUBBLE_PAD, Math.min(left, window.innerWidth - width - BUBBLE_PAD));
    let top = r.bottom + 6;
    const approxH = Math.min(220, 24 + text.split("\n").length * 16);
    if (top + approxH > window.innerHeight - BUBBLE_PAD) top = Math.max(BUBBLE_PAD, r.top - approxH - 6);
    setStyle({ position: "fixed", top, left, width, zIndex: 10000 });
  }, [open, text]);

  return (
    <span
      className={`info-tip${open ? " open" : ""}`}
      tabIndex={0}
      aria-label={text}
      ref={anchor}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children ?? (
        <span className="info-tip-icon" aria-hidden>
          i
        </span>
      )}
      {open &&
        createPortal(
          <span className="info-tip-bubble" role="tooltip" style={style}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
