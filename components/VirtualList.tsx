import React, { useState, useRef, useEffect, useMemo } from "react";

interface VirtualListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (
    item: T,
    index: number,
    style: React.CSSProperties,
  ) => React.ReactNode;
  className?: string;
}

export const VirtualList = <T,>({
  items,
  height,
  itemHeight,
  renderItem,
  className,
}: VirtualListProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = items.length * itemHeight;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const startIndex = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(height / itemHeight);
  const endIndex = Math.min(items.length, startIndex + visibleCount + 1);

  const visibleItems = useMemo(() => {
    const result = [];
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const style: React.CSSProperties = {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${itemHeight}px`,
        transform: `translateY(${i * itemHeight}px)`,
      };
      result.push(renderItem(item, i, style));
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight, renderItem]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={className}
      style={{ height: `${height}px`, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: `${totalHeight}px`, position: "relative" }}>
        {visibleItems}
      </div>
    </div>
  );
};
