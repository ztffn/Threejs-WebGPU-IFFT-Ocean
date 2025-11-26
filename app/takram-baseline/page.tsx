'use client';

import dynamic from 'next/dynamic';

const TakramAtmosphereBaseline = dynamic(
  () => import('../../components/TakramAtmosphereBaseline'),
  { ssr: false }
);

export default function TakramBaselinePage() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <TakramAtmosphereBaseline />
    </div>
  );
}