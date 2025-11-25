'use client';

/**
 * Workaround for React DevTools compatibility with React 19
 * Ensures React version is properly exposed to DevTools extension
 * 
 * This addresses the "Invalid argument not valid semver ('' received)" error
 * that occurs when React DevTools tries to detect React 19's version.
 * 
 * React DevTools uses compareVersions library which expects a valid semver string.
 * React 19 changed how versions are exposed, so we need to ensure it's available
 * in multiple places that DevTools might check.
 * 
 * This must run BEFORE React Three Fiber registers with DevTools.
 */
import React from 'react';

if (typeof window !== 'undefined') {
  // Ensure React is available globally
  if (!(window as any).React) {
    (window as any).React = React;
  }
  
  // Expose React version in multiple ways that DevTools might check
  if (React && React.version && typeof React.version === 'string' && React.version.length > 0) {
    // Method 1: Direct window property (some DevTools versions check this)
    (window as any).__REACT_VERSION__ = React.version;
    
    // Method 2: On React object itself (if DevTools accesses window.React.version)
    if (!(window as any).React.version) {
      (window as any).React.version = React.version;
    }
  }
  
  // Patch DevTools hook early, before any renderers register
  // This intercepts registerRenderer calls and ensures version is always valid
  const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) {
    const originalRegisterRenderer = hook.registerRenderer;
    
    hook.registerRenderer = function(renderer: any) {
      // Ensure renderer has a valid version before registration
      if (renderer && (!renderer.version || renderer.version === '')) {
        // Use React.version if available, otherwise fallback
        if (React && React.version && typeof React.version === 'string') {
          renderer.version = React.version;
        } else {
          // Fallback to a valid semver matching React 19
          renderer.version = '19.0.0';
        }
      }
      
      // Call original registerRenderer if it exists
      if (originalRegisterRenderer) {
        return originalRegisterRenderer.apply(this, arguments);
      }
    };
    
    // Also patch any existing renderers that might have empty versions
    if (hook.renderers && Array.isArray(hook.renderers)) {
      hook.renderers.forEach((renderer: any) => {
        if (renderer && (!renderer.version || renderer.version === '')) {
          if (React && React.version && typeof React.version === 'string') {
            renderer.version = React.version;
          } else {
            renderer.version = '19.0.0';
          }
        }
      });
    }
  }
}

