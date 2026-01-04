import { useState } from 'react';
import { PriceChart } from '@/components/charts/PriceChart';

export default function ChartsPage() {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Charts</h1>
      </div>

      <PriceChart 
        fullscreen={fullscreen} 
        onToggleFullscreen={() => setFullscreen(!fullscreen)} 
      />
    </div>
  );
}
