import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate as animateValue } from 'motion/react';

/**
 * NumberDisplay — a number that animates (counts up or down) when its value
 * changes. For computed results, slider value pills, live metrics.
 *
 * The tween runs on a Motion value, so each frame updates the DOM text
 * directly — no React re-render per frame.
 *
 * Props:
 *   value     the number to show
 *   animate   tween on change? default true — pass `false` to snap instantly
 *   duration  tween length in seconds (default 0.4)
 *   decimals  fixed decimal places (default 0)
 *   prefix    leading string, e.g. '$'
 *   suffix    trailing string, e.g. '%'
 *   format    (n) => string — full custom formatter; overrides decimals/prefix/suffix
 */
export function NumberDisplay({
  value = 0,
  animate = true,
  duration = 0.4,
  decimals = 0,
  prefix = '',
  suffix = '',
  format,
  style,
}) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const mv = useMotionValue(target);

  const text = useTransform(mv, (n) => {
    if (format) return format(n);
    const body = Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${prefix}${body}${suffix}`;
  });

  useEffect(() => {
    if (!animate) {
      mv.set(target);
      return undefined;
    }
    // animate() picks up from the current value, so rapid changes chase smoothly
    const controls = animateValue(mv, target, { duration, ease: [0.4, 0, 0.2, 1] });
    return () => controls.stop();
  }, [target, animate, duration, mv]);

  return (
    <motion.span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {text}
    </motion.span>
  );
}
