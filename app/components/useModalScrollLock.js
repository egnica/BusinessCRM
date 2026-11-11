"use client";

import { useEffect } from "react";

let locks = 0;
let restoreScroll = null;

export default function useModalScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    if (locks === 0) {
      const root = document.documentElement;
      const body = document.body;
      const previousRootOverflow = root.style.overflow;
      const previousBodyOverflow = body.style.overflow;
      const previousPadding = body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - root.clientWidth;

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
      }
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      restoreScroll = () => {
        root.style.overflow = previousRootOverflow;
        body.style.overflow = previousBodyOverflow;
        body.style.paddingRight = previousPadding;
      };
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0) {
        restoreScroll?.();
        restoreScroll = null;
      }
    };
  }, [enabled]);
}
