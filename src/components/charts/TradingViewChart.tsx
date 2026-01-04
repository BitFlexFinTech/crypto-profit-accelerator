import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import { CandleData, IndicatorValue, BollingerBand } from '@/types/charts';

interface TradingViewChartProps {
  data: CandleData[];
  height?: number;
  showVolume?: boolean;
  indicators?: {
    sma?: IndicatorValue[];
    ema?: IndicatorValue[];
    bollingerBands?: BollingerBand[];
  };
  onCrosshairMove?: (price: number | null, time: number | null) => void;
}

export function TradingViewChart({
  data,
  height = 400,
  showVolume = true,
  indicators = {},
  onCrosshairMove,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const getChartColors = useCallback(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    return {
      background: computedStyle.getPropertyValue('--background').trim() || '220 20% 6%',
      text: computedStyle.getPropertyValue('--foreground').trim() || '210 40% 98%',
      grid: computedStyle.getPropertyValue('--border').trim() || '220 20% 18%',
      profit: computedStyle.getPropertyValue('--chart-profit').trim() || '142 76% 45%',
      loss: computedStyle.getPropertyValue('--chart-loss').trim() || '0 72% 51%',
    };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = getChartColors();

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: `hsl(${colors.background})` },
        textColor: `hsl(${colors.text})`,
      },
      grid: {
        vertLines: { color: `hsl(${colors.grid})` },
        horzLines: { color: `hsl(${colors.grid})` },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: `hsl(${colors.text} / 0.5)`,
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: `hsl(${colors.text} / 0.5)`,
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: `hsl(${colors.grid})`,
        scaleMargins: {
          top: 0.1,
          bottom: showVolume ? 0.25 : 0.1,
        },
      },
      timeScale: {
        borderColor: `hsl(${colors.grid})`,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Create candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: `hsl(${colors.profit})`,
      downColor: `hsl(${colors.loss})`,
      borderUpColor: `hsl(${colors.profit})`,
      borderDownColor: `hsl(${colors.loss})`,
      wickUpColor: `hsl(${colors.profit})`,
      wickDownColor: `hsl(${colors.loss})`,
    });
    candleSeriesRef.current = candleSeries;

    // Create volume series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: `hsl(${colors.profit} / 0.5)`,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      
      volumeSeriesRef.current = volumeSeries;
    }

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.size > 0) {
        const data = param.seriesData.get(candleSeries);
        if (data && 'close' in data) {
          setCurrentPrice(data.close);
          onCrosshairMove?.(data.close, param.time as number);
        }
      } else {
        setCurrentPrice(null);
        onCrosshairMove?.(null, null);
      }
    });

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, showVolume, getChartColors, onCrosshairMove]);

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !data.length) return;

    const colors = getChartColors();
    
    candleSeriesRef.current.setData(
      data.map((d) => ({
        time: d.time as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    if (volumeSeriesRef.current && showVolume) {
      volumeSeriesRef.current.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.volume || 0,
          color: d.close >= d.open 
            ? `hsl(${colors.profit} / 0.5)` 
            : `hsl(${colors.loss} / 0.5)`,
        }))
      );
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [data, showVolume, getChartColors]);

  // Add SMA indicator
  useEffect(() => {
    if (!chartRef.current || !indicators.sma?.length) return;

    const smaSeries = chartRef.current.addSeries(LineSeries, {
      color: '#FFA500',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    smaSeries.setData(
      indicators.sma.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
    );

    return () => {
      chartRef.current?.removeSeries(smaSeries);
    };
  }, [indicators.sma]);

  // Add EMA indicator
  useEffect(() => {
    if (!chartRef.current || !indicators.ema?.length) return;

    const emaSeries = chartRef.current.addSeries(LineSeries, {
      color: '#00CED1',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    emaSeries.setData(
      indicators.ema.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
    );

    return () => {
      chartRef.current?.removeSeries(emaSeries);
    };
  }, [indicators.ema]);

  // Add Bollinger Bands
  useEffect(() => {
    if (!chartRef.current || !indicators.bollingerBands?.length) return;

    const upperSeries = chartRef.current.addSeries(LineSeries, {
      color: 'rgba(76, 175, 80, 0.5)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const middleSeries = chartRef.current.addSeries(LineSeries, {
      color: 'rgba(156, 39, 176, 0.7)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const lowerSeries = chartRef.current.addSeries(LineSeries, {
      color: 'rgba(244, 67, 54, 0.5)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    upperSeries.setData(
      indicators.bollingerBands.map((d) => ({ time: d.time as UTCTimestamp, value: d.upper }))
    );
    middleSeries.setData(
      indicators.bollingerBands.map((d) => ({ time: d.time as UTCTimestamp, value: d.middle }))
    );
    lowerSeries.setData(
      indicators.bollingerBands.map((d) => ({ time: d.time as UTCTimestamp, value: d.lower }))
    );

    return () => {
      chartRef.current?.removeSeries(upperSeries);
      chartRef.current?.removeSeries(middleSeries);
      chartRef.current?.removeSeries(lowerSeries);
    };
  }, [indicators.bollingerBands]);

  return (
    <div className="relative w-full">
      {currentPrice && (
        <div className="absolute top-2 right-2 z-10 bg-card/90 px-2 py-1 rounded text-sm font-mono text-foreground">
          ${currentPrice.toFixed(2)}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
