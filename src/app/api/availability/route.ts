import { NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer';
import { SPORTS_CONFIG, Sport, Court } from '@/lib/courts';

const BASE_URL = 'https://membership.gocrimson.com/Program/GetProgramDetails';

interface TimeSlot {
  time: string;
  startTime: string;
  endTime: string;
  spots: number;
  available: boolean;
}

interface CourtAvailability {
  courtId: string;
  courtName: string;
  availability: Record<string, TimeSlot[]>;
  error?: string;
}

function log(message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`);
}

async function scrapeCourtDate(
  browser: Browser,
  courtId: string,
  courtName: string,
  dateIndex: number
): Promise<{ courtId: string; courtName: string; date: string | null; slots: TimeSlot[] }> {
  const page = await browser.newPage();

  try {
    const url = `${BASE_URL}?courseId=${courtId}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.waitForSelector('.single-date-select-one-click', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 300));

    const clickResult = await page.evaluate((idx) => {
      const buttons = document.querySelectorAll('.single-date-select-one-click.single-date-select-button');
      if (idx >= buttons.length) {
        return { success: false, dateLabel: null, count: buttons.length };
      }

      const btn = buttons[idx] as HTMLElement;
      const btnText = btn.textContent || '';

      const dateMatch = btnText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{1,2}),\s*(\d{4})/i);

      let dateLabel: string | null = null;
      if (dateMatch) {
        dateLabel = `${dateMatch[1].toUpperCase()} ${dateMatch[2].toUpperCase()} ${dateMatch[3]} ${dateMatch[4]}`;
      }

      btn.click();
      return { success: true, dateLabel, count: buttons.length };
    }, dateIndex);

    if (!clickResult.success || !clickResult.dateLabel) {
      await page.close();
      return { courtId, courtName, date: null, slots: [] };
    }

    await new Promise(r => setTimeout(r, 1000));

    const slots = await page.evaluate(() => {
      const slots: { time: string; startTime: string; endTime: string; spots: number; available: boolean }[] = [];
      const text = document.body.innerText;
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const timeMatch = line.match(/^(\d{1,2}:\d{2}\s*(AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(AM|PM))$/i);
        if (timeMatch) {
          const nextLines = lines.slice(i + 1, i + 5).join(' ');
          let spots = 0;

          if (nextLines.includes('No Spots Left') || nextLines.includes('Full')) {
            spots = 0;
          } else {
            const spotMatch = nextLines.match(/(\d+)\s*Spots?\s*Left/i);
            if (spotMatch) {
              spots = parseInt(spotMatch[1]);
            }
          }

          slots.push({
            time: `${timeMatch[1]} - ${timeMatch[3]}`,
            startTime: timeMatch[1],
            endTime: timeMatch[3],
            spots,
            available: spots > 0
          });
        }
      }
      return slots;
    });

    const parts = clickResult.dateLabel.split(' ');
    const shortDate = `${parts[0].substring(0, 3)} ${parts[1].substring(0, 3)} ${parts[2]}`;

    log(`✓ ${courtName.padEnd(20)} | ${shortDate.padEnd(12)} | ${slots.length} slots`);

    await page.close();
    return { courtId, courtName, date: clickResult.dateLabel, slots };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'unknown';
    log(`✗ ${courtName.padEnd(20)} | Date ${dateIndex + 1} | Error: ${errMsg}`);
    await page.close();
    return { courtId, courtName, date: null, slots: [] };
  }
}

async function discoverDates(browser: Browser, courts: Court[]): Promise<string[]> {
  const page = await browser.newPage();

  try {
    await page.goto(`${BASE_URL}?courseId=${courts[0].id}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('.single-date-select-one-click', { timeout: 10000 });

    const dates = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.single-date-select-one-click.single-date-select-button');
      const dates: string[] = [];

      buttons.forEach(btn => {
        const btnText = btn.textContent || '';
        const dateMatch = btnText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{1,2}),\s*(\d{4})/i);
        if (dateMatch) {
          dates.push(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]} ${dateMatch[4]}`);
        }
      });

      return dates;
    });

    await page.close();
    return dates;
  } catch (err) {
    log(`Warning: Could not discover dates: ${err}`);
    await page.close();
    return [];
  }
}

function aggregateResults(results: { courtId: string; courtName: string; date: string | null; slots: TimeSlot[] }[]): CourtAvailability[] {
  const courtMap = new Map<string, CourtAvailability>();

  for (const result of results) {
    if (!result.date) continue;

    let court = courtMap.get(result.courtId);
    if (!court) {
      court = {
        courtId: result.courtId,
        courtName: result.courtName,
        availability: {}
      };
      courtMap.set(result.courtId, court);
    }

    court.availability[result.date] = result.slots;
  }

  return Array.from(courtMap.values());
}

function aggregateToWeeklyView(courts: CourtAvailability[]) {
  const allDates = new Set<string>();
  const allTimes = new Set<string>();

  courts.forEach(court => {
    Object.keys(court.availability || {}).forEach(date => {
      allDates.add(date);
      (court.availability[date] || []).forEach(slot => {
        allTimes.add(slot.time);
      });
    });
  });

  const sortedDates = Array.from(allDates).sort((a, b) => {
    const parseDate = (d: string) => {
      const months: Record<string, number> = {
        JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
        JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11
      };
      const parts = d.toUpperCase().split(' ');
      const month = months[parts[1]] ?? 0;
      const day = parseInt(parts[2]) || 1;
      const year = parseInt(parts[3]) || 2026;
      return new Date(year, month, day).getTime();
    };
    return parseDate(a) - parseDate(b);
  });

  const sortedTimes = Array.from(allTimes).sort((a, b) => {
    const parseTime = (t: string) => {
      const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return 0;
      let hours = parseInt(match[1]);
      const mins = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return hours * 60 + mins;
    };
    return parseTime(a) - parseTime(b);
  });

  const matrix: Record<string, Record<string, { spots: number; courtsAvailable: number; available: boolean }>> = {};

  sortedTimes.forEach(time => {
    matrix[time] = {};
    sortedDates.forEach(date => {
      let totalSpots = 0;
      let courtsWithSlot = 0;

      courts.forEach(court => {
        const slots = court.availability?.[date] || [];
        const slot = slots.find(s => s.time === time);
        if (slot) {
          totalSpots += slot.spots;
          courtsWithSlot++;
        }
      });

      matrix[time][date] = {
        spots: totalSpots,
        courtsAvailable: courtsWithSlot,
        available: totalSpots > 0
      };
    });
  });

  return {
    dates: sortedDates,
    times: sortedTimes,
    matrix
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = (searchParams.get('sport') || 'tennis') as Sport;

  const config = SPORTS_CONFIG[sport];
  if (!config) {
    return NextResponse.json({ error: `Unknown sport: ${sport}` }, { status: 400 });
  }

  const { courts } = config;
  const startTime = Date.now();

  log('════════════════════════════════════════════════════════════════');
  log(`Starting ${sport.toUpperCase()} court availability scrape`);
  log('════════════════════════════════════════════════════════════════');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    log('Discovering available dates...');
    const availableDates = await discoverDates(browser, courts);
    log(`Found ${availableDates.length} dates:`);
    availableDates.forEach((d, i) => {
      const parts = d.split(' ');
      log(`  ${i + 1}. ${parts[0].substring(0, 3)} ${parts[1].substring(0, 3)} ${parts[2]}`);
    });

    if (availableDates.length === 0) {
      throw new Error('No dates found on the page');
    }

    const tasks: { court: Court; dateIndex: number }[] = [];
    for (const court of courts) {
      for (let dateIndex = 0; dateIndex < availableDates.length; dateIndex++) {
        tasks.push({ court, dateIndex });
      }
    }

    log('');
    log(`Created ${tasks.length} scrape tasks (${courts.length} courts × ${availableDates.length} dates)`);
    log('────────────────────────────────────────────────────────────────');
    log('');

    const CONCURRENCY = 8;
    const results: { courtId: string; courtName: string; date: string | null; slots: TimeSlot[] }[] = [];

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      const batchNum = Math.floor(i / CONCURRENCY) + 1;
      const totalBatches = Math.ceil(tasks.length / CONCURRENCY);

      log(`── Batch ${batchNum}/${totalBatches} ──`);

      const batchResults = await Promise.all(
        batch.map(task =>
          scrapeCourtDate(browser, task.court.id, task.court.name, task.dateIndex)
        )
      );

      results.push(...batchResults);
      log('');
    }

    log('────────────────────────────────────────────────────────────────');

    await browser.close();

    const courtsData = aggregateResults(results);
    const weeklyView = aggregateToWeeklyView(courtsData);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const successCount = results.filter(r => r.date !== null).length;

    log(`Scrape complete!`);
    log(`  Total time:  ${duration}s`);
    log(`  Successful:  ${successCount}/${tasks.length} tasks`);
    log(`  Dates found: ${weeklyView.dates.length}`);
    log(`  Time slots:  ${weeklyView.times.length}`);
    log('════════════════════════════════════════════════════════════════');

    return NextResponse.json({
      sport,
      courts: courtsData,
      weeklyView,
      timestamp: new Date().toISOString(),
      scrapeDuration: `${duration}s`,
      stats: {
        totalTasks: tasks.length,
        successful: successCount,
        dates: weeklyView.dates.length,
        timeSlots: weeklyView.times.length
      }
    });

  } catch (error) {
    await browser.close();
    log(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
