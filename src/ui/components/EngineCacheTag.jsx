import React from 'react';
import { Tag } from './Tag.jsx';
import { I } from '../icons.jsx';

/** Compact, keyboard-accessible opt-in for CRM Search bulk cache execution. */
export function EngineCacheTag({ active, busy = false, onChange }) {
  const title = active
    ? 'Using saved Page Engine data when available; click to fetch every page live'
    : 'Use saved Page Engine data when available; missing records still fetch live';
  return (
    <button
      type="button"
      aria-pressed={!!active}
      aria-label={active ? 'Disable cached page data' : 'Use cached page data'}
      title={title}
      disabled={busy}
      onClick={() => onChange?.(!active)}
      style={{
        appearance: 'none',
        border: 0,
        padding: 0,
        margin: 0,
        background: 'transparent',
        color: 'inherit',
        display: 'inline-flex',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.62 : 1,
      }}
    >
      <Tag
        size="sm"
        tone={active ? 'brand' : 'neutral'}
        icon={active ? <I.check /> : <I.save />}
        style={{ pointerEvents: 'none' }}
      >
        {busy ? 'Reading cache' : 'Use cache'}
      </Tag>
    </button>
  );
}

export default EngineCacheTag;
