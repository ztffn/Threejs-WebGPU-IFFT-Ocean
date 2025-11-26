'use client';

import { useEffect, useRef } from 'react';
import { useControls } from 'leva';
import Stats from 'three/addons/libs/stats.module.js';

export default function StatsMonitor() {
  const { enableStats } = useControls('Performance Stats', {
    enableStats: { value: true, label: 'Show Performance Stats' }
  });

  const statsRef = useRef<Stats | undefined>(undefined);

  useEffect(() => {
    if (!enableStats) {
      if (statsRef.current) {
        document.body.removeChild(statsRef.current.dom);
        statsRef.current = undefined;
      }
      return;
    }

    // Create stats instance
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    
    // Style the stats panel
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '10px';
    stats.dom.style.left = '10px';
    stats.dom.style.zIndex = '1000';
    
    // Add to DOM
    document.body.appendChild(stats.dom);
    
    // Store reference
    statsRef.current = stats;
    
    // Animation loop
    function animate() {
      if (statsRef.current) {
        statsRef.current.begin();
        statsRef.current.end();
        requestAnimationFrame(animate);
      }
    }
    animate();
    
    console.log('✅ Three.js Stats monitor enabled');
    
    return () => {
      if (statsRef.current) {
        document.body.removeChild(statsRef.current.dom);
        statsRef.current = undefined;
        console.log('❌ Three.js Stats monitor disabled');
      }
    };
  }, [enableStats]);

  return null; // This component only manages the stats display
}