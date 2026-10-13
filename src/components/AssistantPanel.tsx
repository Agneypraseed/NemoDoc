import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import { GripVertical, RotateCcw, X } from "lucide-react";

type Point = { x: number; y: number };
type Geometry = Point & { width: number; height: number };

export function AssistantPanel({
  title,
  offset,
  onClose,
  children,
  geometry,
  geometryKey,
  onGeometryChange,
  movable = false,
  resizable = false,
  ...attributes
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  offset: number;
  onClose: () => void;
  geometry?: Partial<Geometry>;
  geometryKey?: string;
  onGeometryChange?: (value: Partial<Geometry>) => void;
  movable?: boolean;
  resizable?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Point | undefined>(
    geometry?.x === undefined || geometry.y === undefined
      ? undefined
      : { x: geometry.x, y: geometry.y },
  );
  const [size, setSize] = useState(
    geometry?.width && geometry?.height
      ? { width: geometry.width, height: geometry.height }
      : undefined,
  );
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<
    | {
        id: number;
        pointer: Point;
        origin: Point;
        latest: Point;
        size: { width: number; height: number };
        moved: boolean;
      }
    | undefined
  >(undefined);
  const resizeGesture = useRef<
    | { id: number; x: number; y: number; width: number; height: number }
    | undefined
  >(undefined);
  const bound = (point: Point): Point => {
    const box = panel.current?.getBoundingClientRect();
    const dockTop =
      document
        .querySelector<HTMLElement>(".workspace-chat")
        ?.getBoundingClientRect().top ?? innerHeight;
    return {
      x: Math.max(8, Math.min(innerWidth - (box?.width ?? 312) - 8, point.x)),
      y: Math.max(8, Math.min(dockTop - (box?.height ?? 180) - 8, point.y)),
    };
  };
  const floating = movable && !!position;
  const commitGeometry = (nextPosition = position, nextSize = size) =>
    onGeometryChange?.({ ...nextPosition, ...nextSize });
  // Geometry belongs to the displayed note, not to the assistant shell.  Do
  // not remount the shell (which would interrupt a stream), but do restore the
  // selected note's geometry when its identity changes.
  useLayoutEffect(() => {
    setPosition(
      geometry?.x === undefined || geometry.y === undefined
        ? undefined
        : { x: geometry.x, y: geometry.y },
    );
    setSize(
      geometry?.width && geometry?.height
        ? { width: geometry.width, height: geometry.height }
        : undefined,
    );
  }, [geometryKey]);
  useEffect(() => {
    if (!floating || !panel.current) return;
    const constrain = () => {
      if (gesture.current) return;
      setPosition((value) => {
        if (!value) return value;
        const next = bound(value);
        return next.x === value.x && next.y === value.y ? value : next;
      });
    };
    const resize = new ResizeObserver(constrain);
    resize.observe(panel.current);
    window.addEventListener("resize", constrain);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", constrain);
    };
  }, [floating]);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const box = panel.current!.getBoundingClientRect();
    const origin = bound({ x: box.x, y: box.y });
    gesture.current = {
      id: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      origin,
      latest: origin,
      size: { width: box.width, height: box.height },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    if (
      !active.moved &&
      Math.hypot(
        event.clientX - active.pointer.x,
        event.clientY - active.pointer.y,
      ) < 4
    )
      return;
    active.latest = bound({
      x: active.origin.x + event.clientX - active.pointer.x,
      y: active.origin.y + event.clientY - active.pointer.y,
    });
    if (!active.moved) {
      active.moved = true;
      setSize(active.size);
      setPosition(active.latest);
      setDragging(true);
      return;
    }
    // Keep the card attached to the pointer without rerendering streamed text.
    panel.current!.style.transform = `translate3d(${active.latest.x}px, ${active.latest.y}px, 0)`;
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    if (active.moved) {
      setPosition(active.latest);
      commitGeometry(active.latest, active.size);
    }
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setPosition(undefined);
      onGeometryChange?.({ ...size, x: undefined, y: undefined });
      return;
    }
    const steps: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const box = panel.current!.getBoundingClientRect();
    const distance = event.shiftKey ? 40 : 16;
    const next = bound({
      x: box.x + step.x * distance,
      y: box.y + step.y * distance,
    });
    const nextSize = size ?? { width: box.width, height: box.height };
    setSize(nextSize);
    setPosition(next);
    commitGeometry(next, nextSize);
  };
  return (
    <aside
      {...attributes}
      ref={panel}
      className={`assistant-panel ${floating ? "floating" : ""} ${dragging ? "dragging" : ""}`}
      style={
        {
          ...(floating
            ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
            : { "--margin-offset": `${offset}px` }),
          ...(floating && resizable && size
            ? { width: size.width, height: size.height }
            : {}),
        } as CSSProperties
      }
    >
      <div className="margin-header">
        {movable ? (
          <button
            ref={handle}
            type="button"
            className="margin-drag-handle"
            aria-label="Move answer card"
            title="Drag to move. Arrow keys move; Home returns to the margin."
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onKeyDown={keyboardMove}
          >
            <GripVertical size={13} aria-hidden="true" />
            <strong>{title}</strong>
          </button>
        ) : (
          <div className="margin-title">
            <strong>{title}</strong>
          </div>
        )}
        {floating && (
          <button
            type="button"
            className="icon-button small"
            aria-label="Return card to margin"
            title="Return to margin"
            onClick={() => {
              setPosition(undefined);
              onGeometryChange?.({ ...size, x: undefined, y: undefined });
              handle.current?.focus();
            }}
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          className="icon-button small panel-close"
          title="Close assistant"
          aria-label="Close assistant"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {children}
      {resizable && floating && (
        <button
          type="button"
          className="assistant-resize-handle"
          aria-label="Resize answer card"
          title="Drag to resize. Arrow keys resize; Home resets size."
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            const target = event.currentTarget;
            const box = panel.current!.getBoundingClientRect();
            resizeGesture.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              width: box.width,
              height: box.height,
            };
            target.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMove={(event) => {
            const start = resizeGesture.current;
            if (!start || start.id !== event.pointerId) return;
            const box = panel.current!.getBoundingClientRect();
            const dockTop =
              document
                .querySelector<HTMLElement>(".workspace-chat")
                ?.getBoundingClientRect().top ?? innerHeight;
            const maximumWidth = Math.max(160, innerWidth - box.left - 8);
            const minimumWidth = Math.min(280, maximumWidth);
            const maximumHeight = Math.max(160, dockTop - box.top - 8);
            const minimumHeight = Math.min(240, maximumHeight);
            setSize({
              width: Math.max(
                minimumWidth,
                Math.min(maximumWidth, start.width + event.clientX - start.x),
              ),
              height: Math.max(
                minimumHeight,
                Math.min(maximumHeight, start.height + event.clientY - start.y),
              ),
            });
          }}
          onPointerUp={(event) => {
            if (resizeGesture.current?.id !== event.pointerId) return;
            resizeGesture.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            setSize((value) => {
              commitGeometry(position, value);
              return value;
            });
          }}
          onPointerCancel={(event) => {
            if (resizeGesture.current?.id === event.pointerId)
              resizeGesture.current = undefined;
          }}
          onLostPointerCapture={() => {
            resizeGesture.current = undefined;
          }}
          onKeyDown={(event) => {
            if (event.key === "Home") {
              setSize(undefined);
              onGeometryChange?.({
                ...position,
                width: undefined,
                height: undefined,
              });
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const delta = event.shiftKey ? 40 : 16;
            const box = panel.current!.getBoundingClientRect();
            const dockTop =
              document
                .querySelector<HTMLElement>(".workspace-chat")
                ?.getBoundingClientRect().top ?? innerHeight;
            const maximumWidth = Math.max(160, innerWidth - box.left - 8);
            const minimumWidth = Math.min(280, maximumWidth);
            const maximumHeight = Math.max(160, dockTop - box.top - 16);
            const minimumHeight = Math.min(240, maximumHeight);
            const next = {
              width: Math.max(
                minimumWidth,
                Math.min(
                  maximumWidth,
                  box.width +
                    (event.key === "ArrowRight"
                      ? delta
                      : event.key === "ArrowLeft"
                        ? -delta
                        : 0),
                ),
              ),
              height: Math.max(
                minimumHeight,
                Math.min(
                  maximumHeight,
                  box.height +
                    (event.key === "ArrowDown"
                      ? delta
                      : event.key === "ArrowUp"
                        ? -delta
                        : 0),
                ),
              ),
            };
            if (!event.key.startsWith("Arrow")) return;
            setSize(next);
            commitGeometry(position, next);
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      )}
    </aside>
  );
}
