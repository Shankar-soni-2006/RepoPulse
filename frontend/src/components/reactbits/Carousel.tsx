// From React Bits (reactbits.dev, MIT): Carousel. Adapted for RepoPulse:
// - width follows the container (ResizeObserver) instead of a fixed baseWidth
// - theme colors (light and dark) instead of hard-coded dark ones
// - previous/next buttons, arrow keys, a slide counter and screen-reader labels
// - dots sized for any number of slides; autoplay also pauses on keyboard focus
// - demo items (and the react-icons dependency) removed: items are required
// The slide/loop/drag/3D-rotation logic is unchanged.
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { motion, type PanInfo, useMotionValue, useTransform, type MotionValue, type Transition } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CarouselItem {
  title: string;
  description: string;
  id: number;
  icon: ReactNode;
}

export interface CarouselProps {
  items: CarouselItem[];
  /** Maximum slide-frame width in px; the carousel shrinks to fit narrower containers */
  maxWidth?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  loop?: boolean;
  /** Accessible name of the carousel, e.g. "Features" */
  label: string;
}

const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;
const GAP = 16;
const CONTAINER_PADDING = 16;
const SPRING_OPTIONS = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface CarouselItemProps {
  item: CarouselItem;
  index: number;
  itemWidth: number;
  trackItemOffset: number;
  x: MotionValue<number>;
  transition: Transition;
  slideLabel: string;
  hidden: boolean;
}

function CarouselSlide({ item, index, itemWidth, trackItemOffset, x, transition, slideLabel, hidden }: CarouselItemProps) {
  const range = [-(index + 1) * trackItemOffset, -index * trackItemOffset, -(index - 1) * trackItemOffset];
  const rotateY = useTransform(x, range, [90, 0, -90], { clamp: false });

  return (
    <motion.div
      role="group"
      aria-roledescription="slide"
      aria-label={slideLabel}
      aria-hidden={hidden}
      className="relative flex shrink-0 cursor-grab flex-col items-start justify-between overflow-hidden rounded-lg border border-border bg-background active:cursor-grabbing"
      style={{ width: itemWidth, height: '100%', rotateY }}
      transition={transition}
    >
      <div className="p-5 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">{item.icon}</span>
      </div>
      <div className="p-5 pt-0">
        <h3 className="mb-1.5 text-base font-semibold text-foreground">{item.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      </div>
    </motion.div>
  );
}

export default function Carousel({
  items,
  maxWidth = 560,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  loop = false,
  label,
}: CarouselProps): JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number>(maxWidth);
  // Fit the container: measure it and keep the frame no wider than maxWidth
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth || maxWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxWidth]);

  const baseWidth = Math.max(240, Math.min(maxWidth, available));
  const itemWidth = baseWidth - CONTAINER_PADDING * 2;
  const trackItemOffset = itemWidth + GAP;
  const itemsForRender = useMemo(() => {
    if (!loop) return items;
    if (items.length === 0) return [];
    return [items[items.length - 1], ...items, items[0]];
  }, [items, loop]);

  const [position, setPosition] = useState<number>(loop ? 1 : 0);
  const x = useMotionValue(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isJumping, setIsJumping] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const paused = (pauseOnHover && isHovered) || isFocused;
  useEffect(() => {
    if (!autoplay || itemsForRender.length <= 1 || paused) return undefined;
    const timer = setInterval(() => {
      setPosition((prev) => Math.min(prev + 1, itemsForRender.length - 1));
    }, autoplayDelay);
    return () => clearInterval(timer);
  }, [autoplay, autoplayDelay, paused, itemsForRender.length]);

  useEffect(() => {
    const startingPosition = loop ? 1 : 0;
    setPosition(startingPosition);
    x.set(-startingPosition * trackItemOffset);
  }, [items.length, loop, trackItemOffset, x]);

  useEffect(() => {
    if (!loop && position > itemsForRender.length - 1) {
      setPosition(Math.max(0, itemsForRender.length - 1));
    }
  }, [itemsForRender.length, loop, position]);

  const effectiveTransition = isJumping ? { duration: 0 } : SPRING_OPTIONS;

  const handleAnimationComplete = () => {
    if (!loop || itemsForRender.length <= 1) {
      setIsAnimating(false);
      return;
    }
    const lastCloneIndex = itemsForRender.length - 1;
    // Landed on a clone: jump (without animation) to the real slide it mirrors
    if (position === lastCloneIndex || position === 0) {
      setIsJumping(true);
      const target = position === 0 ? items.length : 1;
      setPosition(target);
      x.set(-target * trackItemOffset);
      requestAnimationFrame(() => {
        setIsJumping(false);
        setIsAnimating(false);
      });
      return;
    }
    setIsAnimating(false);
  };

  // Buttons and keys may retarget a running animation (as the original's dots do);
  // only dragging waits for it to finish
  const step = (direction: 1 | -1) => {
    setPosition((prev) => {
      const max = itemsForRender.length - 1;
      return Math.max(0, Math.min(prev + direction, max));
    });
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo): void => {
    const { offset, velocity } = info;
    const direction =
      offset.x < -DRAG_BUFFER || velocity.x < -VELOCITY_THRESHOLD
        ? 1
        : offset.x > DRAG_BUFFER || velocity.x > VELOCITY_THRESHOLD
          ? -1
          : 0;
    if (direction !== 0) step(direction);
  };

  const dragProps = loop
    ? {}
    : { dragConstraints: { left: -trackItemOffset * Math.max(itemsForRender.length - 1, 0), right: 0 } };

  const activeIndex =
    items.length === 0 ? 0 : loop ? (position - 1 + items.length) % items.length : Math.min(position, items.length - 1);
  const realIndex = (renderIndex: number) =>
    loop ? (renderIndex - 1 + items.length) % items.length : renderIndex;

  const navButton =
    'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40';

  return (
    <div ref={outerRef} className="w-full">
      <section
        aria-roledescription="carousel"
        aria-label={label}
        className="mx-auto"
        style={{ width: baseWidth }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsFocused(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/40 p-4" style={{ height: 'auto' }}>
          <motion.div
            className="flex"
            aria-live={autoplay && !paused ? 'off' : 'polite'}
            drag={isAnimating ? false : 'x'}
            {...dragProps}
            style={{
              width: itemWidth,
              gap: `${GAP}px`,
              perspective: 1000,
              perspectiveOrigin: `${position * trackItemOffset + itemWidth / 2}px 50%`,
              x,
            }}
            onDragEnd={handleDragEnd}
            animate={{ x: -(position * trackItemOffset) }}
            transition={effectiveTransition}
            onAnimationStart={() => setIsAnimating(true)}
            onAnimationComplete={handleAnimationComplete}
          >
            {itemsForRender.map((item, index) => (
              <CarouselSlide
                key={`${item.id}-${index}`}
                item={item}
                index={index}
                itemWidth={itemWidth}
                trackItemOffset={trackItemOffset}
                x={x}
                transition={effectiveTransition}
                slideLabel={`${realIndex(index) + 1} of ${items.length}`}
                hidden={index !== position}
              />
            ))}
          </motion.div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" className={navButton} aria-label="Previous feature" onClick={() => step(-1)} disabled={!loop && position === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {items.map((item, index) => (
              <motion.button
                type="button"
                key={item.id}
                aria-label={`Go to ${item.title} (${index + 1} of ${items.length})`}
                aria-current={activeIndex === index}
                className={`h-2 w-2 cursor-pointer appearance-none rounded-full border-0 p-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  activeIndex === index ? 'bg-primary' : 'bg-muted-foreground/40 hover:bg-muted-foreground/70'
                }`}
                animate={{ scale: activeIndex === index ? 1.3 : 1 }}
                onClick={() => setPosition(loop ? index + 1 : index)}
                transition={{ duration: 0.15 }}
              />
            ))}
          </div>
          <button
            type="button"
            className={navButton}
            aria-label="Next feature"
            onClick={() => step(1)}
            disabled={!loop && position >= itemsForRender.length - 1}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {activeIndex + 1} / {items.length}
        </p>
      </section>
    </div>
  );
}
