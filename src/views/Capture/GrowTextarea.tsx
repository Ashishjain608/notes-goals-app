import { useLayoutEffect, useRef, type JSX } from "react";

/**
 * A textarea that grows to fit its content (no inner scrollbar), so the title
 * and details use the panel's vertical space instead of a cramped fixed box.
 * Uncontrolled: seeded from `defaultValue`, saved on blur, re-measured when the
 * task changes (keyed on `taskId`).
 */
export function GrowTextarea({
  taskId,
  defaultValue,
  onBlur,
  placeholder,
  className,
}: {
  taskId: string;
  defaultValue: string;
  onBlur: (value: string) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = (): void => {
    const el = ref.current;
    if (!el) return;
    // Collapsing to "auto" before reading scrollHeight briefly shrinks the
    // panel body, which clamps the `.scroll` ancestor's scrollTop — restoring
    // the final height afterwards otherwise leaves the view jumped. Capture
    // and restore it synchronously around the collapse so the user never sees
    // the jump.
    const scroller = el.closest<HTMLElement>(".scroll");
    const scrollTop = scroller?.scrollTop;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  };

  useLayoutEffect(fit, [taskId]);

  return (
    <textarea
      key={taskId}
      ref={ref}
      defaultValue={defaultValue}
      onInput={fit}
      onBlur={(e) => onBlur(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={className}
    />
  );
}
