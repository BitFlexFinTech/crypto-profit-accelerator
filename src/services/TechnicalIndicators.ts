import { CandleData, IndicatorValue, MACDValue, BollingerBand } from '@/types/charts';

// Simple Moving Average
export function calculateSMA(data: CandleData[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({
      time: data[i].time,
      value: sum / period,
    });
  }
  
  return result;
}

// Exponential Moving Average
export function calculateEMA(data: CandleData[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    ema = (data[i].close - ema) * multiplier + ema;
    result.push({ time: data[i].time, value: ema });
  }
  
  return result;
}

// Relative Strength Index
export function calculateRSI(data: CandleData[], period: number = 14): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate initial averages
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    result.push({
      time: data[i + 1].time,
      value: rsi,
    });
  }
  
  return result;
}

// MACD (Moving Average Convergence Divergence)
export function calculateMACD(
  data: CandleData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDValue[] {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  const macdLine: { time: number; value: number }[] = [];
  
  // Calculate MACD line
  const offset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEMA.length; i++) {
    const fastValue = fastEMA[i + offset];
    if (fastValue) {
      macdLine.push({
        time: slowEMA[i].time,
        value: fastValue.value - slowEMA[i].value,
      });
    }
  }
  
  // Calculate signal line (EMA of MACD)
  const signalData: CandleData[] = macdLine.map(m => ({
    time: m.time,
    open: m.value,
    high: m.value,
    low: m.value,
    close: m.value,
  }));
  
  const signalLine = calculateEMA(signalData, signalPeriod);
  
  // Build result with histogram
  const result: MACDValue[] = [];
  const signalOffset = signalPeriod - 1;
  
  for (let i = 0; i < signalLine.length; i++) {
    const macdValue = macdLine[i + signalOffset];
    if (macdValue) {
      result.push({
        time: signalLine[i].time,
        macd: macdValue.value,
        signal: signalLine[i].value,
        histogram: macdValue.value - signalLine[i].value,
      });
    }
  }
  
  return result;
}

// Bollinger Bands
export function calculateBollingerBands(
  data: CandleData[],
  period: number = 20,
  stdDev: number = 2
): BollingerBand[] {
  const result: BollingerBand[] = [];
  const sma = calculateSMA(data, period);
  
  for (let i = period - 1; i < data.length; i++) {
    const smaIndex = i - (period - 1);
    const middle = sma[smaIndex].value;
    
    // Calculate standard deviation
    let sumSquares = 0;
    for (let j = 0; j < period; j++) {
      const diff = data[i - j].close - middle;
      sumSquares += diff * diff;
    }
    const std = Math.sqrt(sumSquares / period);
    
    result.push({
      time: data[i].time,
      upper: middle + stdDev * std,
      middle,
      lower: middle - stdDev * std,
    });
  }
  
  return result;
}

// Volume Weighted Average Price
export function calculateVWAP(data: CandleData[]): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;
  
  for (const candle of data) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 0;
    
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
    
    result.push({
      time: candle.time,
      value: cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice,
    });
  }
  
  return result;
}
