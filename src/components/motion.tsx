"use client";

import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";

const ease = [0.22, 0.61, 0.36, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease },
  },
};

export const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

type RevealProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children?: ReactNode;
  delay?: number;
};

export function Reveal({
  children,
  className,
  delay = 0,
  ...props
}: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={fadeUp}
      transition={{ delay, duration: 0.55, ease }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children?: ReactNode;
};

export function Stagger({ children, className, ...props }: StaggerProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={stagger}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Item({
  children,
  className,
  ...props
}: Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={fadeUp} {...props}>
      {children}
    </motion.div>
  );
}

export { motion };
