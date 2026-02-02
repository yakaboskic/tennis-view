# CLAUDE.md

This file provides guidance to Claude Code when working on this repository.

## Project Overview

Tennis View is a Next.js web application that scrapes and displays Harvard Recreation court availability for tennis and squash. It provides a better viewing experience than the official booking site by showing all courts and dates in a single weekly matrix view.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 with `@tailwindcss/postcss`
- **UI Components**: shadcn/ui (Dialog, Badge, Button) built on Radix UI
- **Scraping**: Puppeteer for headless browser automation

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

### API Routes

- `/api/availability?sport=tennis|squash` - Scrapes court availability using Puppeteer
  - Discovers available dates from the booking page
  - Scrapes all courts × all dates in parallel (batches of 8)
  - Returns per-court data and an aggregated weekly matrix view

### Frontend

- Single page app (`/`) with client-side state management
- Caches results per sport (switching sports uses cached data)
- Auto-refreshes at :01 and :31 past each hour (when Harvard opens new slots)
- Click any cell to see which specific courts have availability

### Key Files

- `src/lib/courts.ts` - Sport/court configuration (IDs and names)
- `src/app/api/availability/route.ts` - Puppeteer scraping logic
- `src/app/page.tsx` - Main frontend with table, dialog, and caching

## Scraping Details

The Harvard Rec booking site (`membership.gocrimson.com`) uses JavaScript-rendered content. The scraper:

1. Navigates to each court's booking page
2. Extracts date labels from `.single-date-select-one-click.single-date-select-button` elements
3. Clicks each date button and waits for content to load
4. Parses time slots and spot availability from page text
5. Aggregates results into a weekly matrix (times × dates)

## Adding New Sports

To add a new sport, update `src/lib/courts.ts`:

```typescript
export const SPORTS_CONFIG: Record<Sport, { name: string; courts: Court[] }> = {
  // ... existing sports
  newsport: {
    name: 'New Sport',
    courts: [
      { id: 'uuid-from-booking-url', name: 'Court Name' },
    ],
  },
};
```

The court ID is the `courseId` parameter from the Harvard Rec booking URL.
