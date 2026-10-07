"use client";
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

export default function UIMotionProvider({children}: {children: ReactNode}) {
  return <MotionConfig reducedMotion="user" transition={{duration: .24, ease: [.22, 1, .36, 1]}}>{children}</MotionConfig>;
}
