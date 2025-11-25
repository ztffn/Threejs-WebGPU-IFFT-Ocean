'use client';

import dynamic from 'next/dynamic';

const TakramAtmosphereOcean = dynamic(
  () => import('../../components/TakramAtmosphereOcean'),
  { ssr: false }
);

export default function TakramAtmosphereOceanPage() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <TakramAtmosphereOcean />
    </div>
  );
}

