'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const TakramAtmosphereOcean = dynamic(
  () => import('../../components/TakramAtmosphereOcean'),
  { 
    ssr: false,
    loading: () => (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>Loading WebGPU Ocean Simulation...</div>
      </div>
    )
  }
);

export default function TakramAtmosphereOceanPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>Initializing...</div>
      </div>
    }>
      <div style={{ width: '100%', height: '100vh' }}>
        <TakramAtmosphereOcean />
      </div>
    </Suspense>
  );
}

