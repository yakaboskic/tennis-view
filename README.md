# Tennis View

A web application for viewing Harvard Recreation tennis and squash court availability at a glance.

## Why?

The official Harvard Rec booking site only shows one court at a time, requiring you to click through each court and date individually to find open slots. Tennis View scrapes all courts simultaneously and displays everything in a single weekly matrix, making it easy to spot availability across all courts and dates.

## Features

- **Weekly Matrix View** - See all time slots across all dates in one table
- **Aggregated Availability** - Each cell shows total spots available across all courts
- **Court Details** - Click any cell to see which specific courts have openings
- **Direct Booking Links** - One-click links to the Harvard Rec booking page for each court
- **Multi-Sport Support** - Toggle between Tennis (6 courts) and Squash (3 courts)
- **Smart Caching** - Switching sports uses cached data; no unnecessary re-fetching
- **Auto-Refresh** - Automatically refreshes at :01 and :31 past each hour (when Harvard opens new slots)
- **Availability Filter** - Option to hide fully-booked time slots

## Screenshot

The interface displays a color-coded grid:
- 🟢 **Green** - Many spots available (3+)
- 🟡 **Amber** - Limited availability (1-2 spots)
- 🔴 **Red** - Full (0 spots)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tennis-view.git
cd tennis-view

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

## How It Works

1. **Scraping** - The backend uses Puppeteer to load the Harvard Rec booking pages in a headless browser
2. **Parallel Processing** - All courts and dates are scraped concurrently (in batches of 8) for speed
3. **Aggregation** - Results are combined into a weekly matrix showing total availability per time slot
4. **Caching** - The frontend caches results per sport, so switching between tennis/squash is instant

## Tech Stack

- [Next.js 16](https://nextjs.org/) - React framework with App Router
- [Tailwind CSS 4](https://tailwindcss.com/) - Styling
- [Puppeteer](https://pptr.dev/) - Headless browser for scraping
- [Radix UI](https://www.radix-ui.com/) - Accessible UI primitives
- [shadcn/ui](https://ui.shadcn.com/) - UI components

## Configuration

Court IDs and sport configuration are defined in `src/lib/courts.ts`. To add new courts or sports, update the `SPORTS_CONFIG` object with the appropriate `courseId` values from the Harvard Rec booking URLs.

## Limitations

- Requires Puppeteer/Chromium, so hosting options are limited to platforms that support headless browsers
- Scraping takes 15-30 seconds depending on the number of courts and dates
- Only works for Harvard Recreation facilities that use the same booking system

## License

MIT
