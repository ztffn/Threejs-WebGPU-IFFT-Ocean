'use client';

import dynamic from 'next/dynamic';

const TilesAtmosphereTest = dynamic(
  () => import('../../components/TilesAtmosphereTest'),
  { ssr: false }
);

export default function AtmosphereTopologyPage() {
  return <TilesAtmosphereTest />;
}
