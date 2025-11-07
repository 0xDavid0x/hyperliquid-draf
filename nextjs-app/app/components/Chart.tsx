'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  createChart, 
  ColorType, 
  IChartApi, 
  ISeriesApi, 
  UTCTimestamp,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  LineStyleOptions,
  SeriesOptionsCommon
} from 'lightweight-charts';
import { useHyperliquid } from '../contexts/HyperliquidContext';
import { SkeletonBox } from './Skeleton';
import { useCandleSnapshot } from '../hooks/useHyperliquidQueries';
import { useQueryClient } from '@tanstack/react-query';

interface ChartProps {
  coin?: string;
  walletAddress?: string;
}

export function Chart({ coin = 'BTC', walletAddress }: ChartProps) {
  const { readOnlySdk } = useHyperliquid();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'>[]>([]); // For indicators
  const [interval, setInterval] = useState<'1h' | '4h' | '1d'>('1h');
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [showIndicators, setShowIndicators] = useState(false);
  const [maPeriod, setMaPeriod] = useState<number>(20);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Prepare coin symbol for API call
  const coinSymbol = useMemo(() => {
    if (coin.includes('-USDC')) {
      return coin.replace('-USDC', '-PERP');
    } else if (!coin.includes('-PERP') && !coin.includes('-')) {
      return `${coin}-PERP`;
    }
    return coin;
  }, [coin]);

  // Use React Query to fetch candle data
  // Pass only coin and interval - startTime/endTime calculated inside hook
  const { data: candles, isLoading, error: queryError, refetch } = useCandleSnapshot(
    coinSymbol,
    interval,
    !!readOnlySdk && !!coinSymbol
  );

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0C130F' },
        textColor: '#888',
        fontSize: 11,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { 
          color: '#1b1b1b',
          visible: true,
          style: 0,
        },
        horzLines: { 
          color: '#1b1b1b',
          visible: true,
          style: 0,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#1b1b1b',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0C130F',
        },
        horzLine: {
          color: '#1b1b1b',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0C130F',
        },
      },
      rightPriceScale: {
        borderColor: '#1b1b1b',
        scaleMargins: {
          top: 0.05,
          bottom: 0.25,
        },
        entireTextOnly: false,
      },
      leftPriceScale: {
        visible: true,
        borderColor: '#1b1b1b',
        scaleMargins: {
          top: 0.75,
          bottom: 0.05,
        },
        entireTextOnly: false,
      },
      timeScale: {
        borderColor: '#1b1b1b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 4,
      },
    });

    chartRef.current = chart;

    // Create candlestick series (API v5: use CandlestickSeries constant)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#03c987',
      downColor: '#ff4d4f',
      borderVisible: false,
      wickUpColor: '#03c987',
      wickDownColor: '#ff4d4f',
      priceScaleId: 'right',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Create volume series on separate pane (API v5: use HistogramSeries constant)
    // Volume uses left price scale which is hidden
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#03c98780',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'left',
    });
    volumeSeriesRef.current = volumeSeries;
    
    // Configure volume scale margins
    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, []);

  // Calculate Moving Average helper
  const addMovingAverage = useCallback((candles: Array<{time: UTCTimestamp, close: number}>, period: number) => {
    if (!chartRef.current || candles.length < period) return;

    // Remove existing MA lines
    lineSeriesRef.current.forEach(series => {
      chartRef.current?.removeSeries(series);
    });
    lineSeriesRef.current = [];

    // Calculate MA
    const maData = [];
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      maData.push({
        time: candles[i].time,
        value: sum / period,
      });
    }

    // Add MA line
    const maSeries = chartRef.current.addSeries(LineSeries, {
      color: '#03c987',
      lineWidth: 2,
      priceScaleId: 'right',
      title: `MA${period}`,
    } as LineStyleOptions & SeriesOptionsCommon);
    maSeries.setData(maData);
    lineSeriesRef.current.push(maSeries);
  }, []);

  // Handle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!chartContainerRef.current) return;

    if (!isFullscreen) {
      if (chartContainerRef.current.requestFullscreen) {
        chartContainerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Zoom controls
  const handleZoom = useCallback((direction: 'in' | 'out' | 'reset') => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    if (direction === 'reset') {
      // Reset - fit all data
      timeScale.fitContent();
      return;
    }

    if (!visibleRange) return;

    const fromTime = typeof visibleRange.from === 'number' ? visibleRange.from : (visibleRange.from as any);
    const toTime = typeof visibleRange.to === 'number' ? visibleRange.to : (visibleRange.to as any);
    const range = toTime - fromTime;
    let newRange = range;

    if (direction === 'in') {
      newRange = range * 0.7;
    } else if (direction === 'out') {
      newRange = range * 1.3;
    }

    const center = (fromTime + toTime) / 2;
    timeScale.setVisibleRange({
      from: (center - newRange / 2) as UTCTimestamp,
      to: (center + newRange / 2) as UTCTimestamp,
    });
  }, []);

  // Format candles data for chart when data changes
  useEffect(() => {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
      return;
    }

    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    try {
      // Format data for lightweight-charts
      // Ensure data is sorted and has no duplicates
      const sortedCandles = [...candles].sort((a, b) => a.t - b.t);
      
      // Remove duplicates by time
      const uniqueCandles = sortedCandles.filter((candle, index, self) =>
        index === 0 || candle.t !== self[index - 1].t
      );

      const formattedCandles = uniqueCandles.map((candle) => ({
        time: Math.floor(candle.t / 1000) as UTCTimestamp, // Convert to seconds (must be integer)
        open: parseFloat(String(candle.o)),
        high: parseFloat(String(candle.h)),
        low: parseFloat(String(candle.l)),
        close: parseFloat(String(candle.c)),
      })).filter(c => c.close > 0 && c.open > 0 && c.high > 0 && c.low > 0); // Filter invalid data

      const formattedVolume = uniqueCandles.map((candle) => ({
        time: Math.floor(candle.t / 1000) as UTCTimestamp,
        value: parseFloat(String(candle.v || 0)),
        color: parseFloat(String(candle.c)) >= parseFloat(String(candle.o))
          ? '#03c98780'
          : '#ff4d4f80',
      })).filter(v => v.time !== undefined);

      // Update chart data
      candlestickSeriesRef.current.setData(formattedCandles);
      volumeSeriesRef.current.setData(formattedVolume);

      // Calculate and add indicators if enabled
      if (showIndicators && formattedCandles.length >= maPeriod) {
        addMovingAverage(formattedCandles, maPeriod);
      } else {
        // Remove indicators
        lineSeriesRef.current.forEach(series => {
          chartRef.current?.removeSeries(series);
        });
        lineSeriesRef.current = [];
      }

      // Fit content (only once after initialization)
      if (chartRef.current && !hasInitialized) {
        chartRef.current.timeScale().fitContent();
        setHasInitialized(true);
      }
    } catch (err) {
      console.error('Error processing candle data:', err);
    }
  }, [candles, showIndicators, maPeriod, addMovingAverage, hasInitialized]);

  // Buy/Sell markers feature disabled

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Resize chart when fullscreen changes
      if (chartRef.current && chartContainerRef.current) {
        setTimeout(() => {
          chartRef.current?.applyOptions({
            width: chartContainerRef.current?.clientWidth,
            height: chartContainerRef.current?.clientHeight,
          });
        }, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-[#0C130F] overflow-hidden">
      {/* Header - Compact with Controls */}
      <div className="flex items-center justify-end px-2.5 py-1.5 border-b border-[#1b1b1b] flex-shrink-0">
        {/* Controls - Compact */}
        <div className="flex items-center gap-1">
          {/* Chart Type Selector */}
          <div className="flex gap-0.5 bg-[#1b1b1b] rounded p-0.5">
            <button
              onClick={() => setChartType('candlestick')}
              className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
                chartType === 'candlestick'
                  ? 'bg-[#03c987] hover:bg-[#02b877] text-white'
                  : 'text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b]'
              }`}
              title="Candlestick"
            >
              📊
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
                chartType === 'line'
                  ? 'bg-[#03c987] hover:bg-[#02b877] text-white'
                  : 'text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b]'
              }`}
              title="Line"
            >
              📈
            </button>
          </div>

          {/* Interval Selector */}
          <div className="flex gap-0.5 bg-[#1b1b1b] rounded p-0.5">
            {(['1h', '4h', '1d'] as const).map((int) => (
              <button
                key={int}
                onClick={() => setInterval(int)}
                className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
                  interval === int
                    ? 'bg-[#03c987] hover:bg-[#02b877] text-white'
                    : 'text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b]'
                }`}
              >
                {int}
              </button>
            ))}
          </div>


          {/* Indicators Toggle */}
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
              showIndicators
                ? 'bg-[#03c987] hover:bg-[#02b877] text-white'
                : 'text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b] bg-[#1b1b1b]'
            }`}
            title="Show/Hide Indicators"
          >
            MA
          </button>

          {/* MA Period Selector */}
          {showIndicators && (
            <select
              value={maPeriod}
              onChange={(e) => setMaPeriod(Number(e.target.value))}
              className="px-1.5 py-0.5 text-xs bg-[#1b1b1b] text-[#c0c0c0] rounded border border-[#1b1b1b] focus:border-[#03c987] focus:outline-none"
            >
              <option value={10}>MA10</option>
              <option value={20}>MA20</option>
              <option value={50}>MA50</option>
              <option value={100}>MA100</option>
            </select>
          )}

          {/* Zoom Controls */}
          <div className="flex gap-0.5 bg-[#1b1b1b] rounded p-0.5">
            <button
              onClick={() => handleZoom('out')}
              className="px-1.5 py-0.5 text-xs text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b] rounded transition-all"
              title="Zoom Out"
            >
              ➖
            </button>
            <button
              onClick={() => handleZoom('reset')}
              className="px-1.5 py-0.5 text-xs text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b] rounded transition-all"
              title="Reset Zoom"
            >
              🔍
            </button>
            <button
              onClick={() => handleZoom('in')}
              className="px-1.5 py-0.5 text-xs text-[#888] hover:text-[#c0c0c0] hover:bg-[#1b1b1b] rounded transition-all"
              title="Zoom In"
            >
              ➕
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-[#888] hover:text-[#c0c0c0] transition-colors rounded hover:bg-[#1b1b1b]"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isFullscreen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              )}
            </svg>
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => refetch()}
            disabled={isLoading || !readOnlySdk}
            className="p-1 text-[#888] hover:text-[#c0c0c0] disabled:opacity-50 transition-colors rounded hover:bg-[#1b1b1b]"
            title="Refresh chart"
          >
            <svg
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart Content */}
      <div className="flex-1 relative min-h-0 overflow-hidden isolate">
        {!readOnlySdk ? (
          <div className="absolute inset-0 bg-[#0C130F]">
            <SkeletonBox width="100%" height="100%" />
          </div>
        ) : isLoading ? (
          <div className="absolute inset-0 bg-[#0C130F]">
            <SkeletonBox width="100%" height="100%" />
          </div>
        ) : queryError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C130F]">
            <div className="text-center">
              <p className="text-[#ff4d4f] mb-2 text-sm">
                {queryError instanceof Error ? queryError.message : 'Failed to fetch chart data'}
              </p>
            </div>
          </div>
        ) : null}
        
        <div ref={chartContainerRef} className="w-full h-full relative" />
      </div>
    </div>
  );
}
