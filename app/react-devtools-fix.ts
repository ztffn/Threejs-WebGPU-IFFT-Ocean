'use client';

/**
 * Workaround for React DevTools compatibility with React 19
 * Ensures React version is properly exposed to DevTools extension
 * 
 * This addresses the "Invalid argument not valid semver ('' received)" error
 * that occurs when React DevTools tries to detect React 19's version.
 */
import React from 'react';

if (typeof window !== 'undefined') {
  // Expose React version to DevTools
  if (React && React.version) {
    (window as any).__REACT_VERSION__ = React.version;
  }
}

