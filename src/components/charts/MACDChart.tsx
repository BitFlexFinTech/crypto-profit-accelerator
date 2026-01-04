import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ColorType,
  LineStyle,
  LineSeries,
  HistogramSeries,
  UTCTimestamp,
} from 'lightweight-charts';
import { MACDValue } from '@/types/charts';

interface MACDChartProps {
  data: MACDValue[];
  height?: number;
}

export function MACDChart({ data, height = 100 }: MACDChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'hsl(220 10% 60%)',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'hsl(220 20% 18%)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      timeScale: {
        visible: false,
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { visible: false },
      },
    });

    chartRef.current = chart;

    // Histogram
    const histogramSeries = chart.addSeries(HistogramSeries, {
      color: 'hsl(142 76% 45%)',
      priceLineVisible: false,
    });

    // MACD line
    const macdSeries = chart.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Signal line
    const signalSeries = chart.addSeries(LineSeries, {
      color: '#FF9800',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    if (data.length > 0) {
      histogramSeries.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.histogram,
          color: d.histogram >= 0 
            ? 'hsl(142 76% 45% / 0.7)' 
            : 'hsl(0 72% 51% / 0.7)',
        }))
      );
      
      macdSeries.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.macd })));
      signalSeries.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.signal })));
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, height]);

  return (
    <div className="w-full">
      <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
        <span>MACD (12, 26, 9)</span>
        {data.length > 0 && (
          <span className={
            data[data.length - 1].histogram >= 0 
              ? 'text-primary' 
              : 'text-destructive'
          }>
            {data[data.length - 1].histogram.toFixed(4)}
          </span>
        )}
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
