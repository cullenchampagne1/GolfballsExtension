import React from 'react';
import { Callout } from './Callout.jsx';

/** Shared warning shown anywhere an active CRM filter depends on local cache. */
export function CacheQueryNotice({ style }) {
  return (
    <Callout tone="warning" title="Cached records only" style={style}>
      Page Engine match rules search only Contacts and Accounts already cached on this device.
      {' '}Records that have not been cached are excluded.
    </Callout>
  );
}
