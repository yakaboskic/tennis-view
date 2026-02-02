import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(
      'https://membership.gocrimson.com/Program/GetProgramDetails?courseId=3b92dfe2-3eb0-4860-b07f-f058e0e18019',
      { waitUntil: 'networkidle0', timeout: 30000 }
    );

    // Wait for page to fully load
    await new Promise(r => setTimeout(r, 3000));

    // Get all clickable elements that might be date-related
    const datePickerInfo = await page.evaluate(() => {
      const info: {
        allButtons: { tag: string; classes: string; text: string; id: string }[];
        dateLikeElements: { tag: string; classes: string; text: string; parent: string }[];
        selectDateButton: string | null;
        datePickerHTML: string | null;
      } = {
        allButtons: [],
        dateLikeElements: [],
        selectDateButton: null,
        datePickerHTML: null
      };

      // Find all buttons and clickable elements
      document.querySelectorAll('button, [role="button"], a, [onclick]').forEach(el => {
        const text = el.textContent?.trim().substring(0, 100) || '';
        info.allButtons.push({
          tag: el.tagName,
          classes: el.className,
          text: text,
          id: el.id || ''
        });

        if (text.includes('SELECT DATE') || text.includes('Select Date')) {
          info.selectDateButton = el.outerHTML.substring(0, 500);
        }
      });

      // Find elements containing date-like text
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN)\s/i) ||
            text.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*\d/i) ||
            text.match(/^\d{1,2}$/)) {
          if (el.children.length === 0) { // Only leaf nodes
            info.dateLikeElements.push({
              tag: el.tagName,
              classes: el.className,
              text: text,
              parent: el.parentElement?.className || ''
            });
          }
        }
      });

      // Try to find the date picker container
      const datePicker = document.querySelector('[class*="date"], [class*="calendar"], [class*="picker"], [class*="selector"]');
      if (datePicker) {
        info.datePickerHTML = datePicker.outerHTML.substring(0, 2000);
      }

      // Also look for the specific date section
      const sections = document.querySelectorAll('h3, h4, h5, .section-header');
      sections.forEach(section => {
        if (section.textContent?.includes('Select Date')) {
          const parent = section.parentElement;
          if (parent) {
            info.datePickerHTML = parent.outerHTML.substring(0, 3000);
          }
        }
      });

      return info;
    });

    // Also get the visible text around "Select Date"
    const pageText = await page.evaluate(() => {
      const text = document.body.innerText;
      const selectDateIndex = text.indexOf('Select Date');
      if (selectDateIndex !== -1) {
        return text.substring(selectDateIndex, selectDateIndex + 1000);
      }
      return text.substring(0, 2000);
    });

    // Try to find and click the SELECT DATE button
    const selectDateClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [role="button"], a');
      for (const btn of buttons) {
        if (btn.textContent?.includes('SELECT DATE')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    // Wait and see if a calendar appears
    await new Promise(r => setTimeout(r, 2000));

    const afterClickText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 3000);
    });

    // Look for calendar/date picker after clicking
    const calendarHTML = await page.evaluate(() => {
      const calendar = document.querySelector('[class*="calendar"], [class*="datepicker"], .modal, [class*="popup"]');
      if (calendar) {
        return calendar.outerHTML.substring(0, 3000);
      }
      return null;
    });

    await browser.close();

    return NextResponse.json({
      datePickerInfo,
      pageText,
      selectDateClicked,
      afterClickText,
      calendarHTML
    });

  } catch (error) {
    await browser.close();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
