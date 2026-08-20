"use client";

import { useEffect, useState } from "react";

interface TypewriterLineProps {
  text: string;
  skip?: boolean;
}

export function TypewriterLine({ text, skip = false }: TypewriterLineProps) {
  const [shown, setShown] = useState(skip ? text.length : 0);

  useEffect(() => {
    if (skip) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const charsPerTick = Math.max(1, Math.ceil(text.length / 40));
    const interval = setInterval(() => {
      setShown((prev) => {
        const next = prev + charsPerTick;
        if (next >= text.length) {
          clearInterval(interval);
          return text.length;
        }
        return next;
      });
    }, 12);
    return () => clearInterval(interval);
  }, [text, skip]);

  return <span>{text.slice(0, shown)}</span>;
}
