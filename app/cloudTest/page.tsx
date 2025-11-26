'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const TakramCloudTest = dynamic(
  () => import('../../components/TakramCloudTest'),
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
        <div>🧪 Loading WebGPU Cloud Test...</div>
      </div>
    )
  }
);

export default function CloudTestPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>🧪 Initializing Cloud Test...</div>
      </div>
    }>
      <div style={{ width: '100%', height: '100vh' }}>
        <TakramCloudTest />
      </div>
    </Suspense>
  );
}

