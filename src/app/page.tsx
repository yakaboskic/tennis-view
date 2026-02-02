'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SPORTS_CONFIG, Sport } from '@/lib/courts';

interface TimeSlot {
  time: string;
  startTime: string;
  endTime: string;
  spots: number;
  available: boolean;
}

interface SlotData {
  spots: number;
  courtsAvailable: number;
  available: boolean;
}

interface WeeklyView {
  dates: string[];
  times: string[];
  matrix: Record<string, Record<string, SlotData>>;
}

interface CourtData {
  courtId: string;
  courtName: string;
  availability: Record<string, TimeSlot[]>;
  error?: string;
}

interface AvailabilityResponse {
  courts: CourtData[];
  weeklyView: WeeklyView;
  timestamp: string;
  scrapeDuration?: string;
  stats?: {
    totalTasks: number;
    successful: number;
    dates: number;
    timeSlots: number;
  };
}

interface SelectedSlot {
  time: string;
  date: string;
  courts: { courtId: string; courtName: string; spots: number }[];
}

function formatDateHeader(dateStr: string): { day: string; date: string } {
  const parts = dateStr.split(' ');
  const dayName = parts[0]?.substring(0, 3) || '';
  const month = parts[1]?.substring(0, 3) || '';
  const dayNum = parts[2] || '';

  return {
    day: dayName,
    date: `${month} ${dayNum}`
  };
}

function getReservationUrl(courtId: string): string {
  return `https://membership.gocrimson.com/Program/GetProgramDetails?courseId=${courtId}`;
}

export default function Home() {
  const [sport, setSport] = useState<Sport>('tennis');
  const [dataCache, setDataCache] = useState<Partial<Record<Sport, AvailabilityResponse>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sportRef = useRef<Sport>(sport);

  // Current data is whatever is cached for the selected sport
  const data = dataCache[sport] || null;

  // Keep sportRef in sync with sport state
  useEffect(() => {
    sportRef.current = sport;
  }, [sport]);

  const fetchAvailability = useCallback(async (selectedSport: Sport) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/availability?sport=${selectedSport}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setDataCache(prev => ({ ...prev, [selectedSport]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  // Background refresh - uses ref to always get current sport
  const backgroundFetch = useCallback(async () => {
    setBackgroundRefreshing(true);
    const currentSport = sportRef.current;

    try {
      const response = await fetch(`/api/availability?sport=${currentSport}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setDataCache(prev => ({ ...prev, [currentSport]: result }));
    } catch (err) {
      console.error('Background refresh failed:', err);
      // Don't set error state for background refreshes
    } finally {
      setBackgroundRefreshing(false);
    }
  }, []);

  // Calculate the next refresh time (hour+1min or half-hour+1min)
  const getNextRefreshTime = useCallback(() => {
    const now = new Date();
    const minutes = now.getMinutes();
    const nextRefreshDate = new Date(now);

    if (minutes < 1) {
      // Before :01, next refresh is at :01 this hour
      nextRefreshDate.setMinutes(1, 0, 0);
    } else if (minutes < 31) {
      // Between :01 and :31, next refresh is at :31 this hour
      nextRefreshDate.setMinutes(31, 0, 0);
    } else {
      // After :31, next refresh is at :01 next hour
      nextRefreshDate.setHours(nextRefreshDate.getHours() + 1);
      nextRefreshDate.setMinutes(1, 0, 0);
    }

    return nextRefreshDate;
  }, []);

  // Schedule the next auto-refresh
  const scheduleNextRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    const nextTime = getNextRefreshTime();
    setNextRefresh(nextTime);

    const msUntilRefresh = nextTime.getTime() - Date.now();

    refreshTimeoutRef.current = setTimeout(() => {
      backgroundFetch().then(() => {
        // Schedule the next one after this refresh completes
        scheduleNextRefresh();
      });
    }, msUntilRefresh);
  }, [getNextRefreshTime, backgroundFetch]);

  // Initial mount: fetch initial sport and set up auto-refresh
  useEffect(() => {
    fetchAvailability(sport);
    scheduleNextRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle sport change - just switch, don't refetch (use cached data)
  const handleSportChange = (newSport: Sport) => {
    if (newSport !== sport) {
      setSport(newSport);
      setError(null); // Clear any previous errors
    }
  };

  const handleSlotClick = (time: string, date: string) => {
    if (!data) return;

    // Find all courts that have this time slot on this date
    const courtsWithSlots: { courtId: string; courtName: string; spots: number }[] = [];

    for (const court of data.courts) {
      const slots = court.availability[date] || [];
      const slot = slots.find(s => s.time === time);
      if (slot) {
        courtsWithSlots.push({
          courtId: court.courtId,
          courtName: court.courtName,
          spots: slot.spots
        });
      }
    }

    setSelectedSlot({ time, date, courts: courtsWithSlots });
    setDialogOpen(true);
  };

  const weeklyView = data?.weeklyView;

  // Filter times to only show rows with at least one available spot
  const filteredTimes = weeklyView?.times.filter(time => {
    if (!showOnlyAvailable) return true;
    // Check if any date has available spots for this time
    return weeklyView.dates.some(date => {
      const cell = weeklyView.matrix[time]?.[date];
      return cell && cell.spots > 0;
    });
  }) || [];

  const sportConfig = SPORTS_CONFIG[sport];
  const courtCount = sportConfig.courts.length;

  return (
    <main className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-red-800 mb-2">
        Harvard Rec {sportConfig.name} Court Availability
      </h1>
      <p className="text-muted-foreground mb-4">
        {sport === 'tennis' ? 'Murr Tennis Center' : 'Murr Center Squash Courts'} - All {courtCount} courts at a glance. Click on any slot to see court details.
      </p>

      {/* Sport Selector */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
        {(Object.keys(SPORTS_CONFIG) as Sport[]).map((s) => (
          <button
            key={s}
            onClick={() => handleSportChange(s)}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              sport === s
                ? 'bg-red-800 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {SPORTS_CONFIG[s].name}
          </button>
        ))}
      </div>

      <Button
        onClick={() => fetchAvailability(sport)}
        disabled={loading}
        className="mb-4 bg-red-800 hover:bg-red-900 text-white"
      >
        {loading ? 'Scraping courts...' : 'Refresh Availability'}
      </Button>

      {data && (
        <div className="text-muted-foreground text-sm mb-6 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Last updated: {new Date(data.timestamp).toLocaleString()}
            {data.scrapeDuration && ` (took ${data.scrapeDuration})`}
          </span>
          {backgroundRefreshing && (
            <span className="flex items-center gap-1 text-amber-600">
              <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              Refreshing in background...
            </span>
          )}
          {!backgroundRefreshing && nextRefresh && (
            <span className="text-xs">
              Auto-refresh at {nextRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <div className="inline-block w-10 h-10 border-4 border-muted border-t-red-800 rounded-full animate-spin mb-4"></div>
          <div className="text-muted-foreground">Fetching {sportConfig.name.toLowerCase()} court availability...</div>
          <div className="text-muted-foreground/70 text-sm mt-2">
            Scraping all {courtCount} courts × 7 days in parallel
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {weeklyView && !loading && weeklyView.dates.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnlyAvailable}
              onChange={(e) => setShowOnlyAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-red-800 focus:ring-red-800"
            />
            <span className="text-sm font-medium">Show only times with availability</span>
          </label>
          {showOnlyAvailable && (
            <span className="text-xs text-muted-foreground">
              ({filteredTimes.length} of {weeklyView.times.length} time slots)
            </span>
          )}
        </div>
      )}

      {weeklyView && !loading && weeklyView.dates.length > 0 && filteredTimes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-card rounded-xl overflow-hidden shadow-lg">
            <thead>
              <tr>
                <th className="bg-red-900 text-white p-3 text-left font-semibold">
                  Time
                </th>
                {weeklyView.dates.map(date => {
                  const { day, date: dateStr } = formatDateHeader(date);
                  return (
                    <th key={date} className="bg-red-800 text-white p-3 text-center">
                      <div className="font-bold">{day}</div>
                      <div className="text-xs opacity-90">{dateStr}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredTimes.map((time, idx) => (
                <tr key={time} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="p-3 font-semibold bg-muted/50 border-r border-border">
                    {time}
                  </td>
                  {weeklyView.dates.map(date => {
                    const cell = weeklyView.matrix[time]?.[date];
                    if (!cell) {
                      return (
                        <td key={date} className="p-3 text-center text-muted-foreground">
                          -
                        </td>
                      );
                    }

                    let bgColor = 'bg-red-100 hover:bg-red-200';
                    let textColor = 'text-red-800';
                    if (cell.spots > 2) {
                      bgColor = 'bg-green-100 hover:bg-green-200';
                      textColor = 'text-green-800';
                    } else if (cell.spots > 0) {
                      bgColor = 'bg-amber-100 hover:bg-amber-200';
                      textColor = 'text-amber-800';
                    }

                    return (
                      <td
                        key={date}
                        className={`p-3 text-center ${bgColor} ${textColor} border border-border/50 cursor-pointer transition-colors`}
                        onClick={() => handleSlotClick(time, date)}
                      >
                        <div className="text-2xl font-bold">{cell.spots}</div>
                        <div className="text-xs uppercase opacity-80">
                          {cell.spots === 0 ? 'full' : cell.spots === 1 ? 'spot' : 'spots'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="bg-muted/50 border border-border p-6 rounded-lg text-center">
          <p className="text-muted-foreground mb-3">
            No {sportConfig.name.toLowerCase()} data loaded yet.
          </p>
          <Button
            onClick={() => fetchAvailability(sport)}
            className="bg-red-800 hover:bg-red-900 text-white"
          >
            Load {sportConfig.name} Availability
          </Button>
        </div>
      )}

      {weeklyView && !loading && weeklyView.dates.length === 0 && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg">
          No availability data found. The scraper may need adjustment.
        </div>
      )}

      {weeklyView && !loading && weeklyView.dates.length > 0 && filteredTimes.length === 0 && showOnlyAvailable && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg">
          No time slots with availability found. Try unchecking the filter to see all times.
        </div>
      )}

      <div className="mt-10 p-4 bg-muted/50 rounded-lg text-sm">
        <strong>How to use:</strong> The numbers show total available spots across all {courtCount} {sportConfig.name.toLowerCase()} courts.
        <span className="inline-block w-3 h-3 bg-green-200 rounded ml-2"></span> Many spots
        <span className="inline-block w-3 h-3 bg-amber-200 rounded ml-2"></span> Limited
        <span className="inline-block w-3 h-3 bg-red-200 rounded ml-2"></span> Full
        <span className="ml-4">Click any cell to see which courts have availability.</span>
      </div>

      {/* Slot Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSlot?.time}
            </DialogTitle>
            <DialogDescription>
              {selectedSlot && formatDateHeader(selectedSlot.date).day} {formatDateHeader(selectedSlot?.date || '').date}, 2026
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {selectedSlot?.courts.map(court => (
              <div
                key={court.courtId}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{court.courtName}</span>
                  <Badge variant={court.spots > 0 ? "default" : "secondary"}>
                    {court.spots > 0 ? `${court.spots} spot${court.spots > 1 ? 's' : ''}` : 'Full'}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant={court.spots > 0 ? "default" : "outline"}
                  asChild
                >
                  <a
                    href={getReservationUrl(court.courtId)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {court.spots > 0 ? 'Reserve' : 'View'}
                  </a>
                </Button>
              </div>
            ))}

            {selectedSlot?.courts.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                No courts have this time slot available.
              </p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Clicking Reserve/View will take you to the Harvard Recreation booking page for that court.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
