import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ColorType,
  LineStyle,
  LineSeries,
  UTCTimestamp,
} from 'lightweight-charts';
import { IndicatorValue } from '@/types/charts';

interface RSIChartProps {
  data: IndicatorValue[];
  height?: number;
}

export function RSIChart({ data, height = 100 }: RSIChartProps) {
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
        scaleMargins: { top: 0.1, bottom: 0.1 },
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

    // RSI line
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#9C27B0',
      lineWidth: 2,
      priceLineVisible: false,
    });

    // Overbought line (70)
    const overboughtSeries = chart.addSeries(LineSeries, {
      color: 'rgba(244, 67, 54, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Oversold line (30)
    const oversoldSeries = chart.addSeries(LineSeries, {
      color: 'rgba(76, 175, 80, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    if (data.length > 0) {
      rsiSeries.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      
      // Create horizontal lines for overbought/oversold
      overboughtSeries.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: 70 })));
      oversoldSeries.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: 30 })));
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
        <span>RSI (14)</span>
        {data.length > 0 && (
          <span className={
            data[data.length - 1].value > 70 
              ? 'text-destructive' 
              : data[data.length - 1].value < 30 
                ? 'text-primary' 
                : 'text-muted-foreground'
          }>
            {data[data.length - 1].value.toFixed(2)}
          </span>
        )}
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
