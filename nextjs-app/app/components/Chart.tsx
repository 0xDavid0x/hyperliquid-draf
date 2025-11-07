'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Hyperliquid } from 'hyperliquid';

interface ChartProps {
  coin?: string;
  sdk?: Hyperliquid | null;
}

const TESTNET = true;

export function Chart({ coin = 'BTC', sdk: providedSdk }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'>[]>([]); // For indicators
  const [interval, setInterval] = useState<'1h' | '4h' | '1d'>('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<Hyperliquid | null>(providedSdk || null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<{ value: number; percent: number } | null>(null);
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [showIndicators, setShowIndicators] = useState(false);
  const [maPeriod, setMaPeriod] = useState<number>(20);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize SDK if not provided
  useEffect(() => {
    if (providedSdk) {
      setSdk(providedSdk);
    } else {
      const initializeSDK = async () => {
        try {
          const hyperliquid = new Hyperliquid({
            testnet: TESTNET,
            enableWs: false,
          });
          await hyperliquid.connect();
          await hyperliquid.ensureInitialized();
          setSdk(hyperliquid);
        } catch (error) {
          console.error('Error initializing SDK:', error);
          setError('Failed to initialize SDK');
        }
      };
      initializeSDK();
    }
  }, [providedSdk]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { 
          color: '#2a2a2a',
          visible: true,
          style: 0,
        },
        horzLines: { 
          color: '#2a2a2a',
          visible: true,
          style: 0,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#4b5563',
          width: 1,
          style: 3,
          labelBackgroundColor: '#374151',
        },
        horzLine: {
          color: '#4b5563',
          width: 1,
          style: 3,
          labelBackgroundColor: '#374151',
        },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: {
          top: 0.05,
          bottom: 0.25,
        },
        entireTextOnly: false,
      },
      leftPriceScale: {
        visible: true,
        borderColor: '#2a2a2a',
        scaleMargins: {
          top: 0.75,
          bottom: 0.05,
        },
        entireTextOnly: false,
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 4,
      },
    });

    chartRef.current = chart;

    // Create candlestick series (API v5: use CandlestickSeries constant)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceScaleId: 'right',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Create volume series on separate pane (API v5: use HistogramSeries constant)
    // Volume uses left price scale which is hidden
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a80',
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
      color: '#ff9800',
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

  const fetchCandleData = useCallback(async () => {
    if (!sdk || !candlestickSeriesRef.current || !volumeSeriesRef.current) {
      if (!sdk) {
        setError('SDK not initialized');
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = Date.now();
      let daysBack = 1;
      if (interval === '4h') {
        daysBack = 7;
      } else if (interval === '1d') {
        daysBack = 30;
      }
      const startTime = now - (daysBack * 24 * 60 * 60 * 1000);

      // Ensure coin has -PERP suffix for API call (coin might come as BTC-PERP or BTC-USDC)
      let coinSymbol = coin;
      if (coin.includes('-USDC')) {
        coinSymbol = coin.replace('-USDC', '-PERP');
      } else if (!coin.includes('-PERP') && !coin.includes('-')) {
        coinSymbol = `${coin}-PERP`;
      }
      
      const candles = await sdk.info.getCandleSnapshot(
        coinSymbol,
        interval,
        startTime,
        now
      );

      if (candles && Array.isArray(candles) && candles.length > 0) {
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
            ? '#26a69a80'
            : '#ef535080',
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

        // Calculate price change
        if (formattedCandles.length > 0) {
          const firstPrice = formattedCandles[0].close;
          const lastPrice = formattedCandles[formattedCandles.length - 1].close;
          const change = lastPrice - firstPrice;
          const changePercent = (change / firstPrice) * 100;

          setCurrentPrice(lastPrice);
          setPriceChange({
            value: change,
            percent: changePercent,
          });
        }

        // Fit content
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } else {
        throw new Error('No candle data received');
      }
    } catch (err) {
      console.error('Error fetching candle data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
    } finally {
      setLoading(false);
    }
  }, [sdk, coin, interval, showIndicators, maPeriod, addMovingAverage]);

  useEffect(() => {
    if (sdk && candlestickSeriesRef.current && volumeSeriesRef.current) {
      fetchCandleData();
      const intervalId = window.setInterval(() => {
        fetchCandleData();
      }, 60000);
      return () => {
        window.clearInterval(intervalId);
      };
    }
  }, [sdk, coin, interval, fetchCandleData]);

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

  const formatPrice = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const isPositive = priceChange ? priceChange.percent >= 0 : true;

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a] rounded-lg shadow-xl border border-gray-800 overflow-hidden">
      {/* Header - Compact */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-white">
            {coin.includes('-PERP') ? coin.replace('-PERP', '-USDC') : coin.includes('-') ? coin : `${coin}-USDC`}
          </h2>
          {currentPrice !== null && (
            <>
              <span className="text-lg font-bold text-white">
                {formatPrice(currentPrice)}
              </span>
              {priceChange && (
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    isPositive
                      ? 'text-green-400 bg-green-400/10'
                      : 'text-red-400 bg-red-400/10'
                  }`}
                >
                  {isPositive ? '+' : ''}{priceChange.percent.toFixed(2)}%
                </span>
              )}
            </>
          )}
        </div>

        {/* Controls - Compact */}
        <div className="flex items-center gap-1.5">
          {/* Chart Type Selector */}
          <div className="flex gap-0.5 bg-gray-800/50 rounded p-0.5">
            <button
              onClick={() => setChartType('candlestick')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                chartType === 'candlestick'
                  ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
              title="Candlestick"
            >
              📊
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                chartType === 'line'
                  ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
              title="Line"
            >
              📈
            </button>
          </div>

          {/* Interval Selector */}
          <div className="flex gap-0.5 bg-gray-800/50 rounded p-0.5">
            {(['1h', '4h', '1d'] as const).map((int) => (
              <button
                key={int}
                onClick={() => setInterval(int)}
                className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                  interval === int
                    ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {int}
              </button>
            ))}
          </div>

          {/* Indicators Toggle */}
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-2 py-1 text-xs font-medium rounded transition-all ${
              showIndicators
                ? 'bg-[#00C4B4] hover:bg-[#00B8A8] text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50 bg-gray-800/50'
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
              className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded border border-gray-700 focus:border-blue-600 focus:outline-none"
            >
              <option value={10}>MA10</option>
              <option value={20}>MA20</option>
              <option value={50}>MA50</option>
              <option value={100}>MA100</option>
            </select>
          )}

          {/* Zoom Controls */}
          <div className="flex gap-0.5 bg-gray-800/50 rounded p-0.5">
            <button
              onClick={() => handleZoom('out')}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all"
              title="Zoom Out"
            >
              ➖
            </button>
            <button
              onClick={() => handleZoom('reset')}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all"
              title="Reset Zoom"
            >
              🔍
            </button>
            <button
              onClick={() => handleZoom('in')}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all"
              title="Zoom In"
            >
              ➕
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-gray-800/50"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            <svg
              className="w-4 h-4"
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
            onClick={fetchCandleData}
            disabled={loading || !sdk}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50 transition-colors rounded hover:bg-gray-800/50"
            title="Refresh chart"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
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
      <div className="flex-1 relative min-h-0 -mx-1">
        {!sdk ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <svg
                className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-400">Initializing SDK...</p>
            </div>
          </div>
        ) : loading && currentPrice === null ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <svg
                className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-400">Loading chart data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <button
                onClick={fetchCandleData}
                className="px-4 py-2 bg-[#00C4B4] hover:bg-[#00B8A8] text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}
        
        <div ref={chartContainerRef} className="w-full h-full px-1" />
      </div>
    </div>
  );
}
